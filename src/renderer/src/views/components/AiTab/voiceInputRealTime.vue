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
  autoSendAfterVoice?: boolean
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

// 腾讯云配置 - 直接写在组件中
// 根据腾讯云ASR官方文档要求：
// 1. 音频数据：每64ms发送2048字节(16kHz)的PCM原始音频数据
// 2. 传输格式：直接发送二进制PCM数据，不使用JSON包装
// 3. 控制消息：录音结束后发送 {"type": "end"} 文本消息
// 4. 音频格式：仅使用PCM原始数据，通过AudioContext获取，确保格式兼容性
// 5. Buffer设置：使用1024采样点(64ms)，符合AudioContext的2的幂次方要求
// 6. 数据发送：使用WebSocket binary message，符合腾讯云ASR要求
const TENCENT_CONFIG = {
  // 后端WebSocket接口地址
  WS_URL: import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:8801/ws/speech/asr',

  // 音频采样率
  SAMPLE_RATE: parseInt(import.meta.env.VITE_TENCENT_SAMPLE_RATE || '16000'),

  // 音频声道数
  CHANNELS: parseInt(import.meta.env.VITE_TENCENT_CHANNELS || '1'),

  // 音频位深度
  BITS_PER_SAMPLE: parseInt(import.meta.env.VITE_TENCENT_BITS_PER_SAMPLE || '16'),

  // 音频数据块大小 (每40ms的数据量，符合腾讯云ASR要求)
  CHUNK_SIZE: parseInt(import.meta.env.VITE_TENCENT_CHUNK_SIZE || '1280'), // 16kHz * 2字节 * 0.04秒

  // 音频数据块发送间隔 (毫秒，腾讯云ASR推荐40ms)
  CHUNK_INTERVAL: parseInt(import.meta.env.VITE_TENCENT_CHUNK_INTERVAL || '40'),

  // 最大录制时长 (毫秒)
  MAX_RECORDING_TIME: parseInt(import.meta.env.VITE_TENCENT_MAX_RECORDING_TIME || '60000'),

  // 连接超时时间 (毫秒)
  CONNECTION_TIMEOUT: parseInt(import.meta.env.VITE_TENCENT_CONNECTION_TIMEOUT || '10000'),

  // 心跳间隔 (毫秒)
  HEARTBEAT_INTERVAL: parseInt(import.meta.env.VITE_TENCENT_HEARTBEAT_INTERVAL || '30000')
}

// 检查后端WebSocket配置是否有效
const isBackendConfigValid = (): boolean => {
  const wsUrl = TENCENT_CONFIG.WS_URL
  console.log('WebSocket URL:', wsUrl)

  // 检查URL格式
  if (!wsUrl || wsUrl === 'ws://localhost:8801/ws/speech/asr') {
    console.warn('Using default WebSocket URL, make sure backend is running on localhost:8801')
  }

  return true
}

// 获取最佳音频格式
const getBestAudioFormat = () => {
  // 优先选择PCM兼容的格式，确保音频数据能被腾讯云ASR正确处理
  const preferredFormats = [
    'audio/webm;codecs=pcm', // WebM容器中的PCM编码
    'audio/webm;codecs=opus', // WebM容器中的Opus编码（高质量）
    'audio/webm', // 标准WebM格式
    'audio/ogg;codecs=opus', // Ogg容器中的Opus编码
    'audio/wav' // WAV格式（PCM编码）
  ]

  for (const format of preferredFormats) {
    if (MediaRecorder.isTypeSupported(format)) {
      console.log('Supported audio format found:', format)
      return format
    }
  }

  // 如果没有找到支持的格式，返回空字符串使用默认格式
  console.warn('No preferred audio format supported, using default')
  return ''
}

// 语音录制相关状态
const isRecording = ref(false)
const mediaRecorder = ref<MediaRecorder | null>(null)
const audioChunks = ref<Blob[]>([])
const recordingTimeout = ref<NodeJS.Timeout | null>(null)
const voiceButton = ref<HTMLElement | null>(null)

// WebSocket相关状态
const websocket = ref<WebSocket | null>(null)
const voiceId = ref<string>('')
const isConnected = ref(false)
const currentText = ref<string>('')

// 音频发送控制状态
const lastSendTime = ref<number>(0)
const sendInterval = ref<NodeJS.Timeout | null>(null)
// 静音检测和持续连接状态
const lastAudioActivity = ref<number>(0)
const silenceTimeout = ref<NodeJS.Timeout | null>(null)
const keepAliveInterval = ref<NodeJS.Timeout | null>(null)

// PCM音频录制相关状态
const audioContext = ref<AudioContext | null>(null)
const audioSource = ref<MediaStreamAudioSourceNode | null>(null)
const audioProcessor = ref<ScriptProcessorNode | null>(null)
const isPCMRecording = ref(false)

// 生成UUID
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// 分割音频数据包
const splitAudioChunk = async (audioBlob: Blob, targetSize: number): Promise<Blob[]> => {
  const chunks: Blob[] = []
  const arrayBuffer = await audioBlob.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)

  let offset = 0
  while (offset < uint8Array.length) {
    const chunkSize = Math.min(targetSize, uint8Array.length - offset)
    const chunkArray = uint8Array.slice(offset, offset + chunkSize)
    const chunkBlob = new Blob([chunkArray], { type: audioBlob.type })
    chunks.push(chunkBlob)
    offset += chunkSize
  }

  return chunks
}

// 建立WebSocket连接
const connectWebSocket = async (): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    try {
      // 生成voice_id
      voiceId.value = generateUUID()

      // 直接连接后端的WebSocket接口
      const wsUrl = TENCENT_CONFIG.WS_URL

      console.log('Connecting to backend WebSocket ASR:', wsUrl)

      // 创建WebSocket连接，不添加额外的协议头
      websocket.value = new WebSocket(wsUrl)

      websocket.value.onopen = () => {
        console.log('WebSocket connected to backend ASR')
        isConnected.value = true

        // // 发送初始化消息
        // const initMessage = {
        //   type: 'start'
        // }
        // if (websocket.value) {
        //   websocket.value.send(JSON.stringify(initMessage))
        //   console.log('Start message sent to backend')
        // }

        resolve(true)
      }

      websocket.value.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data)
          console.log('Backend ASR response:', response)

          if (response.code === 0) {
            if (response.final === 1) {
              // 识别完成
              console.log('Recognition completed')
              if (currentText.value.trim()) {
                emit('transcription-complete', currentText.value.trim())
                currentText.value = ''
              }
              // stopRecording()
            } else if (response.result && response.result.voice_text_str) {
              // 根据 slice_type 处理识别结果
              const text = response.result.voice_text_str
              const sliceType = response.result.slice_type

              if (text.trim()) {
                if (sliceType === 2) {
                  // slice_type = 2: 语音段识别结束，结果是稳态的
                  console.log('Stable recognition result (slice_type=2):', text)
                  currentText.value = text
                  // 稳态结果通过 transcription-complete 事件返回，父组件会将其添加到 chatInputValue 中
                  emit('transcription-complete', currentText.value.trim())
                } else if (sliceType === 1) {
                  // slice_type = 1: 语音段识别进行中，结果不稳定
                  console.log('Unstable recognition result (slice_type=1):', text)
                  currentText.value = text
                  // 非稳态结果通过 transcription-update 事件返回，用于显示但不添加到 chatInputValue
                  emit('transcription-update', currentText.value.trim())
                } else if (sliceType === 0) {
                  // slice_type = 0: 语音段识别开始
                  console.log('Recognition started (slice_type=0):', text)
                  currentText.value = text
                  // 开始识别时通过 transcription-update 事件返回，用于显示
                  emit('transcription-update', currentText.value.trim())
                } else {
                  // 没有 slice_type 字段时的兼容处理
                  console.log('No slice_type, treating as real-time result:', text)
                  currentText.value = text
                  emit('transcription-update', currentText.value.trim())
                }

                console.log('Updated currentText to:', currentText.value)
              } else {
                console.log('voice_text_str is empty or whitespace only')
              }
            } else {
              console.log('No voice_text_str in response.result:', response.result)
            }
          } else {
            // 错误处理
            console.error('Backend ASR error:', response.message || response.error || 'Unknown error')
            notification.error({
              message: t('ai.voiceRecognitionFailed'),
              description: response.message || response.error || 'Unknown error',
              duration: 3
            })
            stopRecording()
            reject(new Error(response.message || response.error || 'Unknown error'))
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
          console.error('Raw message data:', event.data)
        }
      }

      websocket.value.onerror = (error) => {
        console.error('WebSocket error:', error)
        isConnected.value = false
        reject(new Error('WebSocket连接错误，请检查后端服务是否正常运行'))
      }

      websocket.value.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason)
        isConnected.value = false

        // 根据关闭代码提供更详细的错误信息
        let closeMessage = 'WebSocket连接已关闭'
        switch (event.code) {
          case 1000:
            closeMessage = '正常关闭'
            break
          case 1001:
            closeMessage = '端点离开'
            break
          case 1002:
            closeMessage = '协议错误'
            break
          case 1003:
            closeMessage = '不支持的数据类型'
            break
          case 1006:
            closeMessage = '连接异常关闭'
            break
          case 1011:
            closeMessage = '服务器错误'
            break
          case 1015:
            closeMessage = 'TLS握手失败'
            break
          default:
            closeMessage = `连接关闭 (代码: ${event.code})`
        }

        console.log(closeMessage)

        // 如果不是正常关闭，记录错误
        if (event.code !== 1000) {
          console.error('WebSocket异常关闭:', closeMessage)
        }
      }

      // 设置连接超时
      setTimeout(() => {
        if (!isConnected.value) {
          if (websocket.value) {
            websocket.value.close()
          }
          reject(new Error(`连接超时 (${TENCENT_CONFIG.CONNECTION_TIMEOUT}ms)，请检查后端服务地址: ${wsUrl}`))
        }
      }, TENCENT_CONFIG.CONNECTION_TIMEOUT)
    } catch (error) {
      reject(error)
    }
  })
}

// 发送音频数据
const sendAudioData = async (audioBlob: Blob) => {
  if (!websocket.value || !isConnected.value) {
    throw new Error('WebSocket not connected')
  }

  try {
    // 发送速率控制 - 确保不超过腾讯云ASR要求
    const now = Date.now()
    const timeSinceLastSend = now - lastSendTime.value

    // 检查发送间隔是否过短（小于20ms，考虑到分割后的数据包）
    if (timeSinceLastSend < 20) {
      console.warn(`Sending too fast: ${timeSinceLastSend}ms since last send, minimum interval: 20ms`)
      return
    }

    // 检查发送间隔是否过长（超过6秒）
    if (timeSinceLastSend > 6000) {
      console.warn(`Sending too slow: ${timeSinceLastSend}ms since last send, maximum interval: 6000ms`)
    }

    // 更新最后发送时间
    lastSendTime.value = now

    // 详细记录音频数据信息
    console.log('Audio blob details:', {
      size: audioBlob.size,
      type: audioBlob.type
    })

    // 检查音频数据是否有效
    if (audioBlob.size === 0) {
      console.error('Audio blob is empty, skipping send')
      return
    }

    // 验证音频数据包大小是否符合腾讯云ASR要求
    const expectedSize = TENCENT_CONFIG.CHUNK_SIZE // 1280字节 (16kHz * 2字节 * 0.04秒)
    if (audioBlob.size < expectedSize * 0.5) {
      // 允许50%的误差
      console.warn(`Audio chunk size (${audioBlob.size}) is too small, expected around ${expectedSize} bytes`)
    } else if (audioBlob.size > expectedSize * 2) {
      // 允许100%的误差
      console.warn(`Audio chunk size (${audioBlob.size}) is too large, expected around ${expectedSize} bytes`)
    }

    // 按照新格式发送：base64编码的JSON消息
    try {
      const arrayBuffer = await audioBlob.arrayBuffer()
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

      websocket.value.send(
        JSON.stringify({
          type: 'audio',
          data: base64Data
        })
      )

      console.log(
        'Audio data sent as base64 JSON, original size:',
        audioBlob.size,
        'bytes, base64 length:',
        base64Data.length,
        'chars, interval:',
        timeSinceLastSend,
        'ms'
      )
    } catch (error) {
      console.error('发送音频数据失败:', error)
      throw error
    }
  } catch (error) {
    console.error('Failed to send audio data:', error)
    throw error
  }
}

// 验证PCM数据格式
const validatePCMData = (uint8Array: Uint8Array): boolean => {
  // 检查数据长度是否为偶数（16位PCM应该是2字节对齐）
  if (uint8Array.length % 2 !== 0) {
    console.warn('PCM data length is not even, may not be 16-bit aligned')
    return false
  }

  // 检查数据大小是否符合预期
  // 使用1024采样点(64ms)作为基准，16位PCM = 2048字节
  const expectedSize = 1024 * 2 // 2048字节 (1024采样点 × 2字节)
  if (uint8Array.length < expectedSize * 0.5 || uint8Array.length > expectedSize * 2) {
    console.warn(`PCM data size (${uint8Array.length}) is outside expected range (${expectedSize * 0.5} - ${expectedSize * 2})`)
    return false
  }

  // 检查前几个字节，确保不是WebM或其他容器格式
  if (uint8Array.length >= 4) {
    const header = uint8Array.slice(0, 4)

    // WebM格式检测
    if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) {
      console.error('Detected WebM format in PCM data - this should not happen!')
      return false
    }

    // WAV格式检测
    if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
      console.error('Detected WAV format in PCM data - this should not happen!')
      return false
    }

    // OGG格式检测
    if (header[0] === 0x4f && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53) {
      console.error('Detected OGG format in PCM data - this should not happen!')
      return false
    }
  }

  return true
}

// 发送PCM音频数据
const sendPCMAudioData = async (pcmBlob: Blob) => {
  if (!websocket.value || !isConnected.value) {
    throw new Error('WebSocket not connected')
  }

  try {
    // 发送速率控制 - 确保不超过腾讯云ASR要求
    const now = Date.now()
    const timeSinceLastSend = now - lastSendTime.value

    // 检查发送间隔是否过短（小于20ms，考虑到分割后的数据包）
    if (timeSinceLastSend < 20) {
      console.warn(`Sending too fast: ${timeSinceLastSend}ms since last send, minimum interval: 20ms`)
      return
    }

    // 检查发送间隔是否过长（超过6秒）
    if (timeSinceLastSend > 6000) {
      console.warn(`Sending too slow: ${timeSinceLastSend}ms since last send, maximum interval: 6000ms`)
    }

    // 更新最后发送时间
    lastSendTime.value = now

    // 详细记录PCM音频数据信息
    console.log('PCM audio blob details:', {
      size: pcmBlob.size,
      type: pcmBlob.type,
      expectedType: 'audio/pcm'
    })

    // 验证PCM数据类型
    if (pcmBlob.type !== 'audio/pcm') {
      console.error('Invalid PCM blob type:', pcmBlob.type, 'expected: audio/pcm')
      return
    }

    // 检查音频数据是否有效
    if (pcmBlob.size === 0) {
      console.error('PCM audio blob is empty, skipping send')
      return
    }

    // 验证音频数据包大小是否符合腾讯云ASR要求
    // 使用1024采样点(64ms)作为基准，16位PCM = 2048字节
    const expectedSize = 1024 * 2 // 2048字节 (1024采样点 × 2字节)
    if (pcmBlob.size < expectedSize * 0.5) {
      // 允许50%的误差
      console.warn(`PCM audio chunk size (${pcmBlob.size}) is too small, expected around ${expectedSize} bytes`)
    } else if (pcmBlob.size > expectedSize * 2) {
      // 允许100%的误差
      console.warn(`PCM audio chunk size (${pcmBlob.size}) is too large, expected around ${expectedSize} bytes`)
    } else {
      console.log(`PCM audio chunk size (${pcmBlob.size}) is within expected range (${expectedSize} bytes)`)
    }

    // 验证PCM数据格式 - 检查前几个字节确认是16位PCM
    try {
      const arrayBuffer = await pcmBlob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      // 记录前16个字节用于调试
      const firstBytes = Array.from(uint8Array.slice(0, 16)).map((b) => '0x' + b.toString(16).padStart(2, '0'))
      console.log('PCM data first 16 bytes:', firstBytes.join(' '))

      // 验证PCM数据格式
      if (!validatePCMData(uint8Array)) {
        console.error('PCM data validation failed, skipping send')
        return
      }

      // 直接发送二进制PCM数据给腾讯云ASR
      // 根据腾讯云ASR要求：客户端持续上传binary message，内容为音频流二进制数据
      websocket.value.send(arrayBuffer)

      console.log('PCM audio data sent as binary message, size:', pcmBlob.size, 'bytes, interval:', timeSinceLastSend, 'ms')
    } catch (error) {
      console.error('发送PCM音频数据失败:', error)
      throw error
    }
  } catch (error) {
    console.error('Failed to send PCM audio data:', error)
    throw error
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

const startMediaRecorderRecording = async (stream: MediaStream, websocketConnected: boolean) => {
  try {
    // 获取最佳音频格式 - 优先选择PCM兼容格式
    const mimeType = getBestAudioFormat()
    console.log('Selected audio format:', mimeType)

    // 等待音频流稳定
    await new Promise((resolve) => setTimeout(resolve, 100))

    mediaRecorder.value = new MediaRecorder(stream, {
      mimeType: mimeType,
      audioBitsPerSecond: TENCENT_CONFIG.SAMPLE_RATE * 16 // 16位采样
    })

    audioChunks.value = []

    mediaRecorder.value.ondataavailable = async (event) => {
      console.log('ondataavailable triggered, data size:', event.data.size, 'type:', event.data.type)

      if (event.data.size > 0) {
        audioChunks.value.push(event.data)

        // 数据包大小控制 - 确保符合腾讯云ASR要求
        const maxChunkSize = TENCENT_CONFIG.CHUNK_SIZE * 2 // 允许最大2560字节
        if (event.data.size > maxChunkSize) {
          console.warn(`Audio chunk too large (${event.data.size} bytes), splitting...`)

          // 将大数据包分割成多个小数据包
          const chunks = await splitAudioChunk(event.data, TENCENT_CONFIG.CHUNK_SIZE)
          console.log(`Split into ${chunks.length} chunks`)

          // 发送分割后的数据包
          for (const chunk of chunks) {
            if (websocket.value && isConnected.value && websocketConnected) {
              try {
                await sendAudioData(chunk)
                console.log('Split audio chunk sent, size:', chunk.size)
              } catch (error) {
                console.error('Failed to send split audio chunk:', error)
              }
            }
          }
        } else {
          // 正常大小的数据包，直接发送
          if (websocket.value && isConnected.value && websocketConnected) {
            try {
              await sendAudioData(event.data)
              console.log('Real-time audio chunk sent, size:', event.data.size)
            } catch (error) {
              console.error('Failed to send real-time audio chunk:', error)
              // 实时发送失败不影响录制，继续录制
            }
          }
        }
      } else {
        console.warn('ondataavailable triggered but data size is 0')
      }
    }

    mediaRecorder.value.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunks.value, { type: mimeType })

        // 检查录制时长
        if (audioBlob.size < 1024) {
          notification.warning({
            message: t('ai.recordingTooShort'),
            description: t('ai.recordingTooShortDesc'),
            duration: 2
          })
          return
        }

        console.log('Recording stopped, total audio size:', audioBlob.size)

        // 如果WebSocket连接成功，发送录制结束信号
        if (websocket.value && isConnected.value && websocketConnected) {
          try {
            // 发送录制结束信号
            const endMessage = {
              type: 'end'
            }
            if (websocket.value) {
              websocket.value.send(JSON.stringify(endMessage))
              console.log('Recording end signal sent to backend (Tencent Cloud format)')
            }
          } catch (error) {
            console.error('Failed to send recording end signal:', error)
            // WebSocket失败，显示错误信息
            notification.error({
              message: t('ai.voiceRecognitionFailed'),
              description: '发送录制结束信号失败',
              duration: 3
            })
          }
        } else {
          // WebSocket未连接，显示错误信息
          notification.error({
            message: t('ai.voiceRecognitionFailed'),
            description: 'WebSocket连接已断开，无法完成语音识别',
            duration: 3
          })
        }

        // 停止所有音频轨道
        stream.getTracks().forEach((track) => track.stop())
      } catch (error) {
        console.error('Failed to process audio:', error)
        notification.error({
          message: t('ai.voiceRecognitionFailed'),
          description: error instanceof Error ? error.message : String(error),
          duration: 3
        })
        emit('transcription-error', error instanceof Error ? error.message : String(error))
      }
    }

    mediaRecorder.value.onerror = (event) => {
      console.error('Recording error:', event.error)
      notification.error({
        message: t('ai.recordingFailed'),
        description: t('ai.recordingErrorDesc'),
        duration: 3
      })
    }

    // 开始录制 - 严格按照腾讯云ASR官方要求
    // 每40ms触发一次ondataavailable事件，确保1:1实时率
    // 对应16kHz采样率：1280字节/40ms
    mediaRecorder.value.start(TENCENT_CONFIG.CHUNK_INTERVAL) // 40ms间隔
    isRecording.value = true

    // 监控音频流状态
    const audioTrack = stream.getAudioTracks()[0]
    if (audioTrack) {
      console.log('Audio track state:', {
        enabled: audioTrack.enabled,
        muted: audioTrack.muted,
        readyState: audioTrack.readyState,
        id: audioTrack.id
      })

      // 监听音频轨道状态变化
      audioTrack.onended = () => console.log('Audio track ended')
      audioTrack.onmute = () => console.log('Audio track muted')
      audioTrack.onunmute = () => console.log('Audio track unmuted')
    }

    console.log('Started recording with real-time audio streaming')
    console.log('Audio chunk interval:', TENCENT_CONFIG.CHUNK_INTERVAL, 'ms')
    console.log('Audio chunk size:', TENCENT_CONFIG.CHUNK_SIZE, 'bytes')
    console.log('Transmission mode: Base64 encoded JSON messages')
    console.log('WebSocket connected:', isConnected.value)
    if (websocket.value && isConnected.value && websocketConnected) {
      console.log('Real-time audio streaming enabled (Base64 JSON mode)')
    } else {
      console.log('Real-time streaming disabled, will use API fallback')
    }

    // 添加录制状态监控
    const recordingMonitor = setInterval(() => {
      if (isRecording.value) {
        console.log('Recording status:', {
          isRecording: isRecording.value,
          audioChunksCount: audioChunks.value.length,
          totalChunksSize: audioChunks.value.reduce((sum, chunk) => sum + chunk.size, 0),
          mediaRecorderState: mediaRecorder.value?.state,
          streamActive: stream.active
        })
      } else {
        clearInterval(recordingMonitor)
      }
    }, 1000) // 每秒监控一次
  } catch (error) {
    console.error('Failed to start MediaRecorder recording:', error)
    throw error
  }
}

const startRecording = async () => {
  try {
    // 重置状态
    currentText.value = ''

    // 检查配置
    isBackendConfigValid()

    // 尝试建立WebSocket连接
    let websocketConnected = false
    try {
      await connectWebSocket()
      websocketConnected = true
      console.log('WebSocket connected successfully')
    } catch (error) {
      console.error('WebSocket connection failed:', error)
      websocketConnected = false

      // WebSocket连接失败，显示错误信息，不继续录制
      notification.error({
        message: t('ai.voiceInputFailed'),
        description: 'WebSocket连接失败，无法进行实时语音识别。请检查后端服务是否正常运行。',
        duration: 5
      })
      return // 直接返回，不继续录制
    }

    // 获取音频流 - 强制获取PCM格式的原始数据
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: TENCENT_CONFIG.SAMPLE_RATE,
        channelCount: 1, // 强制单声道
        sampleSize: 16 // 16位采样
      }
    })

    // 检查音频流状态
    console.log('Audio stream obtained:', {
      id: stream.id,
      active: stream.active,
      tracks: stream.getTracks().map((track) => ({
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      }))
    })

    // 使用AudioContext获取PCM原始数据 - 这是唯一的录制方式
    try {
      // 创建AudioContext，强制使用16kHz采样率
      audioContext.value = new AudioContext({
        sampleRate: TENCENT_CONFIG.SAMPLE_RATE,
        latencyHint: 'interactive'
      })

      // 创建音频源
      audioSource.value = audioContext.value.createMediaStreamSource(stream)

      // 创建音频处理器，使用2的幂次方buffer size
      // 腾讯云ASR要求：每40ms发送1280字节(16kHz * 2字节 * 0.04秒)
      // 16kHz采样率下，40ms = 640个采样点，但buffer size必须是2的幂次方
      // 选择1024个采样点（64ms）作为buffer size，这样更接近腾讯云ASR期望
      const bufferSize = 1024 // 必须是2的幂次方：256, 512, 1024, 2048, 4096, 8192, 16384
      const actualInterval = (bufferSize / TENCENT_CONFIG.SAMPLE_RATE) * 1000 // 实际间隔（毫秒）

      console.log('AudioContext buffer configuration:', {
        sampleRate: TENCENT_CONFIG.SAMPLE_RATE,
        bufferSize: bufferSize,
        actualInterval: actualInterval.toFixed(2) + 'ms',
        expectedInterval: TENCENT_CONFIG.CHUNK_INTERVAL + 'ms',
        samplesPerBuffer: bufferSize,
        bytesPerBuffer: bufferSize * 2 // 16位 = 2字节
      })

      audioProcessor.value = audioContext.value.createScriptProcessor(bufferSize, 1, 1)

      // 连接音频节点
      audioSource.value.connect(audioProcessor.value)
      audioProcessor.value.connect(audioContext.value.destination)

      // 处理音频数据
      audioProcessor.value.onaudioprocess = (event) => {
        if (!isPCMRecording.value || !websocket.value || !isConnected.value || !websocketConnected) {
          return
        }

        try {
          // 获取输入音频数据
          const inputData = event.inputBuffer.getChannelData(0)

          // 转换为16位PCM数据
          const pcmData = new Int16Array(inputData.length)
          for (let i = 0; i < inputData.length; i++) {
            // 将float32转换为int16
            const sample = Math.max(-1, Math.min(1, inputData[i]))
            pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
          }

          // 创建PCM数据Blob
          const pcmBlob = new Blob([pcmData.buffer], { type: 'audio/pcm' })

          // 发送PCM数据
          sendPCMAudioData(pcmBlob)
        } catch (error) {
          console.error('PCM audio processing error:', error)
        }
      }

      // 开始PCM录制
      isPCMRecording.value = true
      isRecording.value = true

      console.log('Started PCM recording with AudioContext')
      console.log('Sample rate:', TENCENT_CONFIG.SAMPLE_RATE, 'Hz')
      console.log('Buffer size:', bufferSize, 'samples')
      console.log('Actual interval:', actualInterval.toFixed(2), 'ms')
      console.log('Expected PCM data size:', bufferSize * 2, 'bytes (16-bit)')
      console.log('Recording mode: PCM only (no MediaRecorder fallback)')
      console.log('Data transmission: Binary PCM messages (not JSON)')
    } catch (error) {
      console.error('Failed to setup AudioContext:', error)

      // PCM录制失败，显示错误信息，不继续录制
      notification.error({
        message: t('ai.voiceInputFailed'),
        description: 'PCM音频录制初始化失败，无法进行语音识别。请检查浏览器兼容性。',
        duration: 5
      })

      // 停止音频流
      stream.getTracks().forEach((track) => track.stop())
      return
    }

    // 添加60秒自动停止录制的超时
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
    console.error('Failed to start recording:', error)

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
  if (isRecording.value) {
    console.log('Stopping recording')

    // 停止PCM录制
    if (isPCMRecording.value) {
      try {
        // 发送录制结束信号
        if (websocket.value && isConnected.value) {
          const endMessage = {
            type: 'end'
          }
          websocket.value.send(JSON.stringify(endMessage))
          console.log('PCM recording end signal sent to backend')
        }

        // 清理AudioContext资源
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
        isPCMRecording.value = false
        console.log('PCM recording stopped and resources cleaned up')
      } catch (error) {
        console.error('Error stopping PCM recording:', error)
      }
    }

    // 停止MediaRecorder录制（如果存在）
    if (mediaRecorder.value && mediaRecorder.value.state !== 'inactive') {
      try {
        mediaRecorder.value.stop()
      } catch (error) {
        console.error('Error stopping MediaRecorder:', error)
      }
    }

    // 重置录制状态
    isRecording.value = false

    if (recordingTimeout.value) {
      clearTimeout(recordingTimeout.value)
      recordingTimeout.value = null
    }
  }

  // 关闭WebSocket连接
  if (websocket.value) {
    websocket.value.close()
    websocket.value = null
    isConnected.value = false
  }

  // 重置其他相关状态
  currentText.value = ''
  voiceId.value = ''

  // 发出录制停止事件
  emit('recording-stop')

  console.log('Recording stopped, all states reset')
}

// 清理资源
onUnmounted(() => {
  if (isRecording.value) {
    stopRecording()
  }
  if (recordingTimeout.value) {
    clearTimeout(recordingTimeout.value)
  }
  if (websocket.value) {
    websocket.value.close()
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

/* 从父组件复制过来的按钮样式 */
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

/* 确保图标样式正确 */
.custom-round-button img {
  filter: brightness(1) contrast(1);
  opacity: 1;
}
</style>
