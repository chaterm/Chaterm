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
          alt="tencent-voice"
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

// i18n
const { t } = useI18n()

// Props
interface Props {
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
})

// Emits
const emit = defineEmits<{
  'transcription-complete': [text: string]
  'transcription-update': [text: string]
  'transcription-error': [error: string]
  'recording-stop': []
}>()

// Configuration
const CONFIG = {
  // WS_URL: 'ws://localhost:8801/v1/speech/asr',
  WS_URL: 'ws://demo.chaterm.ai/v1/speech/asr',
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  BITS_PER_SAMPLE: 16,
  BUFFER_SIZE: 1024, // 64ms at 16kHz
  CHUNK_INTERVAL: 40 // ms
}

// State
const isRecording = ref(false)
const websocket = ref<WebSocket | null>(null)
const isConnected = ref(false)
const currentText = ref<string>('')
const audioContext = ref<AudioContext | null>(null)
const audioSource = ref<MediaStreamAudioSourceNode | null>(null)
const audioProcessor = ref<ScriptProcessorNode | null>(null)
const recordingTimeout = ref<number | null>(null)

// Establish WebSocket connection
const connectWebSocket = async (): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    try {
      const wsUrl = CONFIG.WS_URL
      console.log('Connecting to WebSocket:', wsUrl)

      websocket.value = new WebSocket(wsUrl)

      websocket.value.onopen = () => {
        console.log('WebSocket connected')
        isConnected.value = true
        resolve(true)
      }

      websocket.value.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data)
          console.log('ASR response:', response)

          if (response.code === 0 && response.result?.voice_text_str) {
            const text = response.result.voice_text_str
            const sliceType = response.result.slice_type

            if (text.trim()) {
              currentText.value = text

              if (sliceType === 2) {
                // Stable result
                emit('transcription-complete', text.trim())
              } else {
                // Unstable result
                emit('transcription-update', text.trim())
              }
            }
          } else if (response.code !== 0) {
            console.error('ASR error:', response.message || 'Unknown error')
            notification.error({
              message: t('ai.voiceRecognitionFailed'),
              description: response.message || 'Unknown error',
              duration: 3
            })
            stopRecording()
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      websocket.value.onerror = (error) => {
        console.error('WebSocket error:', error)
        isConnected.value = false
        reject(new Error('WebSocket connection error'))
      }

      websocket.value.onclose = () => {
        console.log('WebSocket closed')
        isConnected.value = false
      }

      // Connection timeout
      setTimeout(() => {
        if (!isConnected.value) {
          websocket.value?.close()
          reject(new Error('Connection timeout'))
        }
      }, 10000)
    } catch (error) {
      reject(error)
    }
  })
}

// Send PCM audio data
const sendPCMAudioData = async (pcmData: Int16Array) => {
  if (!websocket.value || !isConnected.value) {
    return
  }

  try {
    // Send binary PCM data directly
    websocket.value.send(pcmData.buffer)
  } catch (error) {
    console.error('Failed to send PCM data:', error)
  }
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
    // Reset state
    currentText.value = ''

    // Establish WebSocket connection
    try {
      await connectWebSocket()
    } catch (error) {
      notification.error({
        message: t('ai.voiceInputFailed'),
        description: t('ai.websocketConnectionFailed'),
        duration: 5
      })
      return
    }

    // Get audio stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true, // Echo cancellation
        noiseSuppression: true, // Noise suppression
        autoGainControl: true, // Auto gain control
        sampleRate: CONFIG.SAMPLE_RATE,
        channelCount: CONFIG.CHANNELS,
        sampleSize: CONFIG.BITS_PER_SAMPLE
      }
    })

    // Create AudioContext
    audioContext.value = new AudioContext({
      sampleRate: CONFIG.SAMPLE_RATE,
      latencyHint: 'interactive'
    })

    // Create audio source and processor
    audioSource.value = audioContext.value.createMediaStreamSource(stream)
    audioProcessor.value = audioContext.value.createScriptProcessor(CONFIG.BUFFER_SIZE, 1, 1)

    // Connect audio nodes
    audioSource.value.connect(audioProcessor.value)
    audioProcessor.value.connect(audioContext.value.destination)

    // Process audio data
    // onaudioprocess event is triggered whenever there is new audio data
    audioProcessor.value.onaudioprocess = (event) => {
      if (!isRecording.value || !websocket.value || !isConnected.value) {
        return
      }

      try {
        const inputData = event.inputBuffer.getChannelData(0)

        // Convert to 16-bit PCM data
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]))
          pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        }

        // Send PCM data
        sendPCMAudioData(pcmData)
      } catch (error) {
        console.error('Audio ls processing error:', error)
      }
    }

    // Start recording
    isRecording.value = true

    // Auto-stop after 60 seconds
    recordingTimeout.value = window.setTimeout(() => {
      if (isRecording.value) {
        notification.warning({
          message: t('ai.recordingTimeLimit'),
          description: t('ai.recordingTimeLimitDesc'),
          duration: 2
        })
        stopRecording()
      }
    }, 60000)

    console.log('Started recording')
  } catch (error) {
    console.error('Failed to start recording:', error)

    let errorMessage = t('ai.voiceInputFailed')
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        errorMessage = t('ai.microphonePermissionDenied')
      } else if (error.name === 'NotFoundError') {
        errorMessage = t('ai.microphoneNotFound')
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
  if (isRecording.value) {
    console.log('Stopping recording')

    // Send recording end signal
    if (websocket.value && isConnected.value) {
      try {
        websocket.value.send(JSON.stringify({ type: 'end' }))
        console.log('Recording end signal sent')
      } catch (error) {
        console.error('Failed to send end signal:', error)
      }
    }

    // Cleanup audio resources
    if (audioProcessor.value) {
      audioProcessor.value.disconnect()
      audioProcessor.value = null
    }
    if (audioSource.value) {
      audioSource.value.disconnect()
      audioSource.value = null
    }
    if (audioContext.value) {
      audioContext.value.close()
      audioContext.value = null
    }

    // Reset state
    isRecording.value = false
    currentText.value = ''

    if (recordingTimeout.value) {
      clearTimeout(recordingTimeout.value)
      recordingTimeout.value = null
    }

    // Close WebSocket
    if (websocket.value) {
      websocket.value.close()
      websocket.value = null
      isConnected.value = false
    }

    emit('recording-stop')
    console.log('Recording stopped')
  }
}

// Cleanup resources
onUnmounted(() => {
  if (isRecording.value) {
    stopRecording()
  }
})

// Expose stopRecording function to parent component
defineExpose({
  stopRecording
})
</script>

<style>
/* Voice button base styles */
.voice-button {
  transition: all 0.3s ease;
}

.voice-button.recording {
  background-color: #1890ff;
  border-color: #1890ff;
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

/* Button styles */
.custom-round-button {
  height: 18px;
  width: 18px;
  padding: 0;
  border-radius: 50%;
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

.custom-round-button img {
  filter: brightness(1) contrast(1);
  opacity: 1;
}
</style>
