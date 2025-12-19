// Type definitions for FileContextTracker
import type { Host } from '@shared/WebviewMessage'
import { Todo } from '../../../shared/todo/TodoSchemas'
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

export interface TaskMetadata {
  hosts: Host[]
  files_in_context: FileMetadataEntry[]
  model_usage: ModelMetadataEntry[]
  todos?: Todo[] // New field, optional to maintain backward compatibility
}

// Helper methods
export class TaskMetadataHelper {
  static createEmptyMetadata(): TaskMetadata {
    return {
      hosts: [],
      files_in_context: [],
      model_usage: [],
      todos: []
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
