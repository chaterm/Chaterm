import Database from 'better-sqlite3'

export async function deleteChatermHistoryByTaskIdLogic(db: Database.Database, taskId: string): Promise<void> {
  try {
    db.prepare(`DELETE FROM agent_api_conversation_history_v1 WHERE task_id = ?`).run(taskId)
    db.prepare(`DELETE FROM agent_ui_messages_v1 WHERE task_id = ?`).run(taskId)
    db.prepare(`DELETE FROM agent_task_metadata_v1 WHERE task_id = ?`).run(taskId)
    db.prepare(`DELETE FROM agent_context_history_v1 WHERE task_id = ?`).run(taskId)
  } catch (error) {
    console.error('Failed to delete API conversation history:', error)
  }
}

export async function getApiConversationHistoryLogic(db: Database.Database, taskId: string): Promise<any[]> {
  try {
    const stmt = db.prepare(`
        SELECT content_data, role, content_type, tool_use_id, sequence_order
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
        const messageKey = `${row.role}_${row.sequence_order}`
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
    console.error('Failed to get API conversation history:', error)
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
          (task_id, ts, role, content_type, content_data, tool_use_id, sequence_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)

      let sequenceOrder = 0
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

            insertStmt.run(taskId, now, message.role, contentType, JSON.stringify(contentData), toolUseId, sequenceOrder++)
          }
        } else {
          // Handle simple text messages
          insertStmt.run(taskId, now, message.role, 'text', JSON.stringify({ text: message.content }), null, sequenceOrder++)
        }
      }
    })()
  } catch (error) {
    console.error('Failed to save API conversation history:', error)
    throw error // Re-throw the error to be caught by the IPC handler
  }
}

// Agent UI message related methods
export async function getSavedChatermMessagesLogic(db: Database.Database, taskId: string): Promise<any[]> {
  try {
    const stmt = db.prepare(`
        SELECT ts, type, ask_type, say_type, text, reasoning, images, partial, 
               last_checkpoint_hash, is_checkpoint_checked_out, is_operation_outside_workspace,
               conversation_history_index, conversation_history_deleted_range
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
      reasoning: row.reasoning,
      images: row.images ? JSON.parse(row.images) : undefined,
      partial: row.partial === 1,
      lastCheckpointHash: row.last_checkpoint_hash,
      isCheckpointCheckedOut: row.is_checkpoint_checked_out === 1,
      isOperationOutsideWorkspace: row.is_operation_outside_workspace === 1,
      conversationHistoryIndex: row.conversation_history_index,
      conversationHistoryDeletedRange: row.conversation_history_deleted_range ? JSON.parse(row.conversation_history_deleted_range) : undefined
    }))
  } catch (error) {
    console.error('Failed to get Cline messages:', error)
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
          (task_id, ts, type, ask_type, say_type, text, reasoning, images, partial,
           last_checkpoint_hash, is_checkpoint_checked_out, is_operation_outside_workspace,
           conversation_history_index, conversation_history_deleted_range)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

      for (const message of uiMessages) {
        insertStmt.run(
          taskId,
          message.ts,
          message.type,
          message.ask || null,
          message.say || null,
          message.text || null,
          message.reasoning || null,
          message.images ? JSON.stringify(message.images) : null,
          message.partial ? 1 : 0,
          message.lastCheckpointHash || null,
          message.isCheckpointCheckedOut ? 1 : 0,
          message.isOperationOutsideWorkspace ? 1 : 0,
          message.conversationHistoryIndex || null,
          message.conversationHistoryDeletedRange ? JSON.stringify(message.conversationHistoryDeletedRange) : null
        )
      }
    })()
  } catch (error) {
    console.error('Failed to save Cline messages:', error)
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
    console.error('Failed to get task metadata:', error)
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
    console.error('Failed to save task metadata:', error)
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
    console.error('Failed to get context history:', error)
    return null
  }
}

export async function saveContextHistoryLogic(db: Database.Database, taskId: string, contextHistory: any): Promise<void> {
  console.log('[saveContextHistory] Attempting to save. Task ID:', taskId, 'Type:', typeof taskId)
  let jsonDataString: string | undefined
  try {
    jsonDataString = JSON.stringify(contextHistory)
    console.log('[saveContextHistory] JSON.stringify successful. Data:', jsonDataString, 'Type:', typeof jsonDataString)
  } catch (stringifyError) {
    console.error('[saveContextHistory] Error during JSON.stringify:', stringifyError)
    console.error('[saveContextHistory] Original contextHistory object that caused error:', contextHistory)
    if (stringifyError instanceof Error) {
      throw new Error(`Failed to stringify contextHistory: ${stringifyError.message}`)
    } else {
      throw new Error(`Failed to stringify contextHistory: ${String(stringifyError)}`)
    }
  }

  if (typeof jsonDataString !== 'string') {
    console.error('[saveContextHistory] jsonDataString is not a string after stringify. Value:', jsonDataString)
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

    console.log('[saveContextHistory] Executing upsert. Task ID:', taskId, 'Data:', jsonDataString)
    upsertStmt.run(taskId, jsonDataString)
    console.log('[saveContextHistory] Upsert successful for Task ID:', taskId)
  } catch (error) {
    console.error('[saveContextHistory] Failed to save context history to DB. Task ID:', taskId, 'Error:', error)
    console.error('[saveContextHistory] Data that caused error:', jsonDataString)
    throw error
  }
}
