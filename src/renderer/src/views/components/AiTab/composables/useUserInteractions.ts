import { ref, nextTick } from 'vue'
import { notification } from 'ant-design-vue'
import { useSessionState } from './useSessionState'
import type { ChatOption, DocOption } from '../types'
import i18n from '@/locales'

/**
 * Composable for user interaction events
 * Handles file upload, voice input, keyboard events and other user interactions
 */
export interface UseUserInteractionsOptions {
  sendMessage: (sendType: string) => Promise<any>
  insertChipAtCursor?: (chipType: 'doc' | 'chat', ref: DocOption | ChatOption, label: string) => void
}

export function useUserInteractions(options: UseUserInteractionsOptions) {
  const { t } = i18n.global
  const { chatInputParts, appendTextToInputParts } = useSessionState()
  const { sendMessage, insertChipAtCursor } = options

  const fileInputRef = ref<HTMLInputElement>()
  const autoSendAfterVoice = ref(false)
  const currentEditingId = ref<string | null>(null)

  const handleTranscriptionComplete = (transcribedText: string) => {
    appendTextToInputParts(transcribedText)

    console.log('handleTranscriptionComplete', autoSendAfterVoice.value)

    if (autoSendAfterVoice.value) {
      nextTick(() => {
        sendMessage('send')
      })
    }
  }

  const handleTranscriptionError = (error: string) => {
    console.error('Voice transcription error:', error)
  }

  const handleFileUpload = () => {
    fileInputRef.value?.click()
  }

  const handleFileSelected = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]

    if (!file) return

    try {
      if (file.size > 1024 * 1024) {
        notification.warning({
          message: t('ai.fileTooLarge'),
          description: t('ai.fileTooLargeDesc'),
          duration: 3
        })
        return
      }

      const fileName = file.name
      const filePath = (file as File & { path?: string }).path || fileName

      if (insertChipAtCursor) {
        insertChipAtCursor('doc', { absPath: filePath, name: fileName, type: 'file' }, fileName)
      }
    } catch (error) {
      console.error('File read error:', error)
      notification.error({
        message: t('ai.fileReadFailed'),
        description: t('ai.fileReadErrorDesc'),
        duration: 3
      })
    } finally {
      if (target) {
        target.value = ''
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()

      if (!hasAnyInputParts()) {
        return
      }

      sendMessage('send')
    }
  }

  const hasAnyInputParts = () => {
    return chatInputParts.value.some((part) => part.type === 'chip' || (part.text?.trim().length ?? 0) > 0)
  }

  return {
    fileInputRef,
    autoSendAfterVoice,
    currentEditingId,
    handleTranscriptionComplete,
    handleTranscriptionError,
    handleFileUpload,
    handleFileSelected,
    handleKeyDown
  }
}
