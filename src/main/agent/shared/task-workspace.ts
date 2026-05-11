//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

// Types-only module for Task workspace identity.
//
// Lives under `agent/shared/` so both main-process code (Task, Controller,
// ToolRegistry) and renderer-side consumers that reach this file through
// preload type chains (e.g. via `ContextTrackerTypes.ts` → preload
// `index.d.ts`) can import from a single source of truth.
//
// Crucially, this module imports **no other main-only files** - emitting a
// pure type surface avoids dragging `assistant-message` or `tool-registry`
// into `tsconfig.web`'s program via transitive type lookups.

import type { DbAiRequestContext } from '@common/db-ai-types'

/**
 * Workspace a Task executes in.
 *
 * - `'server'`: classic SSH/terminal workspace. Default for every historical
 *   task and the only workspace that sees shell / filesystem tools.
 * - `'database'`: DB-AI ChatBot workspace. Sees a strict subset of common
 *   tools plus DB-specific ones (registered by task #16).
 */
export type TaskWorkspace = 'server' | 'database'

/**
 * DB-AI connection context attached to a task running in
 * `workspace === 'database'`. Must be `undefined` for the server workspace.
 *
 * Alias of the shared IPC `DbAiRequestContext` so Task plumbing stays in
 * lockstep with the single-turn DB-AI handlers; kept as a named alias so
 * future Task-only extensions (cached schema digest, dialect preference,
 * display name, etc.) can diverge without widening the IPC shape.
 */
export type DbTaskContext = DbAiRequestContext

/**
 * Canonical default for tasks whose workspace was not explicitly set.
 * The whole Phase 3 design hinges on this being `'server'` - existing tasks
 * loaded from storage before the workspace migration must continue to behave
 * exactly as before.
 */
export const DEFAULT_WORKSPACE: TaskWorkspace = 'server'

/**
 * Coerce an untrusted value (usually deserialised JSON or legacy metadata)
 * into a valid `TaskWorkspace`. Anything the migration / older code did not
 * emit falls back to `'server'`.
 */
export function normaliseWorkspace(value: unknown): TaskWorkspace {
  return value === 'database' ? 'database' : DEFAULT_WORKSPACE
}

/**
 * Narrow type guard: whether `ctx` carries the minimum fields required to
 * run a DB-AI workspace. Used by Task/Controller when reading metadata from
 * storage to decide whether to honour the persisted workspace or fall back.
 */
export function hasValidDbContext(ctx: unknown): ctx is DbTaskContext {
  if (!ctx || typeof ctx !== 'object') return false
  const candidate = ctx as Record<string, unknown>
  return typeof candidate.assetId === 'string' && (candidate.dbType === 'mysql' || candidate.dbType === 'postgresql')
}
