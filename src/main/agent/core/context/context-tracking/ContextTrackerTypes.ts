//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

// Type definitions for FileContextTracker
import type { Host } from '@shared/WebviewMessage'
import type { DbAiRequestContext } from '@common/db-ai-types'
import type { TaskWorkspace } from '@shared/task-workspace'
import { Todo } from '../../../shared/todo/TodoSchemas'

// Re-export for backwards-compatibility; existing main-side consumers import
// `TaskWorkspace` from this module today.
export type { TaskWorkspace }
export interface FileMetadataEntry {
  path: string
  record_state: 'active' | 'stale'
  record_source: 'read_tool' | 'user_edited' | 'chaterm_edited' | 'file_mentioned'
  cline_read_date: number | null
  cline_edit_date: number | null
  user_edit_date?: number | null
}

export interface ModelMetadataEntry {
  ts: number
  model_id: string
  model_provider_id: string
  mode: string
}

export interface TaskExperienceLedgerEntry {
  dedupeKey: string
  title: string
  slug: string
  keywords: string[]
  gist: string
  kbRelPath: string
  lastAction: 'new' | 'update'
  contentFingerprint: string
  updatedAt: string
}

export interface TaskMetadata {
  hosts: Host[]
  files_in_context: FileMetadataEntry[]
  model_usage: ModelMetadataEntry[]
  todos?: Todo[]
  experience_ledger?: TaskExperienceLedgerEntry[]
  title?: string
  favorite?: boolean
  /**
   * Workspace a task belongs to. Absent or unknown values are treated as
   * `'server'` by all consumers, which preserves pre-Phase-3 behaviour.
   */
  workspace?: TaskWorkspace
  /**
   * DB-AI connection context captured at task creation for
   * `workspace='database'`. Must be `undefined` when `workspace='server'`.
   */
  db_context?: DbAiRequestContext
}

export interface TaskListItem {
  id: string
  title: string | null
  favorite: boolean
  createdAt: number
  updatedAt: number
  hosts: Array<{ host: string; uuid: string; connection: string }>
}

// Helper methods
export class TaskMetadataHelper {
  static createEmptyMetadata(): TaskMetadata {
    return {
      hosts: [],
      files_in_context: [],
      model_usage: [],
      todos: [],
      experience_ledger: []
    }
  }

  static updateTodos(metadata: TaskMetadata, todos: Todo[]): TaskMetadata {
    return {
      ...metadata,
      todos: todos
    }
  }

  static getTodos(metadata: TaskMetadata): Todo[] {
    return metadata.todos || []
  }
}
