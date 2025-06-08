import { v4 as uuidv4 } from 'uuid'
import type { ChatMessage, MessageContent } from './types'

export const createNewMessage = (
  role: 'user' | 'assistant',
  content: string | MessageContent,
  type = 'message',
  ask = '',
  say = '',
  ts = 0
): ChatMessage => ({
  id: uuidv4(),
  role,
  content,
  type,
  ask,
  say,
  ts
})

export const parseMessageContent = (text: string): string | MessageContent => {
  try {
    return JSON.parse(text)
  } catch (e) {
    return text
  }
}

export const truncateText = (text: string, maxLength = 15): string => {
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text
}

export const formatHosts = (hosts: any[]): any[] => {
  return hosts.map((item) => ({
    label: item.asset_ip || item.host || '',
    value: item.uuid,
    uuid: item.uuid
  }))
}
