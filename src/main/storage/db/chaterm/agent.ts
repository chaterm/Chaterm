import Database from 'better-sqlite3'

import { createLogger } from '@logging'

const logger = createLogger('db')

export async function deleteChatermHistoryByTaskIdLogic(db: Database.Database, taskId: string): Promise<void> {
  try {
    db.prepare(`DELETE FROM agent_api_conversation_history_v1 WHERE task_id = ?`).run(taskId)
    db.prepare(`DELETE FROM agent_ui_messages_v1 WHERE task_id = ?`).run(taskId)
    db.prepare(`DELETE FROM agent_task_metadata_v1 WHERE task_id = ?`).run(taskId)
    db.prepare(`DELETE FROM agent_context_history_v1 WHERE task_id = ?`).run(taskId)
  } catch (error) {
    logger.error('Failed to delete API conversation history', { error: error instanceof Error ? error.message : String(error) })
  }
}

export async function getApiConversationHistoryLogic(db: Database.Database, taskId: string): Promise<any[]> {
  try {
    const stmt = db.prepare(`
        SELECT content_data, role, content_type, tool_use_id, sequence_order, message_index
        FROM agent_api_conversation_history_v1 
        WHERE task_id = ? 
        ORDER BY sequence_order ASC
      `)
    const rows = stmt.all(taskId)

    // Refactor to Anthropic.MessageParam format
    const messages: any[] = []
    const messageMap = new Map()

    for (const row of rows) {
      const contentData = JSON.parse(row.content_data)

      if (row.role === 'user' || row.role === 'assistant') {
        // Use message_index to group content blocks of the same message
        // Fall back to sequence_order for backward compatibility with old data
        const msgIdx = row.message_index ?? row.sequence_order
        const messageKey = `${row.role}_${msgIdx}`
        let existingMessage = messageMap.get(messageKey)

        if (!existingMessage) {
          existingMessage = { role: row.role, content: [] }
          messageMap.set(messageKey, existingMessage)
          messages.push(existingMessage)
        }

        if (row.content_type === 'text') {
          existingMessage.content.push({ type: 'text', text: contentData.text })
        } else if (row.content_type === 'tool_use') {
          existingMessage.content.push({
            type: 'tool_use',
            id: row.tool_use_id,
            name: contentData.name,
            input: contentData.input
          })
        } else if (row.content_type === 'tool_result') {
          existingMessage.content.push({
            type: 'tool_result',
            tool_use_id: row.tool_use_id,
            content: contentData.content,
            is_error: contentData.is_error
          })
        }
      }
    }

    return messages
  } catch (error) {
    logger.error('Failed to get API conversation history', { error: error instanceof Error ? error.message : String(error) })
    return []
  }
}

export async function saveApiConversationHistoryLogic(db: Database.Database, taskId: string, apiConversationHistory: any[]): Promise<void> {
  try {
    // First clear existing records (outside transaction)
    const deleteStmt = db.prepare('DELETE FROM agent_api_conversation_history_v1 WHERE task_id = ?')
    deleteStmt.run(taskId)

    // Then insert all records in a new transaction
    db.transaction(() => {
      const insertStmt = db.prepare(`
          INSERT INTO agent_api_conversation_history_v1 
          (task_id, ts, role, content_type, content_data, tool_use_id, sequence_order, message_index)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)

      let sequenceOrder = 0
      let messageIndex = 0
      const now = Date.now()

      for (const message of apiConversationHistory) {
        if (Array.isArray(message.content)) {
          for (const content of message.content) {
            const contentType = content.type
            let contentData = {}
            let toolUseId = null

            if (content.type === 'text') {
              contentData = { text: content.text }
            } else if (content.type === 'tool_use') {
              contentData = { name: content.name, input: content.input }
              toolUseId = content.id
            } else if (content.type === 'tool_result') {
              contentData = { content: content.content, is_error: content.is_error }
              toolUseId = content.tool_use_id
            }

            // message_index groups content blocks of the same message
            insertStmt.run(taskId, now, message.role, contentType, JSON.stringify(contentData), toolUseId, sequenceOrder++, messageIndex)
          }
        } else {
          // Handle simple text messages
          insertStmt.run(taskId, now, message.role, 'text', JSON.stringify({ text: message.content }), null, sequenceOrder++, messageIndex)
        }
        messageIndex++
      }
    })()
  } catch (error) {
    logger.error('Failed to save API conversation history', { error: error instanceof Error ? error.message : String(error) })
    throw error // Re-throw the error to be caught by the IPC handler
  }
}

// Agent UI message related methods
export async function getSavedChatermMessagesLogic(db: Database.Database, taskId: string): Promise<any[]> {
  try {
    const stmt = db.prepare(`
        SELECT ts, type, ask_type, say_type, text, content_parts, reasoning, images, partial,
               last_checkpoint_hash, is_checkpoint_checked_out, is_operation_outside_workspace,
               conversation_history_index, conversation_history_deleted_range, mcp_tool_call_data
        FROM agent_ui_messages_v1
        WHERE task_id = ?
        ORDER BY ts ASC
      `)
    const rows = stmt.all(taskId)

    return rows.map((row) => ({
      ts: row.ts,
      type: row.type,
      ask: row.ask_type,
      say: row.say_type,
      text: row.text,
      contentParts: row.content_parts ? JSON.parse(row.content_parts) : undefined,
      reasoning: row.reasoning,
      images: row.images ? JSON.parse(row.images) : undefined,
      partial: row.partial === 1,
      lastCheckpointHash: row.last_checkpoint_hash,
      isCheckpointCheckedOut: row.is_checkpoint_checked_out === 1,
      isOperationOutsideWorkspace: row.is_operation_outside_workspace === 1,
      conversationHistoryIndex: row.conversation_history_index,
      conversationHistoryDeletedRange: row.conversation_history_deleted_range ? JSON.parse(row.conversation_history_deleted_range) : undefined,
      mcpToolCall: row.mcp_tool_call_data ? JSON.parse(row.mcp_tool_call_data) : undefined
    }))
  } catch (error) {
    logger.error('Failed to get Cline messages', { error: error instanceof Error ? error.message : String(error) })
    return []
  }
}

export async function saveChatermMessagesLogic(db: Database.Database, taskId: string, uiMessages: any[]): Promise<void> {
  try {
    db.transaction(() => {
      // Clear existing records
      const deleteStmt = db.prepare('DELETE FROM agent_ui_messages_v1 WHERE task_id = ?')
      deleteStmt.run(taskId)

      // Insert new records
      const insertStmt = db.prepare(`
          INSERT INTO agent_ui_messages_v1
          (task_id, ts, type, ask_type, say_type, text, content_parts, reasoning, images, partial,
           last_checkpoint_hash, is_checkpoint_checked_out, is_operation_outside_workspace,
           conversation_history_index, conversation_history_deleted_range, mcp_tool_call_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

      for (const message of uiMessages) {
        insertStmt.run(
          taskId,
          message.ts,
          message.type,
          message.ask || null,
          message.say || null,
          message.text ?? null,
          message.contentParts ? JSON.stringify(message.contentParts) : null,
          message.reasoning || null,
          message.images ? JSON.stringify(message.images) : null,
          message.partial ? 1 : 0,
          message.lastCheckpointHash || null,
          message.isCheckpointCheckedOut ? 1 : 0,
          message.isOperationOutsideWorkspace ? 1 : 0,
          message.conversationHistoryIndex || null,
          message.conversationHistoryDeletedRange ? JSON.stringify(message.conversationHistoryDeletedRange) : null,
          message.mcpToolCall ? JSON.stringify(message.mcpToolCall) : null
        )
      }
    })()
  } catch (error) {
    logger.error('Failed to save Cline messages', { error: error instanceof Error ? error.message : String(error) })
  }
}

// Agent task metadata related methods
export async function getTaskMetadataLogic(db: Database.Database, taskId: string): Promise<any> {
  try {
    const stmt = db.prepare(`
        SELECT files_in_context, model_usage, hosts, todos
        FROM agent_task_metadata_v1
        WHERE task_id = ?
      `)
    const row = stmt.get(taskId)

    if (row) {
      return {
        files_in_context: JSON.parse(row.files_in_context || '[]'),
        model_usage: JSON.parse(row.model_usage || '[]'),
        hosts: JSON.parse(row.hosts || '[]'),
        todos: row.todos ? JSON.parse(row.todos) : []
      }
    }

    return { files_in_context: [], model_usage: [], hosts: [], todos: [] }
  } catch (error) {
    logger.error('Failed to get task metadata', { error: error instanceof Error ? error.message : String(error) })
    return { files_in_context: [], model_usage: [], hosts: [], todos: [] }
  }
}

export async function saveTaskMetadataLogic(db: Database.Database, taskId: string, metadata: any): Promise<void> {
  try {
    const upsertStmt = db.prepare(`
        INSERT INTO agent_task_metadata_v1 (task_id, files_in_context, model_usage, hosts, todos, updated_at)
        VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
        ON CONFLICT(task_id) DO UPDATE SET
          files_in_context = excluded.files_in_context,
          model_usage = excluded.model_usage,
          hosts = excluded.hosts,
          todos = excluded.todos,
          updated_at = strftime('%s', 'now')
      `)

    upsertStmt.run(
      taskId,
      JSON.stringify(metadata.files_in_context || []),
      JSON.stringify(metadata.model_usage || []),
      JSON.stringify(metadata.hosts || []),
      JSON.stringify(metadata.todos || [])
    )
  } catch (error) {
    logger.error('Failed to save task metadata', { error: error instanceof Error ? error.message : String(error) })
  }
}

// Agent context history related methods
export async function getContextHistoryLogic(db: Database.Database, taskId: string): Promise<any> {
  try {
    const stmt = db.prepare(`
        SELECT context_history_data
        FROM agent_context_history_v1 
        WHERE task_id = ?
      `)
    const row = stmt.get(taskId)

    if (row) {
      return JSON.parse(row.context_history_data)
    }

    return null
  } catch (error) {
    logger.error('Failed to get context history', { error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

export async function saveContextHistoryLogic(db: Database.Database, taskId: string, contextHistory: any): Promise<void> {
  logger.info('[saveContextHistory] Attempting to save', { taskId, type: typeof taskId })
  let jsonDataString: string | undefined
  try {
    jsonDataString = JSON.stringify(contextHistory)
    logger.info('[saveContextHistory] JSON.stringify successful', { dataLength: jsonDataString?.length, type: typeof jsonDataString })
  } catch (stringifyError) {
    logger.error('[saveContextHistory] Error during JSON.stringify', {
      error: stringifyError instanceof Error ? stringifyError.message : String(stringifyError)
    })
    logger.error('[saveContextHistory] Original contextHistory object that caused error', {
      error: contextHistory instanceof Error ? contextHistory.message : String(contextHistory)
    })
    if (stringifyError instanceof Error) {
      throw new Error(`Failed to stringify contextHistory: ${stringifyError.message}`)
    } else {
      throw new Error(`Failed to stringify contextHistory: ${String(stringifyError)}`)
    }
  }

  if (typeof jsonDataString !== 'string') {
    logger.error('[saveContextHistory] jsonDataString is not a string after stringify', { value: String(jsonDataString) })
    throw new Error('jsonDataString is not a string after JSON.stringify')
  }

  try {
    const upsertStmt = db.prepare(`
        INSERT INTO agent_context_history_v1 (task_id, context_history_data, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(task_id) DO UPDATE SET
          context_history_data = excluded.context_history_data,
          updated_at = strftime('%s', 'now')
      `)

    logger.info('[saveContextHistory] Executing upsert', { taskId })
    upsertStmt.run(taskId, jsonDataString)
    logger.info('[saveContextHistory] Upsert successful for Task ID', { value: taskId })
  } catch (error) {
    logger.error('[saveContextHistory] Failed to save context history to DB', {
      taskId,
      error: error instanceof Error ? error.message : String(error)
    })
    logger.error('[saveContextHistory] Data that caused error', { dataLength: jsonDataString?.length })
    throw error
  }
}
