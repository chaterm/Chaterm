// Copyright (c) 2025-present, chaterm.ai  All rights reserved.
// This source code is licensed under the GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toolMetadata, getAllowedTools, getToolMetadata, isToolAllowed, registeredToolNames, type TaskWorkspace } from '../tool-registry'
import { toolUseNames, type ToolUseName } from '../../assistant-message'

// Authoritative reference of the 19 existing tools and their expected
// workspace visibility, derived from `docs/db-ai-tool-whitelist-decision.md`
// table 2.1. Any drift between the registry and this table will fail the
// corresponding test and force a conscious, documented update.
const expectedVisibility: Record<ToolUseName, readonly TaskWorkspace[]> = {
  execute_command: ['server'],
  write_to_file: ['server'],
  read_file: ['server'],
  glob_search: ['server'],
  grep_search: ['server'],
  ask_followup_question: ['server', 'database'],
  attempt_completion: ['server', 'database'],
  new_task: ['server', 'database'],
  condense: ['server', 'database'],
  report_bug: ['server', 'database'],
  todo_write: ['server', 'database'],
  todo_read: ['server', 'database'],
  use_mcp_tool: ['server', 'database'],
  access_mcp_resource: ['server', 'database'],
  use_skill: ['server', 'database'],
  summarize_to_knowledge: ['server', 'database'],
  summarize_to_skill: ['server', 'database'],
  kb_search: ['server', 'database'],
  web_fetch: ['server', 'database'],
  // DB-AI tools.
  list_databases: ['database'],
  list_schemas: ['database'],
  list_tables: ['database'],
  describe_table: ['database'],
  inspect_indexes: ['database'],
  sample_rows: ['database'],
  count_rows: ['database'],
  explain_plan: ['database'],
  execute_readonly_query: ['database'],
  execute_write_query: ['database'],
  suggest_indexes: ['database']
}

const serverOnlyTools: readonly ToolUseName[] = ['execute_command', 'write_to_file', 'read_file', 'glob_search', 'grep_search']

const commonTools: readonly ToolUseName[] = [
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

const databaseOnlyTools: readonly ToolUseName[] = [
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

describe('ToolRegistry - metadata and name list', () => {
  it('toolUseNames (assistant-message) is derived from registeredToolNames (registry)', () => {
    // Both arrays should reference the exact same tool names in the exact
    // same order - there is no room for drift between parser and dispatch.
    expect([...toolUseNames]).toEqual([...registeredToolNames])
  })

  it('toolUseNames is the projection of toolMetadata.map(name)', () => {
    expect([...toolUseNames]).toEqual(toolMetadata.map((m) => m.name))
  })

  it('registers 19 pre-existing + 11 DB-AI tools = 30 total', () => {
    expect(toolMetadata).toHaveLength(30)
  })

  it('has no duplicate tool names', () => {
    const names = toolMetadata.map((m) => m.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('declares allowedIn for every registered tool (no implicit-empty)', () => {
    for (const m of toolMetadata) {
      expect(Array.isArray(m.allowedIn)).toBe(true)
      expect(m.allowedIn.length).toBeGreaterThan(0)
    }
  })
})

describe('ToolRegistry - per-tool whitelist (table 2.1)', () => {
  for (const [name, allowed] of Object.entries(expectedVisibility) as [ToolUseName, readonly TaskWorkspace[]][]) {
    it(`${name} is visible in exactly ${JSON.stringify(allowed)}`, () => {
      const meta = getToolMetadata(name)
      expect(meta, `metadata missing for ${name}`).toBeDefined()
      expect([...(meta!.allowedIn as readonly TaskWorkspace[])].sort()).toEqual([...allowed].sort())
    })
  }
})

describe('ToolRegistry - getAllowedTools()', () => {
  it('returns all 19 server+common tools for workspace=server (DB tools hidden)', () => {
    const serverTools = getAllowedTools('server')
    expect(serverTools).toHaveLength(19)
    const names = new Set(serverTools.map((m) => m.name))
    for (const name of [...serverOnlyTools, ...commonTools]) {
      expect(names.has(name)).toBe(true)
    }
    for (const dbOnly of databaseOnlyTools) {
      expect(names.has(dbOnly), `DB-only tool ${dbOnly} must not appear in server workspace`).toBe(false)
    }
  })

  it('returns common + DB tools for workspace=database, with server-only tools hidden', () => {
    const dbTools = getAllowedTools('database')
    expect(dbTools).toHaveLength(commonTools.length + databaseOnlyTools.length)
    const names = new Set(dbTools.map((m) => m.name))
    for (const common of commonTools) {
      expect(names.has(common), `expected common tool ${common} visible in database`).toBe(true)
    }
    for (const dbOnly of databaseOnlyTools) {
      expect(names.has(dbOnly), `expected DB tool ${dbOnly} visible in database`).toBe(true)
    }
    for (const serverOnly of serverOnlyTools) {
      expect(names.has(serverOnly), `unexpected server-only tool ${serverOnly} visible in database`).toBe(false)
    }
  })
})

describe('ToolRegistry - isToolAllowed()', () => {
  it('server-only tools are allowed in server and rejected in database', () => {
    for (const name of serverOnlyTools) {
      expect(isToolAllowed(name, 'server'), `${name} should be allowed in server`).toBe(true)
      expect(isToolAllowed(name, 'database'), `${name} should be blocked in database`).toBe(false)
    }
  })

  it('common tools are allowed in both server and database', () => {
    for (const name of commonTools) {
      expect(isToolAllowed(name, 'server'), `${name} should be allowed in server`).toBe(true)
      expect(isToolAllowed(name, 'database'), `${name} should be allowed in database`).toBe(true)
    }
  })

  it('database-only tools are allowed in database and rejected in server', () => {
    for (const name of databaseOnlyTools) {
      expect(isToolAllowed(name, 'database'), `${name} should be allowed in database`).toBe(true)
      expect(isToolAllowed(name, 'server'), `${name} should be blocked in server`).toBe(false)
    }
  })

  it('returns false for unknown tool names', () => {
    expect(isToolAllowed('this_tool_does_not_exist' as ToolUseName, 'server')).toBe(false)
    expect(isToolAllowed('this_tool_does_not_exist' as ToolUseName, 'database')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Server-behaviour regression: simulate the workspace gate that Task.handleToolUse
// applies before the main dispatch switch. The regression goal is to confirm
// that NO pre-existing server tool is blocked by the new gate when the Task
// is running in `workspace='server'` (the current default).
// ---------------------------------------------------------------------------

interface MockBlock {
  name: ToolUseName
  params: Record<string, string>
  partial: boolean
}

interface MockTask {
  workspace: TaskWorkspace
  userMessageContent: Array<{ type: 'text'; text: string }>
  dispatched: ToolUseName[]
  logger: { warn: ReturnType<typeof vi.fn> }
  simulateDispatch: (block: MockBlock) => void
}

function createMockTask(workspace: TaskWorkspace): MockTask {
  const warn = vi.fn()
  const task: MockTask = {
    workspace,
    userMessageContent: [],
    dispatched: [],
    logger: { warn },
    simulateDispatch(block: MockBlock) {
      // Mirrors the pre-switch workspace gate inserted in Task.handleToolUse.
      if (!isToolAllowed(block.name, this.workspace)) {
        warn('Tool blocked by workspace visibility policy', {
          event: 'tool.workspace_violation',
          toolName: block.name,
          workspace: this.workspace
        })
        this.userMessageContent.push({
          type: 'text',
          text: `ERR:Tool '${block.name}' is not available in the '${this.workspace}' workspace.`
        })
        return
      }
      // When allowed, record the dispatch to emulate the case-branch entry.
      this.dispatched.push(block.name)
    }
  }
  return task
}

describe('ToolRegistry - server workspace behaviour regression', () => {
  let task: MockTask

  beforeEach(() => {
    task = createMockTask('server')
  })

  it('all 19 server+common tools reach dispatch in workspace=server; DB-only tools are blocked', () => {
    for (const m of toolMetadata) {
      task.simulateDispatch({ name: m.name, params: {}, partial: false })
    }
    // Server-only + common tools dispatch. DB-only tools are blocked by the
    // workspace gate and never reach the switch.
    const expectedDispatched = toolMetadata.filter((m) => m.allowedIn.includes('server')).map((m) => m.name)
    expect(task.dispatched).toEqual(expectedDispatched)
    expect(task.userMessageContent).toHaveLength(databaseOnlyTools.length)
    expect(task.logger.warn).toHaveBeenCalledTimes(databaseOnlyTools.length)
  })

  it('server-only tools are blocked in workspace=database with structured log', () => {
    const dbTask = createMockTask('database')
    for (const name of serverOnlyTools) {
      dbTask.simulateDispatch({ name, params: {}, partial: false })
    }
    expect(dbTask.dispatched).toEqual([])
    expect(dbTask.userMessageContent).toHaveLength(serverOnlyTools.length)
    expect(dbTask.logger.warn).toHaveBeenCalledTimes(serverOnlyTools.length)
    // Verify the log payload contains the violation event name and does NOT
    // leak tool parameters (log must use safe fields only).
    for (const call of dbTask.logger.warn.mock.calls) {
      const payload = call[1] as { event: string; toolName: string; workspace: TaskWorkspace }
      expect(payload.event).toBe('tool.workspace_violation')
      expect(serverOnlyTools).toContain(payload.toolName)
      expect(payload.workspace).toBe('database')
      // No params field should ever be present.
      expect(Object.prototype.hasOwnProperty.call(payload, 'params')).toBe(false)
    }
  })
})
