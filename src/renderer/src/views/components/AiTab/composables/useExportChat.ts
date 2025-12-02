import { notification } from 'ant-design-vue'
import { useSessionState } from './useSessionState'
import type { ChatMessage, MessageContent } from '../types'
import i18n from '@/locales'

export function useExportChat() {
  const { chatHistory, currentChatTitle } = useSessionState()
  const { t } = i18n.global

  const generateFileName = (): string => {
    const title = (currentChatTitle.value || 'chat').slice(0, 30)
    const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '-').trim()
    return `${safeTitle}.md`
  }

  const extractContent = (content: string | MessageContent): string => {
    if (typeof content === 'string') return content
    return content.content || content.question || ''
  }

  const formatMessage = (msg: ChatMessage): string => {
    const role = msg.role === 'user' ? '**User:**' : '**Chaterm:**'
    const text = extractContent(msg.content)

    if (msg.ask === 'command' || msg.say === 'command') {
      const cmd = msg.executedCommand || text
      return cmd ? `${role}\n\n\`\`\`bash\n${cmd}\n\`\`\`\n` : ''
    }

    if (msg.say === 'command_output') {
      if (!text) return ''
      if (text.startsWith('Terminal output:') && text.includes('```')) {
        return `**OUTPUT**\n\n${text}\n`
      }
      return `**OUTPUT**\n\n\`\`\`\n${text}\n\`\`\`\n`
    }

    if (msg.ask === 'mcp_tool_call' && msg.mcpToolCall) {
      const { serverName, toolName, arguments: args } = msg.mcpToolCall
      const mcpJson = {
        'MCP SERVER': serverName,
        TOOL: toolName,
        PARAMETERS: args || {}
      }
      return `${role}\n\n\`\`\`json\n${JSON.stringify(mcpJson, null, 2)}\n\`\`\`\n`
    }

    if (msg.ask === 'followup' && typeof msg.content === 'object') {
      const content = msg.content as MessageContent
      let result = `${role}\n\n${content.question || ''}\n`
      if (content.options?.length) {
        result += '\nOptions:\n\n'
        content.options.forEach((opt) => {
          const checkbox = msg.selectedOption === opt ? '[x]' : '[ ]'
          result += `- ${checkbox} ${opt}\n\n`
        })
      }
      return result
    }

    if (msg.say === 'search_result') {
      return text ? `${role}\n\n**Search Result**\n\`\`\`\n${text}\n\`\`\`\n` : ''
    }

    if (msg.action === 'approved') return `${role}\n\n✅ Approved\n`
    if (msg.action === 'rejected') return `${role}\n\n❌ Rejected\n`

    if (!text.trim()) return ''
    return `${role}\n\n${text}\n`
  }

  const convertToMarkdown = (messages: ChatMessage[]): string => {
    const title = currentChatTitle.value || 'Chat Export'
    const header = `# ${title}\n\n> ${t('ai.exportedOn')}: ${new Date().toLocaleString()} from Chaterm\n\n---\n\n`
    const body = messages.map(formatMessage).filter(Boolean).join('\n---\n\n')
    return header + body
  }

  const exportChat = async (): Promise<void> => {
    const messages = chatHistory.value
    if (!messages?.length) {
      notification.warning({ message: t('ai.exportChatEmpty'), duration: 3 })
      return
    }

    try {
      const fileName = generateFileName()
      const filePath = await window.api.openSaveDialog({ fileName })
      if (!filePath) return

      const markdown = convertToMarkdown(messages)
      await window.api.writeLocalFile(filePath, markdown)
      notification.success({ message: t('ai.exportChatSuccess'), duration: 3 })
    } catch (error) {
      console.error('Export chat failed:', error)
      notification.error({
        message: t('ai.exportChatFailed'),
        description: error instanceof Error ? error.message : String(error),
        duration: 5
      })
    }
  }

  return { exportChat }
}
