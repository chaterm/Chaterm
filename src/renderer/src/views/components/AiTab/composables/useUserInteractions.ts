import { ref, nextTick } from 'vue'
import { notification } from 'ant-design-vue'
import { useSessionState } from './useSessionState'
import type { ChatOption, DocOption } from '../types'
import type { ImageContentPart } from '@shared/WebviewMessage'
import i18n from '@/locales'


const logger = createRendererLogger('aitab.userInteractions')

// Supported image types for upload
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number]

// Maximum image size: 5MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

/**
 * Composable for user interaction events
 * Handles file upload, voice input, keyboard events and other user interactions
 */
export interface UseUserInteractionsOptions {
  sendMessage: (sendType: string) => Promise<any>
  insertChipAtCursor?: (chipType: 'doc' | 'chat', ref: DocOption | ChatOption, label: string) => void
  insertImagePart?: (imagePart: ImageContentPart) => void
}

export function useUserInteractions(options: UseUserInteractionsOptions) {
  const { t } = i18n.global
  const { chatInputParts, appendTextToInputParts } = useSessionState()
  const { sendMessage, insertChipAtCursor, insertImagePart } = options

  const fileInputRef = ref<HTMLInputElement>()
  const imageInputRef = ref<HTMLInputElement>()
  const autoSendAfterVoice = ref(false)
  const currentEditingId = ref<string | null>(null)

  const handleTranscriptionComplete = (transcribedText: string) => {
    appendTextToInputParts(transcribedText)

    logger.debug('handleTranscriptionComplete', { autoSendAfterVoice: autoSendAfterVoice.value })

    if (autoSendAfterVoice.value) {
      nextTick(() => {
        sendMessage('send')
      })
    }
  }

  const handleTranscriptionError = (error: string) => {
    logger.error('Voice transcription error', { error: error instanceof Error ? error.message : String(error) })
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
      logger.error('File read error', { error: error instanceof Error ? error.message : String(error) })
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

  // Image upload handling
  const handleImageUpload = () => {
    imageInputRef.value?.click()
  }

  const validateImageFile = (file: File): { valid: boolean; error?: string } => {
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type as SupportedImageType)) {
      return { valid: false, error: t('ai.unsupportedImageType') }
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return { valid: false, error: t('ai.imageTooLarge') }
    }
    return { valid: true }
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Extract base64 data without the data URL prefix
        const base64Data = result.split(',')[1]
        resolve(base64Data)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const processImageFile = async (file: File): Promise<ImageContentPart | null> => {
    const validation = validateImageFile(file)
    if (!validation.valid) {
      notification.warning({
        message: t('ai.imageUploadFailed'),
        description: validation.error,
        duration: 3
      })
      return null
    }

    try {
      const base64Data = await fileToBase64(file)
      return {
        type: 'image',
        mediaType: file.type as SupportedImageType,
        data: base64Data
      }
    } catch (error) {
      logger.error('Image processing error', { error: error instanceof Error ? error.message : String(error) })
      notification.error({
        message: t('ai.imageUploadFailed'),
        description: t('ai.imageProcessError'),
        duration: 3
      })
      return null
    }
  }

  const handleImageSelected = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const files = target.files

    if (!files || files.length === 0) return

    try {
      for (const file of Array.from(files)) {
        const imagePart = await processImageFile(file)
        if (imagePart && insertImagePart) {
          insertImagePart(imagePart)
        }
      }
    } finally {
      if (target) {
        target.value = ''
      }
    }
  }

  // Check if clipboard contains images (synchronous check for preventing default)
  const hasClipboardImages = (event: ClipboardEvent): boolean => {
    const items = event.clipboardData?.items
    if (!items) return false
    return Array.from(items).some((item) => item.type.startsWith('image/'))
  }

  // Handle pasted images from clipboard
  // Should be called after preventDefault() to avoid browser inserting raw images
  const handlePasteImage = async (event: ClipboardEvent): Promise<void> => {
    const items = event.clipboardData?.items
    if (!items) return

    // Collect files first (synchronously before clipboard data becomes unavailable)
    const imageFiles: File[] = []
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          imageFiles.push(file)
        }
      }
    }

    // Process images asynchronously after collecting them
    for (const file of imageFiles) {
      const imagePart = await processImageFile(file)
      if (imagePart && insertImagePart) {
        insertImagePart(imagePart)
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
    return chatInputParts.value.some((part) => part.type === 'chip' || part.type === 'image' || (part.type === 'text' && part.text.trim().length > 0))
  }

  return {
    fileInputRef,
    imageInputRef,
    autoSendAfterVoice,
    currentEditingId,
    handleTranscriptionComplete,
    handleTranscriptionError,
    handleFileUpload,
    handleFileSelected,
    handleImageUpload,
    handleImageSelected,
    hasClipboardImages,
    handlePasteImage,
    handleKeyDown
  }
}
