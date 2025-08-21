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
          style="width: 18px; height: 18px"
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

// 国际化
const { t } = useI18n()

// Props
interface Props {
  disabled?: boolean
  autoSendAfterVoice?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
  // autoSendAfterVoice: true
})

// Emits
const emit = defineEmits<{
  'transcription-complete': [text: string]
  'transcription-error': [error: string]
}>()

// 语音识别配置
const SPEECH_CONFIG = {
  // 最大音频文件大小 (50MB)
  MAX_AUDIO_SIZE: 50 * 1024 * 1024,
  // 后端支持的音频格式
  SUPPORTED_FORMATS: [
    'wav', // WAV格式，无损音频
    'pcm', // PCM格式，原始音频数据
    'ogg-opus', // OGG with Opus编码
    'speex', // Speex编码格式
    'silk', // Silk编码格式
    'mp3', // MP3格式，有损压缩
    'm4a', // M4A格式，AAC编码
    'aac', // AAC格式，高质量压缩
    'amr' // AMR格式，移动设备优化
  ]
}

// 语音录制相关状态
const isRecording = ref(false)
const mediaRecorder = ref<MediaRecorder | null>(null)
const audioChunks = ref<Blob[]>([])
const recordingTimeout = ref<NodeJS.Timeout | null>(null)
const voiceButton = ref<HTMLElement | null>(null)

// 获取最佳音频格式
const getBestAudioFormat = () => {
  const preferredFormats = ['audio/webm', 'audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp3', 'audio/m4a', 'audio/aac', 'audio/wav']

  for (const format of preferredFormats) {
    if (MediaRecorder.isTypeSupported(format)) {
      return format
    }
  }
  return '' // 使用默认格式
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
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000 // 推荐采样率
      }
    })

    // 获取最佳音频格式
    const mimeType = getBestAudioFormat()

    mediaRecorder.value = new MediaRecorder(stream, {
      mimeType: mimeType,
      audioBitsPerSecond: 128000 // 适中的音质
    })

    audioChunks.value = []

    mediaRecorder.value.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.value.push(event.data)
      }
    }

    mediaRecorder.value.onstop = async () => {
      const audioBlob = new Blob(audioChunks.value, { type: mimeType })

      // 检查录制时长，太短的录制可能没有有效内容
      if (audioBlob.size < 1024) {
        // 小于1KB
        notification.warning({
          message: t('ai.recordingTooShort'),
          description: t('ai.recordingTooShortDesc'),
          duration: 2
        })
        return
      }

      await transcribeAudio(audioBlob)

      // 停止所有音频轨道
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

    // 开始录制，每100ms收集一次数据
    mediaRecorder.value.start(100)
    isRecording.value = true

    console.log('开始语音录制，使用的格式:', mimeType)

    // // 显示录制开始提示
    // notification.info({
    //   message: t('ai.startRecording'),
    //   description: t('ai.startRecordingDesc', { formats: getSupportedFormatsDescription() }),
    //   duration: 4
    // })

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

    // // 显示停止录制提示
    // notification.info({
    //   message: t('ai.recordingStopped'),
    //   description: t('ai.processingVoice'),
    //   duration: 1.5
    // })
  }
}

// 语音识别功能 - 使用 voiceToText API
const transcribeAudio = async (audioBlob: Blob) => {
  try {
    // 检查音频大小，使用配置文件中的限制
    if (audioBlob.size > SPEECH_CONFIG.MAX_AUDIO_SIZE) {
      throw new Error(t('ai.audioFileTooLarge', { maxSize: Math.round(SPEECH_CONFIG.MAX_AUDIO_SIZE / 1024 / 1024) }))
    }

    // 将音频转换为 base64
    const arrayBuffer = await audioBlob.arrayBuffer()
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    // 根据MIME类型确定音频格式，映射到后端支持的格式
    // 后端支持的格式：wav、pcm、ogg-opus、speex、silk、mp3、m4a、aac、amr
    let audioFormat = 'wav' // 默认格式
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
        // WebM格式转换为ogg-opus，因为后端支持ogg-opus
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

    // 验证音频格式是否被后端支持
    if (!SPEECH_CONFIG.SUPPORTED_FORMATS.includes(audioFormat)) {
      console.warn(t('ai.formatConversionDesc', { format: audioFormat }))
      audioFormat = 'wav' // 回退到默认格式

      // 通知用户格式转换
      notification.info({
        message: t('ai.audioFormatConversion'),
        description: t('ai.formatConversionDesc', { format: audioFormat }),
        duration: 2
      })
    }

    // 使用 voiceToText API 方法
    const result = await voiceToText({
      audio_data: base64Audio,
      audio_format: audioFormat,
      language: 'zh',
      audio_size: audioBlob.size
    })

    let transcribedText = ''
    // 根据后端API响应结构处理结果
    if (result && result.data) {
      // 后端返回的是 VoiceToTextReply 结构
      transcribedText = result.data.text || ''
    } else {
      throw new Error(t('ai.voiceRecognitionFailed') + '：' + t('ai.recognitionEmptyDesc'))
    }

    if (transcribedText) {
      console.log(t('ai.voiceRecognitionSuccess'), transcribedText)

      // // 显示成功提示
      // notification.success({
      //   message: t('ai.voiceRecognitionSuccess'),
      //   description: t('ai.recognitionResult', { text: transcribedText }),
      //   duration: 2
      // })

      // 触发转录完成事件
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

// 清理资源
onUnmounted(() => {
  if (isRecording.value) {
    stopRecording()
  }
  if (recordingTimeout.value) {
    clearTimeout(recordingTimeout.value)
  }
})
</script>

<style>
/* 语音按钮基础样式 */
.voice-button {
  transition: all 0.3s ease;
}

.voice-button.recording {
  background-color: #ff4d4f;
  border-color: #ff4d4f;
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
