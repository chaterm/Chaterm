import { v4 as uuidv4 } from 'uuid'
import type { ChatMessage, MessageContent, HostOption, TreeHostOption, HostItemType } from './types'
import type { HostInfo } from '@shared/ExtensionMessage'
import type { ContentPart } from '@shared/WebviewMessage'

export const createNewMessage = (
  role: 'user' | 'assistant',
  content: string | MessageContent,
  type = 'message',
  ask = '',
  say = '',
  ts = 0,
  partial = false,
  hostInfo?: HostInfo
): ChatMessage => ({
  id: uuidv4(),
  role,
  content,
  type,
  ask,
  say,
  ts,
  partial,
  ...(hostInfo && {
    hostId: hostInfo.hostId,
    hostName: hostInfo.hostName,
    colorTag: hostInfo.colorTag
  })
})

export const pickHostInfo = (partial: Partial<ChatMessage>): HostInfo | undefined => {
  const { hostId, hostName, colorTag } = partial
  return hostId || hostName || colorTag ? { hostId, hostName, colorTag } : undefined
}

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

export const getChipLabel = (part: Extract<ContentPart, { type: 'chip' }>): string => {
  if (part.chipType === 'doc') {
    return part.ref.name || part.ref.absPath
  }
  if (part.chipType === 'command') {
    return part.ref.label || part.ref.command
  }
  return part.ref.title || part.ref.taskId
}

// Check if asset type is a network switch device
export const isSwitchAssetType = (assetType?: string): boolean => {
  return assetType?.startsWith('person-switch-') ?? false
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
        level: 0,
        assetType: item.assetType
      })
    })
  }

  // Format bastion host nodes with children
  if (data.jumpservers) {
    data.jumpservers.forEach((js) => {
      result.push({
        key: js.key,
        label: js.label || '',
        value: js.key,
        uuid: js.uuid,
        connect: js.connection,
        type: 'bastion' as HostItemType,
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

// Image file extensions for detection
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

// Check if a file is an image based on extension
export const isImageFile = (relPath: string): boolean => {
  const ext = relPath.toLowerCase().split('.').pop()
  return ext ? IMAGE_EXTS.has(`.${ext}`) : false
}

// Get image media type from file extension
export const getImageMediaType = (relPath: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/bmp' | 'image/svg+xml' => {
  const ext = relPath.toLowerCase().split('.').pop()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    case 'png':
      return 'image/png'
    default:
      return 'image/png'
  }
}
