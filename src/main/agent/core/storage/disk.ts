import { Anthropic } from '@anthropic-ai/sdk'
import { ChatermMessage } from '../../shared/ExtensionMessage'
import { TaskMetadata } from '../context/context-tracking/ContextTrackerTypes'
import path from 'path'
import fs from 'fs/promises'

export const GlobalFileNames = {
  apiConversationHistory: 'api_conversation_history.json',
  contextHistory: 'context_history.json',
  uiMessages: 'ui_messages.json',
  taskMetadata: 'task_metadata.json'
}

// 获取文档路径 - 保留原有接口但不再使用
export async function getDocumentsPath(): Promise<string> {
  // 保留原有接口，但实际上不再使用文件系统
  return ''
}

// 确保规则目录存在 - 保留原有接口但不再使用
export async function ensureRulesDirectoryExists(): Promise<string> {
  // 保留原有接口，但实际上不再使用文件系统
  return ''
}

// 确保MCP服务器目录存在 - 保留原有接口但不再使用
export async function ensureMcpServersDirectoryExists(): Promise<string> {
  // 保留原有接口，但实际上不再使用文件系统
  return ''
}

// 确保任务目录存在
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
    const result = await (window as any).api.agentGetApiConversationHistory({ taskId })
    if (result.success) {
      return result.data || []
    }
    console.error('Failed to get API conversation history:', result.error)
    return []
  } catch (error) {
    console.error('Failed to get API conversation history:', error)
    return []
  }
}

// 保存API对话历史
export async function saveApiConversationHistory(
  taskId: string,
  apiConversationHistory: Anthropic.MessageParam[]
) {
  try {
    const result = await (window as any).api.agentSaveApiConversationHistory({
      taskId,
      apiConversationHistory
    })
    if (!result.success) {
      console.error('Failed to save API conversation history:', result.error)
    }
  } catch (error) {
    console.error('Failed to save API conversation history:', error)
  }
}

// 获取保存的Cline消息
export async function getSavedChatermMessages(taskId: string): Promise<ChatermMessage[]> {
  try {
    const result = await (window as any).api.agentGetChatermMessages({ taskId })
    if (result.success) {
      return result.data || []
    }
    console.error('Failed to get Cline messages:', result.error)
    return []
  } catch (error) {
    console.error('Failed to get Cline messages:', error)
    return []
  }
}

// 保存Cline消息
export async function saveChatermMessages(taskId: string, uiMessages: ChatermMessage[]) {
  try {
    const result = await (window as any).api.agentSaveChatermMessages({
      taskId,
      uiMessages
    })
    if (!result.success) {
      console.error('Failed to save Cline messages:', result.error)
    }
  } catch (error) {
    console.error('Failed to save Cline messages:', error)
  }
}

// 获取任务元数据
export async function getTaskMetadata(taskId: string): Promise<TaskMetadata> {
  try {
    const result = await (window as any).api.agentGetTaskMetadata({ taskId })
    if (result.success) {
      return result.data || { files_in_context: [], model_usage: [] }
    }
    console.error('Failed to get task metadata:', result.error)
    return { files_in_context: [], model_usage: [] }
  } catch (error) {
    console.error('Failed to get task metadata:', error)
    return { files_in_context: [], model_usage: [] }
  }
}

// 保存任务元数据
export async function saveTaskMetadata(taskId: string, metadata: TaskMetadata) {
  try {
    const result = await (window as any).api.agentSaveTaskMetadata({
      taskId,
      metadata
    })
    if (!result.success) {
      console.error('Failed to save task metadata:', result.error)
    }
  } catch (error) {
    console.error('Failed to save task metadata:', error)
  }
}

// 获取上下文历史 - 新增方法
export async function getSavedContextHistory(taskId: string): Promise<any> {
  try {
    const result = await (window as any).api.agentGetContextHistory({ taskId })
    if (result.success) {
      return result.data
    }
    console.error('Failed to get context history:', result.error)
    return null
  } catch (error) {
    console.error('Failed to get context history:', error)
    return null
  }
}

// 保存上下文历史 - 新增方法
export async function saveContextHistory(taskId: string, contextHistory: any) {
  try {
    const result = await (window as any).api.agentSaveContextHistory({
      taskId,
      contextHistory
    })
    if (!result.success) {
      console.error('Failed to save context history:', result.error)
    }
  } catch (error) {
    console.error('Failed to save context history:', error)
  }
}
