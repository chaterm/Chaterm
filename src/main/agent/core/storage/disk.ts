import { Anthropic } from '@anthropic-ai/sdk'
import { ChatermMessage } from '../../shared/ExtensionMessage'
import { TaskMetadata } from '../context/context-tracking/ContextTrackerTypes'
import { ChatermDatabaseService } from '../../../storage/database'
import { execa } from 'execa'
import * as path from 'path'
import fs from 'fs/promises'
import os from 'os'

export const GlobalFileNames = {
  apiConversationHistory: 'api_conversation_history.json',
  contextHistory: 'context_history.json',
  uiMessages: 'ui_messages.json',
  taskMetadata: 'task_metadata.json',
  mcpSettings: 'mcp_settings.json'
}

export async function ensureTaskExists(taskId: string): Promise<string> {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    const apiHistory = await dbService.getApiConversationHistory(taskId)
    const uiMessages = await dbService.getSavedChatermMessages(taskId)
    if ((apiHistory && apiHistory.length > 0) || (uiMessages && uiMessages.length > 0)) {
      return taskId
    }
    return ''
  } catch (error) {
    console.error('Failed to check task existence in DB:', error)
    return ''
  }
}

// Get saved API conversation history
export async function deleteChatermHistoryByTaskId(taskId: string): Promise<void> {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    await dbService.deleteChatermHistoryByTaskId(taskId)
  } catch (error) {
    console.error('Failed to delete Chaterm history by task ID:', error)
  }
}
export async function getSavedApiConversationHistory(taskId: string): Promise<Anthropic.MessageParam[]> {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    const history = await dbService.getApiConversationHistory(taskId)
    return history as Anthropic.MessageParam[]
  } catch (error) {
    console.error('Failed to get API conversation history from DB:', error)
    return []
  }
}

// Save API conversation history
export async function saveApiConversationHistory(taskId: string, apiConversationHistory: Anthropic.MessageParam[]) {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    await dbService.saveApiConversationHistory(taskId, apiConversationHistory)
  } catch (error) {
    console.error('Failed to save API conversation history to DB:', error)
  }
}

export async function getChatermMessages(taskId: string): Promise<ChatermMessage[]> {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    const messages = await dbService.getSavedChatermMessages(taskId)
    return messages as ChatermMessage[]
  } catch (error) {
    console.error('Failed to get Chaterm messages from DB:', error)
    return []
  }
}

export async function saveChatermMessages(taskId: string, uiMessages: ChatermMessage[]) {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    await dbService.saveChatermMessages(taskId, uiMessages)
  } catch (error) {
    console.error('Failed to save Chaterm messages to DB:', error)
  }
}

// Get task metadata
export async function getTaskMetadata(taskId: string): Promise<TaskMetadata> {
  const defaultMetadata: TaskMetadata = { files_in_context: [], model_usage: [], hosts: [] }
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    const metadata = await dbService.getTaskMetadata(taskId)
    // Assume metadata structure is compatible with TaskMetadata, or needs conversion
    return (metadata as TaskMetadata) || defaultMetadata
  } catch (error) {
    console.error('Failed to get task metadata from DB:', error)
    return defaultMetadata
  }
}

// Save task metadata
export async function saveTaskMetadata(taskId: string, metadata: TaskMetadata) {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    await dbService.saveTaskMetadata(taskId, metadata)
  } catch (error) {
    console.error('Failed to save task metadata to DB:', error)
  }
}

// Get context history
export async function getContextHistoryStorage(taskId: string): Promise<any> {
  // Return type remains any, or adjust as needed
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    const history = await dbService.getContextHistory(taskId)
    return history
  } catch (error) {
    console.error('Failed to get context history from DB:', error)
    return null
  }
}

// Save context history
export async function saveContextHistoryStorage(taskId: string, contextHistory: any) {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    await dbService.saveContextHistory(taskId, contextHistory)
  } catch (error) {
    console.error('Failed to save context history to DB:', error)
  }
}

export async function ensureMcpServersDirectoryExists(): Promise<string> {
  const userDocumentsPath = await getDocumentsPath()
  const mcpServersDir = path.join(userDocumentsPath, 'MCP')
  try {
    await fs.mkdir(mcpServersDir, { recursive: true })
  } catch (_error) {
    return path.join(os.homedir(), 'Documents', 'Chaterm', 'MCP') // in case creating a directory in documents fails for whatever reason (e.g. permissions) - this is fine since this path is only ever used in the system prompt
  }
  return mcpServersDir
}

export async function getDocumentsPath(): Promise<string> {
  if (process.platform === 'win32') {
    try {
      const { stdout: docsPath } = await execa('powershell', [
        '-NoProfile', // Ignore user's PowerShell profile(s)
        '-Command',
        '[System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyDocuments)'
      ])
      const trimmedPath = docsPath.trim()
      if (trimmedPath) {
        return trimmedPath
      }
    } catch (_err) {
      console.error('Failed to retrieve Windows Documents path. Falling back to homedir/Documents.')
    }
  } else if (process.platform === 'linux') {
    try {
      // First check if xdg-user-dir exists
      await execa('which', ['xdg-user-dir'])

      // If it exists, try to get XDG documents path
      const { stdout } = await execa('xdg-user-dir', ['DOCUMENTS'])
      const trimmedPath = stdout.trim()
      if (trimmedPath) {
        return trimmedPath
      }
    } catch {
      // Log error but continue to fallback
      console.error('Failed to retrieve XDG Documents path. Falling back to homedir/Documents.')
    }
  }

  // Default fallback for all platforms
  return path.join(os.homedir(), 'Documents')
}
