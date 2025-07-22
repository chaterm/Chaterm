import { Anthropic } from '@anthropic-ai/sdk'
import { ChatermMessage } from '../../shared/ExtensionMessage'
import { TaskMetadata } from '../context/context-tracking/ContextTrackerTypes'
import { ChatermDatabaseService } from '../../../storage/database'

export const GlobalFileNames = {
  apiConversationHistory: 'api_conversation_history.json',
  contextHistory: 'context_history.json',
  uiMessages: 'ui_messages.json',
  taskMetadata: 'task_metadata.json'
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
