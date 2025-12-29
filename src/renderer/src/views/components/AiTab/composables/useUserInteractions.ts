import { ref, nextTick } from 'vue'
import { notification } from 'ant-design-vue'
import { useSessionState } from './useSessionState'
import i18n from '@/locales'

/**
 * Composable for user interaction events
 * Handles file upload, voice input, keyboard events and other user interactions
 */
export function useUserInteractions(sendMessage: (sendType: string) => Promise<any>) {
  const { t } = i18n.global
  const { chatInputValue } = useSessionState()

  const fileInputRef = ref<HTMLInputElement>()
  const autoSendAfterVoice = ref(false)
  const currentEditingId = ref<string | null>(null)

  const handleTranscriptionComplete = (transcribedText: string) => {
    if (chatInputValue.value.trim()) {
      chatInputValue.value = chatInputValue.value + ' ' + transcribedText
    } else {
      chatInputValue.value = transcribedText
    }

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

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        const content = e.target?.result as string
        resolve(content)
      }

      reader.onerror = () => {
        reject(new Error(t('ai.fileReadFailed')))
      }

      reader.readAsText(file, 'utf-8')
    })
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

      const content = await readFileContent(file)

      const fileName = file.name
      const fileExtension = fileName.split('.').pop()?.toLowerCase()

      let formattedContent = ''
      if (fileExtension === 'json') {
        try {
          const jsonContent = JSON.parse(content)
          formattedContent = `${t('ai.fileContent', { fileName })}:\n\`\`\`json\n${JSON.stringify(jsonContent, null, 2)}\n\`\`\``
        } catch {
          formattedContent = `${t('ai.fileContent', { fileName })}:\n\`\`\`\n${content}\n\`\`\``
        }
      } else if (['md', 'markdown'].includes(fileExtension || '')) {
        formattedContent = `${t('ai.fileContent', { fileName })}:\n\`\`\`markdown\n${content}\n\`\`\``
      } else if (['js', 'ts', 'py', 'java', 'cpp', 'c', 'html', 'css', 'sh', 'bat', 'ps1'].includes(fileExtension || '')) {
        formattedContent = `${t('ai.fileContent', { fileName })}:\n\`\`\`${fileExtension}\n${content}\n\`\`\``
      } else {
        formattedContent = `${t('ai.fileContent', { fileName })}:\n\`\`\`\n${content}\n\`\`\``
      }

      if (chatInputValue.value.trim()) {
        chatInputValue.value = chatInputValue.value + '\n\n' + formattedContent
      } else {
        chatInputValue.value = formattedContent
      }

      notification.success({
        message: t('ai.fileUploadSuccess'),
        description: t('ai.fileUploadSuccessDesc', { fileName }),
        duration: 2
      })
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

      if (!chatInputValue.value.trim()) {
        return
      }

      sendMessage('send')
    }
  }

  return {
    fileInputRef,
    autoSendAfterVoice,
    currentEditingId,
    handleTranscriptionComplete,
    handleTranscriptionError,
    handleFileUpload,
    handleFileSelected,
    readFileContent,
    handleKeyDown
  }
}
