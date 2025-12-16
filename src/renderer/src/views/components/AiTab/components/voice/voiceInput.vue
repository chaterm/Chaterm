<template>
  <a-tooltip
    :title="isRecording ? $t('ai.stopRecording') : $t('ai.startVoiceInput')"
    placement="top"
  >
    <a-button
      ref="voiceButton"
      :disabled="disabled"
      :class="['voice-button', 'custom-round-button', 'compact-button', { recording: isRecording }]"
      size="small"
      @click="toggleVoiceInput"
    >
      <template v-if="isRecording">
        <div class="recording-animation">
          <div class="pulse"></div>
        </div>
      </template>
      <template v-else>
        <img
          src="@/assets/icons/voice.svg"
          alt="voice"
          style="width: 14px; height: 14px"
        />
      </template>
    </a-button>
  </a-tooltip>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { notification } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { voiceToText } from '@renderer/api/speech/speech'

// i18n
const { t } = useI18n()

// Props
interface Props {
  disabled?: boolean
  autoSendAfterVoice?: boolean
}

defineProps<Props>()

// Emits
const emit = defineEmits<{
  'transcription-complete': [text: string]
  'transcription-error': [error: string]
}>()

// Speech recognition configuration
const SPEECH_CONFIG = {
  // Maximum audio file size (50MB)
  MAX_AUDIO_SIZE: 50 * 1024 * 1024,
  // Audio formats supported by backend
  SUPPORTED_FORMATS: [
    'wav', // WAV format, lossless audio
    'pcm', // PCM format, raw audio data
    'ogg-opus', // OGG with Opus encoding
    'speex', // Speex encoding format
    'silk', // Silk encoding format
    'mp3', // MP3 format, lossy compression
    'm4a', // M4A format, AAC encoding
    'aac', // AAC format, high quality compression
    'amr' // AMR format, mobile device optimized
  ]
}

// Voice recording related state
const isRecording = ref(false)
const mediaRecorder = ref<MediaRecorder | null>(null)
const audioChunks = ref<Blob[]>([])
const recordingTimeout = ref<NodeJS.Timeout | null>(null)
const voiceButton = ref<HTMLElement | null>(null)

// Get best audio format
const getBestAudioFormat = () => {
  const preferredFormats = ['audio/webm', 'audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp3', 'audio/m4a', 'audio/aac', 'audio/wav']

  for (const format of preferredFormats) {
    if (MediaRecorder.isTypeSupported(format)) {
      return format
    }
  }
  return '' // Use default format
}

// Voice recording functionality
const toggleVoiceInput = async () => {
  if (isRecording.value) {
    stopRecording()
  } else {
    await startRecording()
  }
}

const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000 // Recommended sample rate
      }
    })

    // Get best audio format
    const mimeType = getBestAudioFormat()

    mediaRecorder.value = new MediaRecorder(stream, {
      mimeType: mimeType,
      audioBitsPerSecond: 128000 // Moderate audio quality
    })

    audioChunks.value = []

    mediaRecorder.value.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.value.push(event.data)
      }
    }

    mediaRecorder.value.onstop = async () => {
      const audioBlob = new Blob(audioChunks.value, { type: mimeType })

      // Check recording duration, too short recordings may have no valid content
      if (audioBlob.size < 1024) {
        // Less than 1KB
        notification.warning({
          message: t('ai.recordingTooShort'),
          description: t('ai.recordingTooShortDesc'),
          duration: 2
        })
        return
      }

      await transcribeAudio(audioBlob)

      // Stop all audio tracks
      stream.getTracks().forEach((track) => track.stop())
    }

    mediaRecorder.value.onerror = (event) => {
      console.error(t('ai.recordingErrorDesc'), event.error)
      notification.error({
        message: t('ai.recordingFailed'),
        description: t('ai.recordingErrorDesc'),
        duration: 3
      })
    }

    // Start recording, collect data every 100ms
    mediaRecorder.value.start(100)
    isRecording.value = true

    console.log('Started voice recording, format used:', mimeType)

    // // Show recording start notification
    // notification.info({
    //   message: t('ai.startRecording'),
    //   description: t('ai.startRecordingDesc', { formats: getSupportedFormatsDescription() }),
    //   duration: 4
    // })

    // Add 60 second timeout to auto-stop recording
    recordingTimeout.value = setTimeout(() => {
      if (isRecording.value) {
        notification.warning({
          message: t('ai.recordingTimeLimit'),
          description: t('ai.recordingTimeLimitDesc'),
          duration: 2
        })
        stopRecording()
      }
    }, 60000)
  } catch (error) {
    console.error(t('ai.voiceInputFailed'), error)

    let errorMessage = t('ai.voiceInputFailed')
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        errorMessage = t('ai.microphonePermissionDenied')
      } else if (error.name === 'NotFoundError') {
        errorMessage = t('ai.microphoneNotFound')
      } else if (error.name === 'NotReadableError') {
        errorMessage = t('ai.microphoneInUse')
      }
    }

    notification.error({
      message: t('ai.voiceInputFailed'),
      description: errorMessage,
      duration: 5
    })
  }
}

const stopRecording = () => {
  if (mediaRecorder.value && isRecording.value) {
    console.log(t('ai.recordingStopped'))

    try {
      mediaRecorder.value.stop()
    } catch (error) {
      console.error(t('ai.recordingErrorDesc'), error)
    }

    isRecording.value = false

    if (recordingTimeout.value) {
      clearTimeout(recordingTimeout.value)
      recordingTimeout.value = null
    }

    // // Show stop recording notification
    // notification.info({
    //   message: t('ai.recordingStopped'),
    //   description: t('ai.processingVoice'),
    //   duration: 1.5
    // })
  }
}

// Speech recognition functionality - using voiceToText API
const transcribeAudio = async (audioBlob: Blob) => {
  try {
    // Check audio size, use limit from config file
    if (audioBlob.size > SPEECH_CONFIG.MAX_AUDIO_SIZE) {
      throw new Error(t('ai.audioFileTooLarge', { maxSize: Math.round(SPEECH_CONFIG.MAX_AUDIO_SIZE / 1024 / 1024) }))
    }

    // Convert audio to base64
    const arrayBuffer = await audioBlob.arrayBuffer()
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    // Determine audio format based on MIME type, map to backend supported formats
    // Backend supported formats: wav, pcm, ogg-opus, speex, silk, mp3, m4a, aac, amr
    let audioFormat = 'wav' // Default format
    if (audioBlob.type) {
      if (audioBlob.type.includes('mp3')) {
        audioFormat = 'mp3'
      } else if (audioBlob.type.includes('m4a')) {
        audioFormat = 'm4a'
      } else if (audioBlob.type.includes('aac')) {
        audioFormat = 'aac'
      } else if (audioBlob.type.includes('ogg') || audioBlob.type.includes('opus')) {
        audioFormat = 'ogg-opus'
      } else if (audioBlob.type.includes('webm')) {
        // Convert WebM format to ogg-opus, as backend supports ogg-opus
        audioFormat = 'ogg-opus'
      } else if (audioBlob.type.includes('wav')) {
        audioFormat = 'wav'
      } else if (audioBlob.type.includes('pcm')) {
        audioFormat = 'pcm'
      } else if (audioBlob.type.includes('speex')) {
        audioFormat = 'speex'
      } else if (audioBlob.type.includes('silk')) {
        audioFormat = 'silk'
      } else if (audioBlob.type.includes('amr')) {
        audioFormat = 'amr'
      }
    }

    console.log(t('ai.processingVoice'), { format: audioFormat, size: audioBlob.size })

    // Verify if audio format is supported by backend
    if (!SPEECH_CONFIG.SUPPORTED_FORMATS.includes(audioFormat)) {
      console.warn(t('ai.formatConversionDesc', { format: audioFormat }))
      audioFormat = 'wav' // Fallback to default format

      // Notify user about format conversion
      notification.info({
        message: t('ai.audioFormatConversion'),
        description: t('ai.formatConversionDesc', { format: audioFormat }),
        duration: 2
      })
    }

    // Use voiceToText API method
    const result = await voiceToText({
      audio_data: base64Audio,
      audio_format: audioFormat,
      language: 'zh',
      audio_size: audioBlob.size
    })

    let transcribedText = ''
    // Process result based on backend API response structure
    if (result && result.data) {
      // Backend returns VoiceToTextReply structure
      transcribedText = result.data.text || ''
    } else {
      throw new Error(t('ai.voiceRecognitionFailed') + '：' + t('ai.recognitionEmptyDesc'))
    }

    if (transcribedText) {
      console.log(t('ai.voiceRecognitionSuccess'), transcribedText)

      // // Show success notification
      // notification.success({
      //   message: t('ai.voiceRecognitionSuccess'),
      //   description: t('ai.recognitionResult', { text: transcribedText }),
      //   duration: 2
      // })

      // Emit transcription complete event
      emit('transcription-complete', transcribedText)
    } else {
      notification.warning({
        message: t('ai.voiceRecognitionEmpty'),
        description: t('ai.recognitionEmptyDesc'),
        duration: 3
      })

      emit('transcription-error', t('ai.voiceRecognitionEmpty'))
    }
  } catch (error) {
    console.error(t('ai.voiceRecognitionFailed'), error)
    const errorMessage = (error instanceof Error ? error.message : String(error)) || t('ai.voiceRecognitionServiceUnavailable')

    notification.error({
      message: t('ai.voiceRecognitionFailed'),
      description: errorMessage,
      duration: 3
    })

    emit('transcription-error', errorMessage)
  }
}

// Cleanup resources
onUnmounted(() => {
  if (isRecording.value) {
    stopRecording()
  }
  if (recordingTimeout.value) {
    clearTimeout(recordingTimeout.value)
  }
})

// Expose methods to parent component
defineExpose({
  toggleVoiceInput
})
</script>

<style>
/* Voice button base styles */
.voice-button {
  transition: all 0.3s ease;
}

.voice-button.recording {
  background-color: #ff4d4f;
  border-color: #ff4d4f;
  color: white;
}

/* Recording animation styles */
.recording-animation {
  position: relative;
  width: 18px;
  height: 18px;
}

.pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  background-color: white;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0.7;
  }
  100% {
    transform: translate(-50%, -50%) scale(2);
    opacity: 0;
  }
}

/* Button styles copied from parent component */
.custom-round-button {
  height: 18px;
  width: 18px;
  padding: 0;
  border-radius: 4px;
  font-size: 10px;
  background-color: transparent;
  border: none;
  color: var(--text-color);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.custom-round-button:hover {
  transform: scale(1.15);
  background-color: var(--hover-bg-color);
}

.custom-round-button:active {
  transform: scale(0.95);
  box-shadow: none;
}

.custom-round-button[disabled] {
  cursor: not-allowed;
  opacity: 0.2;
  pointer-events: none;
}

.custom-round-button[disabled]:hover {
  transform: none;
}

/* Ensure icon styles are correct */
.custom-round-button img {
  filter: brightness(1) contrast(1);
  opacity: 1;
}

/* Ensure button is properly aligned in container */
.voice-button {
  box-sizing: border-box;
  line-height: 1;
  vertical-align: middle;
  min-height: 18px;
  max-height: 18px;
  align-self: center;
  flex-shrink: 0;
}
</style>
