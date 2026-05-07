// Copyright (c) 2025-present, chaterm.ai  All rights reserved.
// This source code is licensed under the GPL-3.0

// Centralized tool registry and workspace-based visibility metadata.
//
// Context: The repo historically tracked tool names in two places -
// `toolUseNames` (assistant-message parser input) and the switch statements
// inside `Task.handleToolUse()` (dispatch/description/auto-approval).
// Phase 3 of the DB-AI plan introduces a second workspace ("database") whose
// visible tool list is a strict subset of the classic server workspace.
// Rather than sprinkle workspace gates throughout the switch cases, we collect
// the authoritative list here. Downstream modules derive from this single
// source of truth:
//   - `toolUseNames` (assistant-message/index.ts) is re-exported from the
//     registry so the parser only recognises known tools.
//   - Task dispatch applies `isToolAllowed(name, workspace)` as the final
//     safety boundary, returning a tool error for any workspace violation.
//   - System prompt rendering filters the documented tool list by workspace
//     (wired up in later tasks).

// NOTE: this module intentionally does not import `ToolUseName` from
// assistant-message; doing so would create a circular dependency because
// assistant-message derives `toolUseNames` from `registeredToolNames` here.
// `ToolParamName` is defined independently in assistant-message and is safe
// to import.
import type { ToolParamName } from '../assistant-message'
import type { TaskWorkspace as SharedTaskWorkspace } from '@shared/task-workspace'

/**
 * Workspace in which a Task operates.
 *
 * Re-exported from `@shared/task-workspace` so `tsconfig.web` type lookups
 * that transit through `ContextTrackerTypes.ts` never pull in assistant-
 * message / tool-registry. See `@shared/task-workspace` for the canonical
 * definition.
 */
export type TaskWorkspace = SharedTaskWorkspace

/**
 * Tool category used for grouping in prompts and logs. Does NOT participate
 * in visibility checks - `allowedIn` is the sole source of truth for that.
 *
 * - `'server'`: tool only makes sense in the server workspace (shell/FS).
 * - `'database'`: tool only makes sense in the database workspace.
 * - `'common'`: tool is workspace-neutral (interaction, knowledge, web, ...).
 */
export type ToolCategory = 'server' | 'database' | 'common'

/**
 * Internal shape used to declare `toolMetadata` without depending on
 * `ToolUseName`. The public `ToolMetadata` type narrows `name` to
 * `ToolUseName` once it is derived below.
 */
interface ToolMetadataDecl {
  readonly name: string
  readonly allowedIn: readonly TaskWorkspace[]
  readonly paramNames: readonly ToolParamName[]
  readonly allowPartial?: boolean
  readonly category: ToolCategory
}

/**
 * Authoritative list of 19 existing tools with their workspace visibility.
 *
 * Visibility is taken from `docs/db-ai-tool-whitelist-decision.md` table 2.1.
 * DB-specific tools (#20+) will be appended by task #16 once their handlers
 * are implemented; this file intentionally only registers tools that have
 * working dispatch handlers today.
 */
const toolMetadataInternal = [
  // Server-only tools: shell execution and local filesystem access. These
  // violate the DB-AI workspace design intent even if they technically would
  // downgrade to local execution (e.g. execute_command without a host).
  {
    name: 'execute_command',
    allowedIn: ['server'],
    paramNames: ['command', 'ip', 'requires_approval', 'interactive', 'depositExperience'],
    category: 'server'
  },
  {
    name: 'write_to_file',
    allowedIn: ['server'],
    paramNames: ['path', 'file_path', 'content', 'diff', 'ip'],
    category: 'server'
  },
  {
    name: 'read_file',
    allowedIn: ['server'],
    paramNames: ['path', 'file_path', 'ip', 'offset', 'limit'],
    category: 'server'
  },
  {
    name: 'ask_followup_question',
    allowedIn: ['server', 'database'],
    paramNames: ['question', 'options', 'response'],
    category: 'common'
  },
  {
    name: 'attempt_completion',
    allowedIn: ['server', 'database'],
    paramNames: ['result', 'command', 'ip', 'depositExperience'],
    allowPartial: true,
    category: 'common'
  },
  {
    name: 'new_task',
    allowedIn: ['server', 'database'],
    paramNames: ['context'],
    category: 'common'
  },
  {
    name: 'condense',
    allowedIn: ['server', 'database'],
    paramNames: ['context'],
    category: 'common'
  },
  {
    name: 'report_bug',
    allowedIn: ['server', 'database'],
    paramNames: ['title', 'what_happened', 'steps_to_reproduce', 'api_request_output', 'additional_context'],
    category: 'common'
  },
  {
    name: 'todo_write',
    allowedIn: ['server', 'database'],
    paramNames: ['todos'],
    category: 'common'
  },
  {
    name: 'todo_read',
    allowedIn: ['server', 'database'],
    paramNames: [],
    category: 'common'
  },
  {
    name: 'glob_search',
    allowedIn: ['server'],
    paramNames: ['pattern', 'file_pattern', 'path', 'ip', 'limit', 'sort'],
    category: 'server'
  },
  {
    name: 'grep_search',
    allowedIn: ['server'],
    paramNames: ['pattern', 'regex', 'path', 'ip', 'include', 'file_pattern', 'case_sensitive', 'context_lines', 'max_matches'],
    category: 'server'
  },
  {
    name: 'use_mcp_tool',
    allowedIn: ['server', 'database'],
    paramNames: ['server_name', 'tool_name', 'arguments'],
    category: 'common'
  },
  {
    name: 'access_mcp_resource',
    allowedIn: ['server', 'database'],
    paramNames: ['server_name', 'uri'],
    category: 'common'
  },
  {
    name: 'use_skill',
    allowedIn: ['server', 'database'],
    paramNames: ['name'],
    category: 'common'
  },
  {
    name: 'summarize_to_knowledge',
    allowedIn: ['server', 'database'],
    paramNames: ['file_name', 'summary'],
    allowPartial: true,
    category: 'common'
  },
  {
    name: 'summarize_to_skill',
    allowedIn: ['server', 'database'],
    paramNames: ['skill_name', 'description', 'content'],
    allowPartial: true,
    category: 'common'
  },
  {
    name: 'kb_search',
    allowedIn: ['server', 'database'],
    paramNames: ['query', 'max_results'],
    category: 'common'
  },
  {
    name: 'web_fetch',
    allowedIn: ['server', 'database'],
    paramNames: ['url', 'extract_mode', 'max_chars'],
    category: 'common'
  },
  // ----- DB-AI workspace tools ----------------------------------------------
  {
    name: 'list_databases',
    allowedIn: ['database'],
    paramNames: [],
    category: 'database'
  },
  {
    name: 'list_schemas',
    allowedIn: ['database'],
    paramNames: ['database'],
    category: 'database'
  },
  {
    name: 'list_tables',
    allowedIn: ['database'],
    paramNames: ['database', 'schema'],
    category: 'database'
  },
  {
    name: 'describe_table',
    allowedIn: ['database'],
    paramNames: ['database', 'schema', 'table'],
    category: 'database'
  },
  {
    name: 'inspect_indexes',
    allowedIn: ['database'],
    paramNames: ['database', 'schema', 'table'],
    category: 'database'
  },
  {
    name: 'sample_rows',
    allowedIn: ['database'],
    paramNames: ['database', 'schema', 'table', 'limit'],
    category: 'database'
  },
  {
    name: 'count_rows',
    allowedIn: ['database'],
    paramNames: ['database', 'schema', 'table', 'exact'],
    category: 'database'
  },
  {
    name: 'explain_plan',
    allowedIn: ['database'],
    paramNames: ['database', 'schema', 'sql'],
    category: 'database'
  },
  {
    name: 'execute_readonly_query',
    allowedIn: ['database'],
    paramNames: ['database', 'schema', 'sql'],
    category: 'database'
  },
  {
    name: 'execute_write_query',
    allowedIn: ['database'],
    paramNames: ['database', 'schema', 'sql'],
    category: 'database'
  },
  {
    name: 'suggest_indexes',
    allowedIn: ['database'],
    paramNames: ['database', 'schema', 'table', 'query_patterns'],
    category: 'database'
  }
] as const satisfies readonly ToolMetadataDecl[]

/**
 * Canonical tool-name union derived from `toolMetadata`.
 * `assistant-message/index.ts` re-exports this as `ToolUseName` to preserve
 * the existing import surface.
 */
export type ToolUseName = (typeof toolMetadataInternal)[number]['name']

/**
 * Static metadata describing a registered tool. Runtime behaviour lives in
 * Task handler methods; this record only captures parser/visibility info.
 */
export interface ToolMetadata {
  /** Canonical tool name used by parser and dispatch. */
  readonly name: ToolUseName
  /**
   * Workspaces in which this tool is visible/allowed. Must be declared
   * explicitly - an empty array means the tool is hidden everywhere, which
   * is intentional to force authors of new tools to make a deliberate
   * decision. See `docs/db-ai-tool-whitelist-decision.md`.
   */
  readonly allowedIn: readonly TaskWorkspace[]
  /** Parameter names the tool accepts. */
  readonly paramNames: readonly ToolParamName[]
  /**
   * Whether the dispatcher may run this tool with `block.partial === true`.
   * Mirrors `isAllowPartialTool()` in task/index.ts (kept in sync).
   */
  readonly allowPartial?: boolean
  /** Grouping category, used by prompts and logs only. */
  readonly category: ToolCategory
}

/** Public, narrowly-typed view of the internal metadata list. */
export const toolMetadata: readonly ToolMetadata[] = toolMetadataInternal as readonly ToolMetadata[]

// Defensive lookup map. Using a Map avoids O(n) scans during dispatch.
const metadataByName: ReadonlyMap<ToolUseName, ToolMetadata> = new Map(toolMetadata.map((m) => [m.name, m]))

/**
 * Return metadata for `name`, or `undefined` if the tool is not registered.
 * Dispatch treats "unregistered" identically to "not allowed in workspace".
 */
export function getToolMetadata(name: ToolUseName): ToolMetadata | undefined {
  return metadataByName.get(name)
}

/** Tools whose `allowedIn` array contains `workspace`. */
export function getAllowedTools(workspace: TaskWorkspace): ToolMetadata[] {
  return toolMetadata.filter((m) => m.allowedIn.includes(workspace))
}

/**
 * Whether `name` is both registered and allowed in `workspace`.
 *
 * Unknown tool names return `false` - callers that already guard against
 * unknown names via the parser will never reach this branch in practice.
 */
export function isToolAllowed(name: ToolUseName, workspace: TaskWorkspace): boolean {
  const meta = metadataByName.get(name)
  if (!meta) return false
  return meta.allowedIn.includes(workspace)
}

/**
 * Canonical list of tool names, derived from `toolMetadata`. Exported so the
 * assistant-message module can re-export it without maintaining a parallel
 * array. Order matches `toolMetadata` declaration order.
 */
export const registeredToolNames: readonly ToolUseName[] = toolMetadata.map((m) => m.name)
