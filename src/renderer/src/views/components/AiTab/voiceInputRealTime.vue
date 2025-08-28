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

// 国际化
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

// 配置
const CONFIG = {
  // WS_URL: 'ws://localhost:8801/v1/speech/asr',
  WS_URL: 'ws://demo.chaterm.ai/v1/speech/asr',
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  BITS_PER_SAMPLE: 16,
  BUFFER_SIZE: 1024, // 64ms at 16kHz
  CHUNK_INTERVAL: 40 // ms
}

// 状态
const isRecording = ref(false)
const websocket = ref<WebSocket | null>(null)
const isConnected = ref(false)
const currentText = ref<string>('')
const audioContext = ref<AudioContext | null>(null)
const audioSource = ref<MediaStreamAudioSourceNode | null>(null)
const audioProcessor = ref<ScriptProcessorNode | null>(null)
const recordingTimeout = ref<number | null>(null)

// 建立WebSocket连接
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
                // 稳态结果
                emit('transcription-complete', text.trim())
              } else {
                // 非稳态结果
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
        reject(new Error('WebSocket连接错误'))
      }

      websocket.value.onclose = () => {
        console.log('WebSocket closed')
        isConnected.value = false
      }

      // 连接超时
      setTimeout(() => {
        if (!isConnected.value) {
          websocket.value?.close()
          reject(new Error('连接超时'))
        }
      }, 10000)
    } catch (error) {
      reject(error)
    }
  })
}

// 发送PCM音频数据
const sendPCMAudioData = async (pcmData: Int16Array) => {
  if (!websocket.value || !isConnected.value) {
    return
  }

  try {
    // 直接发送二进制PCM数据
    websocket.value.send(pcmData.buffer)
  } catch (error) {
    console.error('Failed to send PCM data:', error)
  }
}

// 语音录制功能
const toggleVoiceInput = async () => {
  if (isRecording.value) {
    stopRecording()
  } else {
    await startRecording()
  }
}

const startRecording = async () => {
  try {
    // 重置状态
    currentText.value = ''

    // 建立WebSocket连接
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

    // 获取音频流
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true, // 回声消除
        noiseSuppression: true, // 噪声抑制
        autoGainControl: true, // 自动增益控制
        sampleRate: CONFIG.SAMPLE_RATE,
        channelCount: CONFIG.CHANNELS,
        sampleSize: CONFIG.BITS_PER_SAMPLE
      }
    })

    // 创建AudioContext
    audioContext.value = new AudioContext({
      sampleRate: CONFIG.SAMPLE_RATE,
      latencyHint: 'interactive'
    })

    // 创建音频源和处理器
    audioSource.value = audioContext.value.createMediaStreamSource(stream)
    audioProcessor.value = audioContext.value.createScriptProcessor(CONFIG.BUFFER_SIZE, 1, 1)

    // 连接音频节点
    audioSource.value.connect(audioProcessor.value)
    audioProcessor.value.connect(audioContext.value.destination)

    // 处理音频数据
    // 每当有新的音频数据时，会触发 onaudioprocess 事件
    audioProcessor.value.onaudioprocess = (event) => {
      if (!isRecording.value || !websocket.value || !isConnected.value) {
        return
      }

      try {
        const inputData = event.inputBuffer.getChannelData(0)

        // 转换为16位PCM数据
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]))
          pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        }

        // 发送PCM数据
        sendPCMAudioData(pcmData)
      } catch (error) {
        console.error('Audio ls processing error:', error)
      }
    }

    // 开始录制
    isRecording.value = true

    // 60秒自动停止
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

    // 发送录制结束信号
    if (websocket.value && isConnected.value) {
      try {
        websocket.value.send(JSON.stringify({ type: 'end' }))
        console.log('Recording end signal sent')
      } catch (error) {
        console.error('Failed to send end signal:', error)
      }
    }

    // 清理音频资源
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

    // 重置状态
    isRecording.value = false
    currentText.value = ''

    if (recordingTimeout.value) {
      clearTimeout(recordingTimeout.value)
      recordingTimeout.value = null
    }

    // 关闭WebSocket
    if (websocket.value) {
      websocket.value.close()
      websocket.value = null
      isConnected.value = false
    }

    emit('recording-stop')
    console.log('Recording stopped')
  }
}

// 清理资源
onUnmounted(() => {
  if (isRecording.value) {
    stopRecording()
  }
})

// 暴露 stopRecording 函数给父组件调用
defineExpose({
  stopRecording
})
</script>

<style>
/* 语音按钮基础样式 */
.voice-button {
  transition: all 0.3s ease;
}

.voice-button.recording {
  background-color: #1890ff;
  border-color: #1890ff;
  color: white;
}

/* 录制动画样式 */
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

/* 按钮样式 */
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
