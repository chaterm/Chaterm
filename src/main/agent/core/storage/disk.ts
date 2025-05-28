import { Anthropic } from '@anthropic-ai/sdk'
import { ChatermMessage } from '../../shared/ExtensionMessage'
import { TaskMetadata } from '../context/context-tracking/ContextTrackerTypes'
import path from 'path'
import fs from 'fs/promises'
import { ChatermDatabaseService } from '../../../storage/database'

export const GlobalFileNames = {
  apiConversationHistory: 'api_conversation_history.json',
  contextHistory: 'context_history.json',
  uiMessages: 'ui_messages.json',
  taskMetadata: 'task_metadata.json'
}

// 确保任务目录存在 - 暂时保留，后续评估
export async function ensureTaskDirectoryExists(taskId: string): Promise<string> {
  const taskDir = path.join(process.env.GLOBAL_STORAGE_PATH || '', 'tasks', taskId)
  await fs.mkdir(taskDir, { recursive: true })
  return taskDir
}

// 获取保存的API对话历史
export async function getSavedApiConversationHistory(
  taskId: string
): Promise<Anthropic.MessageParam[]> {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    const history = await dbService.getApiConversationHistory(taskId)
    return history as Anthropic.MessageParam[]
  } catch (error) {
    console.error('Failed to get API conversation history from DB:', error)
    return []
  }
}

// 保存API对话历史
export async function saveApiConversationHistory(
  taskId: string,
  apiConversationHistory: Anthropic.MessageParam[]
) {
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
    const messages = await dbService.getSavedClineMessages(taskId)
    return messages as ChatermMessage[]
  } catch (error) {
    console.error('Failed to get Chaterm messages from DB:', error)
    return []
  }
}

export async function saveChatermMessages(taskId: string, uiMessages: ChatermMessage[]) {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    await dbService.saveClineMessages(taskId, uiMessages)
  } catch (error) {
    console.error('Failed to save Chaterm messages to DB:', error)
  }
}

// 获取任务元数据
export async function getTaskMetadata(taskId: string): Promise<TaskMetadata> {
  const defaultMetadata: TaskMetadata = { files_in_context: [], model_usage: [] }
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    const metadata = await dbService.getTaskMetadata(taskId)
    // 假设 metadata 结构与 TaskMetadata 兼容，或者需要转换
    return (metadata as TaskMetadata) || defaultMetadata
  } catch (error) {
    console.error('Failed to get task metadata from DB:', error)
    return defaultMetadata
  }
}

// 保存任务元数据
export async function saveTaskMetadata(taskId: string, metadata: TaskMetadata) {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    await dbService.saveTaskMetadata(taskId, metadata)
  } catch (error) {
    console.error('Failed to save task metadata to DB:', error)
  }
}

// 获取上下文历史
export async function getSavedContextHistory(taskId: string): Promise<any> {
  // 返回类型保持 any，或根据需要调整
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    const history = await dbService.getContextHistory(taskId)
    return history
  } catch (error) {
    console.error('Failed to get context history from DB:', error)
    return null
  }
}

// 保存上下文历史
export async function saveContextHistory(taskId: string, contextHistory: any) {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    await dbService.saveContextHistory(taskId, contextHistory)
  } catch (error) {
    console.error('Failed to save context history to DB:', error)
  }
}
