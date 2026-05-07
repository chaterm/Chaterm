// Copyright (c) 2025-present, chaterm.ai  All rights reserved.
// This source code is licensed under the GPL-3.0

// Workspace isolation audit suite (Phase 3 task #19).
//
// This file is a purpose-built AUDIT AGGREGATION of the workspace visibility
// boundary and the `tool.workspace_violation` log contract. Individual pieces
// of this surface are already exercised by:
//   - tool-registry.test.ts      (per-tool whitelist, metadata integrity)
//   - workspace.test.ts          (normaliseWorkspace, hasValidDbContext, ...)
//   - prompt-workspace.test.ts   (system prompt rendering by workspace)
//
// This file intentionally does NOT remove any of those assertions. It
// regroups the workspace-isolation semantics into four auditable buckets
// plus a §10.3 sanitisation bucket so a reviewer can confirm the policy
// in one place:
//   1. server  ← database-only tools denied
//   2. database ← server-only tools denied
//   3. common tools visible in both workspaces
//   4. unregistered tool names hidden from both workspaces
//   5. violation log payload is structured-only (no params, no SQL text)
//
// The production gate lives in `Task.handleToolUse()` (src/main/agent/core/
// task/index.ts); this file simulates the gate with a minimal mock that
// mirrors the real control flow (isToolAllowed pre-check, logger.warn on
// violation, tool error pushed to userMessageContent, no dispatch).

import { describe, expect, it, vi } from 'vitest'

import { getAllowedTools, getToolMetadata, isToolAllowed, toolMetadata } from '../tool-registry'
import type { TaskWorkspace, ToolUseName } from '../tool-registry'

// ---------------------------------------------------------------------------
// Reference lists (pinned by the Phase 3 whitelist decision)
// ---------------------------------------------------------------------------

const SERVER_ONLY_TOOLS: readonly ToolUseName[] = ['execute_command', 'write_to_file', 'read_file', 'glob_search', 'grep_search']

const COMMON_TOOLS: readonly ToolUseName[] = [
  'ask_followup_question',
  'attempt_completion',
  'new_task',
  'condense',
  'report_bug',
  'todo_write',
  'todo_read',
  'use_mcp_tool',
  'access_mcp_resource',
  'use_skill',
  'summarize_to_knowledge',
  'summarize_to_skill',
  'kb_search',
  'web_fetch'
]

const DATABASE_ONLY_TOOLS: readonly ToolUseName[] = [
  'list_databases',
  'list_schemas',
  'list_tables',
  'describe_table',
  'inspect_indexes',
  'sample_rows',
  'count_rows',
  'explain_plan',
  'execute_readonly_query',
  'execute_write_query',
  'suggest_indexes'
]

// ---------------------------------------------------------------------------
// Production-parity mock of the workspace gate in Task.handleToolUse()
// ---------------------------------------------------------------------------

/**
 * Shape of a tool-use block the gate inspects. Intentionally a narrow subset
 * of the real `ToolUse` type; we only care about name + params here.
 */
interface GateBlock {
  name: ToolUseName
  params: Record<string, string>
  partial?: boolean
}

interface ViolationLogCall {
  message: string
  payload: Record<string, unknown>
}

/**
 * Fake Task-like object that exposes the same entry points the production
 * gate reads. Every test constructs one with an explicit workspace and
 * taskId so violation logs are deterministic.
 */
function createFakeTask(workspace: TaskWorkspace, taskId = 'task-audit') {
  const logger = {
    warn: vi.fn<(message: string, payload?: Record<string, unknown>) => void>()
  }
  const responseFormatter = {
    toolError: (msg: string) => `ERR:${msg}`
  }
  const userMessageContent: Array<{ type: 'text'; text: string }> = []
  const dispatched: ToolUseName[] = []

  /**
   * Byte-for-byte mirror of the gate inserted in Task.handleToolUse()
   * before the main dispatch switch. When this is updated in production,
   * the assertion suite below must be updated in lockstep.
   */
  function gate(block: GateBlock): boolean {
    if (!isToolAllowed(block.name, workspace)) {
      logger.warn('Tool blocked by workspace visibility policy', {
        event: 'tool.workspace_violation',
        toolName: block.name,
        workspace,
        taskId
      })
      userMessageContent.push({
        type: 'text',
        text: responseFormatter.toolError(`Tool '${block.name}' is not available in the '${workspace}' workspace.`)
      })
      return false
    }
    dispatched.push(block.name)
    return true
  }

  function violationCalls(): ViolationLogCall[] {
    return logger.warn.mock.calls.map(([message, payload]) => ({
      message: message as string,
      payload: (payload ?? {}) as Record<string, unknown>
    }))
  }

  return { workspace, taskId, logger, userMessageContent, dispatched, gate, violationCalls }
}

// ---------------------------------------------------------------------------
// Bucket 1: server ← DB-only tools denied
// ---------------------------------------------------------------------------

describe('workspace isolation / bucket 1: server workspace denies database-only tools', () => {
  it('each of the 11 DB-only tools returns tool_error and logs workspace_violation', () => {
    const task = createFakeTask('server', 'task-server-1')
    for (const name of DATABASE_ONLY_TOOLS) {
      const allowed = task.gate({ name, params: {} })
      expect(allowed, `${name} must NOT be allowed in server workspace`).toBe(false)
    }

    // Zero DB tools reached dispatch.
    expect(task.dispatched).toEqual([])
    // One tool error pushed per blocked attempt.
    expect(task.userMessageContent).toHaveLength(DATABASE_ONLY_TOOLS.length)
    for (const entry of task.userMessageContent) {
      expect(entry.text).toMatch(/^ERR:Tool '.*' is not available in the 'server' workspace\.$/)
    }
    // One violation log per blocked attempt.
    expect(task.logger.warn).toHaveBeenCalledTimes(DATABASE_ONLY_TOOLS.length)
  })

  it('legitimate server tool after a violation is still dispatched (gate does not cascade-fail)', () => {
    const task = createFakeTask('server')
    task.gate({ name: 'list_databases', params: {} }) // violation
    task.gate({ name: 'execute_command', params: { command: 'ls' } }) // allowed
    expect(task.dispatched).toEqual(['execute_command'])
    expect(task.logger.warn).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Bucket 2: database ← server-only tools denied
// ---------------------------------------------------------------------------

describe('workspace isolation / bucket 2: database workspace denies server-only tools', () => {
  it('each of the 5 server-only tools returns tool_error and logs workspace_violation', () => {
    const task = createFakeTask('database', 'task-db-1')
    for (const name of SERVER_ONLY_TOOLS) {
      const allowed = task.gate({ name, params: { command: 'should-not-leak' } })
      expect(allowed, `${name} must NOT be allowed in database workspace`).toBe(false)
    }

    expect(task.dispatched).toEqual([])
    expect(task.userMessageContent).toHaveLength(SERVER_ONLY_TOOLS.length)
    for (const entry of task.userMessageContent) {
      expect(entry.text).toMatch(/^ERR:Tool '.*' is not available in the 'database' workspace\.$/)
    }
    expect(task.logger.warn).toHaveBeenCalledTimes(SERVER_ONLY_TOOLS.length)
  })

  it('legitimate DB tool after a violation is still dispatched', () => {
    const task = createFakeTask('database')
    task.gate({ name: 'execute_command', params: { command: 'rm -rf /' } }) // violation
    task.gate({ name: 'describe_table', params: { table: 'users' } }) // allowed
    expect(task.dispatched).toEqual(['describe_table'])
    expect(task.logger.warn).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Bucket 3: common tools visible in both workspaces
// ---------------------------------------------------------------------------

describe('workspace isolation / bucket 3: common tools reach dispatch in both workspaces', () => {
  it('every common tool is allowed in workspace=server', () => {
    const task = createFakeTask('server')
    for (const name of COMMON_TOOLS) {
      const allowed = task.gate({ name, params: {} })
      expect(allowed, `${name} should reach dispatch in server`).toBe(true)
    }
    expect(task.dispatched).toEqual([...COMMON_TOOLS])
    expect(task.logger.warn).not.toHaveBeenCalled()
  })

  it('every common tool is allowed in workspace=database', () => {
    const task = createFakeTask('database')
    for (const name of COMMON_TOOLS) {
      const allowed = task.gate({ name, params: {} })
      expect(allowed, `${name} should reach dispatch in database`).toBe(true)
    }
    expect(task.dispatched).toEqual([...COMMON_TOOLS])
    expect(task.logger.warn).not.toHaveBeenCalled()
  })

  it('COMMON_TOOLS matches registry metadata `allowedIn` ⊇ both workspaces', () => {
    for (const name of COMMON_TOOLS) {
      const meta = getToolMetadata(name)
      expect(meta, `metadata missing for common tool ${name}`).toBeDefined()
      expect(meta!.allowedIn).toContain('server')
      expect(meta!.allowedIn).toContain('database')
    }
  })
})

// ---------------------------------------------------------------------------
// Bucket 4: unregistered tool names hidden from both workspaces
// ---------------------------------------------------------------------------

describe('workspace isolation / bucket 4: unregistered tool names are hidden from both workspaces', () => {
  const fakeNames = ['this_tool_does_not_exist', 'drop_all_tables'] as const

  it('isToolAllowed returns false for unknown tools in either workspace', () => {
    for (const name of fakeNames) {
      expect(isToolAllowed(name as ToolUseName, 'server')).toBe(false)
      expect(isToolAllowed(name as ToolUseName, 'database')).toBe(false)
    }
  })

  it('getAllowedTools does not surface unknown names in either workspace', () => {
    const serverNames = new Set(getAllowedTools('server').map((m) => m.name))
    const dbNames = new Set(getAllowedTools('database').map((m) => m.name))
    for (const name of fakeNames) {
      expect(serverNames.has(name as ToolUseName)).toBe(false)
      expect(dbNames.has(name as ToolUseName)).toBe(false)
    }
  })

  it('execute_readonly_query is registered and database-only', () => {
    const registered = toolMetadata.find((m) => m.name === ('execute_readonly_query' as ToolUseName))
    expect(registered).toBeDefined()
    expect(registered?.allowedIn).toEqual(['database'])
  })
})

// ---------------------------------------------------------------------------
// Bucket 5: §10.3 sanitisation - violation log payload is structured-only
// ---------------------------------------------------------------------------

describe('workspace isolation / bucket 5: §10.3 violation log sanitisation', () => {
  const ALLOWED_LOG_FIELDS = new Set(['event', 'toolName', 'workspace', 'taskId'])

  it('log payload contains exactly the structured fields {event, toolName, workspace, taskId}', () => {
    const task = createFakeTask('database', 'task-sanitise')
    task.gate({
      name: 'execute_command',
      params: {
        // Craft params that would be embarrassing to leak:
        command: 'mysql -uroot -pSUPER_SECRET_VALUE -h db.internal "SELECT * FROM api_keys"',
        ip: '10.0.0.7',
        requires_approval: 'false',
        interactive: 'false'
      }
    })

    const calls = task.violationCalls()
    expect(calls).toHaveLength(1)
    const { message, payload } = calls[0]
    expect(message).toBe('Tool blocked by workspace visibility policy')
    expect(payload).toEqual({
      event: 'tool.workspace_violation',
      toolName: 'execute_command',
      workspace: 'database',
      taskId: 'task-sanitise'
    })
    // Strict key whitelist - prevents accidental regression where someone
    // adds `{ ...params }` or `block` to the log call.
    const keys = Object.keys(payload)
    for (const key of keys) {
      expect(ALLOWED_LOG_FIELDS.has(key), `unexpected log field '${key}' - §10.3 forbids leaking beyond the whitelist`).toBe(true)
    }
    expect(new Set(keys)).toEqual(ALLOWED_LOG_FIELDS)
  })

  it('no credential-like substring from params appears in the log payload (case-insensitive scan)', () => {
    const task = createFakeTask('database')
    const sensitiveMarkers = ['SUPER_SECRET_VALUE', '10.0.0.7', 'api_keys', 'pSUPER_SECRET']
    task.gate({
      name: 'execute_command',
      params: {
        command: `mysql -uroot -p${sensitiveMarkers[0]} -h ${sensitiveMarkers[1]} "SELECT * FROM ${sensitiveMarkers[2]}"`,
        ip: sensitiveMarkers[1]
      }
    })

    const serialised = JSON.stringify(task.violationCalls()).toLowerCase()
    for (const marker of sensitiveMarkers) {
      expect(serialised, `sensitive marker '${marker}' leaked into violation log`).not.toContain(marker.toLowerCase())
    }
  })

  it('DB-tool violations do not leak SQL text or schema/table identifiers into the log', () => {
    const task = createFakeTask('server') // DB tool in server workspace -> violation
    const sensitiveSql = "SELECT password_hash FROM users WHERE email='ceo@example.com'"
    task.gate({
      name: 'explain_plan',
      params: {
        database: 'prod_hr',
        schema: 'confidential',
        sql: sensitiveSql
      }
    })

    const serialised = JSON.stringify(task.violationCalls())
    expect(serialised).not.toContain(sensitiveSql)
    expect(serialised).not.toContain('password_hash')
    expect(serialised).not.toContain('ceo@example.com')
    expect(serialised).not.toContain('prod_hr')
    expect(serialised).not.toContain('confidential')
  })

  it('tool error text returned to the model is generic - it names the tool but does not echo params', () => {
    const task = createFakeTask('database')
    task.gate({
      name: 'read_file',
      params: { path: '/etc/shadow', file_path: '/etc/shadow' }
    })
    expect(task.userMessageContent).toHaveLength(1)
    const text = task.userMessageContent[0].text
    expect(text).toContain("Tool 'read_file'")
    expect(text).not.toContain('/etc/shadow')
  })
})

// ---------------------------------------------------------------------------
// Cross-cutting audit invariant
// ---------------------------------------------------------------------------

describe('workspace isolation / invariant: registry partition covers every workspace', () => {
  it('server workspace = SERVER_ONLY_TOOLS + COMMON_TOOLS (exact partition)', () => {
    const actual = new Set(getAllowedTools('server').map((m) => m.name))
    const expected = new Set<string>([...SERVER_ONLY_TOOLS, ...COMMON_TOOLS])
    expect(actual).toEqual(expected)
  })

  it('database workspace = COMMON_TOOLS + DATABASE_ONLY_TOOLS (exact partition)', () => {
    const actual = new Set(getAllowedTools('database').map((m) => m.name))
    const expected = new Set<string>([...COMMON_TOOLS, ...DATABASE_ONLY_TOOLS])
    expect(actual).toEqual(expected)
  })

  it('SERVER_ONLY_TOOLS and DATABASE_ONLY_TOOLS are disjoint', () => {
    const intersection = SERVER_ONLY_TOOLS.filter((name) => (DATABASE_ONLY_TOOLS as readonly string[]).includes(name))
    expect(intersection).toEqual([])
  })
})
