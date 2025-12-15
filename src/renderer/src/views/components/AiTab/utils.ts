import { v4 as uuidv4 } from 'uuid'
import type { ChatMessage, MessageContent, HostOption, TreeHostOption, HostItemType } from './types'

export const createNewMessage = (
  role: 'user' | 'assistant',
  content: string | MessageContent,
  type = 'message',
  ask = '',
  say = '',
  ts = 0,
  partial = false
): ChatMessage => ({
  id: uuidv4(),
  role,
  content,
  type,
  ask,
  say,
  ts,
  partial
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

// Format tree structure data from backend to flat host options
export const formatHosts = (data: { personal?: TreeHostOption[]; jumpservers?: TreeHostOption[] }): HostOption[] => {
  const result: HostOption[] = []

  // Format personal assets (level 0)
  if (data.personal) {
    data.personal.forEach((item) => {
      result.push({
        key: item.key,
        label: item.label || '',
        value: item.key,
        uuid: item.uuid,
        connect: item.connection,
        type: item.type as HostItemType,
        selectable: item.selectable !== false,
        level: 0
      })
    })
  }

  // Format jumpserver nodes with children
  if (data.jumpservers) {
    data.jumpservers.forEach((js) => {
      result.push({
        key: js.key,
        label: js.label || '',
        value: js.key,
        uuid: js.uuid,
        connect: js.connection,
        type: 'jumpserver' as HostItemType,
        selectable: false,
        level: 0,
        children: js.children,
        childrenCount: js.children?.length || 0
      })
    })
  }

  return result
}

// Type guard to check if content is a string
export const isStringContent = (content: string | MessageContent): content is string => {
  return typeof content === 'string'
}

// Format timestamp to date string (YYYY.MM.DD)
export const formatDateFromTimestamp = (ts: number): string => {
  const date = new Date(ts)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

// Get date label (today, yesterday, or formatted date)
export const getDateLabel = (ts: number, t: (key: string) => string): string => {
  const today = new Date()
  const date = new Date(ts)

  // Reset time to compare only dates
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - date.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return t('ai.today')
  } else if (diffDays === 1) {
    return t('ai.yesterday')
  } else {
    return formatDateFromTimestamp(ts)
  }
}
