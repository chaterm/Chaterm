//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

// Workspace helpers for Task.
//
// The canonical type definitions and pure helpers live in
// `@shared/task-workspace` so main-process and renderer-visible modules
// (preload type chains through `ContextTrackerTypes.ts`) can share a single
// source of truth without dragging ToolRegistry / parser code into the
// renderer's tsconfig program. This file re-exports those symbols and
// layers workspace-aware tool helpers on top.
//
// Task #11 (this task) only introduces type plumbing and default-'server'
// fallbacks. Policy dispatch methods (approval branching, prompt rendering)
// are filled in by tasks #12 / #17.

import { getAllowedTools, isToolAllowed, type ToolMetadata } from './tool-registry'
import type { TaskWorkspace as SharedTaskWorkspace } from '@shared/task-workspace'

export { DEFAULT_WORKSPACE, hasValidDbContext, normaliseWorkspace, type DbTaskContext, type TaskWorkspace } from '@shared/task-workspace'

/**
 * Return the workspace-visible tool list. Thin wrapper around the registry
 * helper, exposed here so Task/Controller consumers can stay decoupled from
 * the registry's internal layout.
 */
export function toolsForWorkspace(workspace: SharedTaskWorkspace): ToolMetadata[] {
  return getAllowedTools(workspace)
}

/**
 * Whether `toolName` is allowed to run in `workspace`.
 */
export function isWorkspaceToolAllowed(toolName: Parameters<typeof isToolAllowed>[0], workspace: SharedTaskWorkspace): boolean {
  return isToolAllowed(toolName, workspace)
}
