<template>
  <a-modal
    v-model:open="visible"
    class="progress-body"
    :get-container="getContainer"
    :title="modalTitle"
    :closable="true"
    :mask-closable="false"
    :keyboard="false"
    :width="400"
    :mask-style="localModalStyles.mask"
    :wrap-style="localModalStyles.wrap"
    centered
    @cancel="onModalCancel"
  >
    <div class="progress-content">
      <div class="progress-info">
        <span
          class="progress-label"
          :style="{ color: isError ? '#ff4d4f' : 'inherit' }"
        >
          {{ isError ? t('ssh.transferFailed') : progressLabel }}
        </span>
      </div>

      <a-progress
        :size="[300, 8]"
        :percent="progressPercent"
        :status="isError ? 'exception' : progressStatus"
        :stroke-width="12"
        class="zomodem-progress"
      />

      <div class="transfer-details">
        <a-row :gutter="[0, 8]">
          <a-col :span="24">
            <span class="detail-label">{{ t('ssh.fileName') }}：</span>
            <span
              class="detail-value text-ellipsis"
              :title="fileName"
              >{{ fileName || '-' }}</span
            >
          </a-col>
          <a-col :span="24">
            <span class="detail-label">{{ t('ssh.fileSize') }}：</span>
            <span class="detail-value">{{ formatFileSize(totalSize) }}</span>
          </a-col>
          <a-col :span="24">
            <span class="detail-label">{{ t('ssh.transferSpeed') }}：</span>
            <span class="detail-value speed">{{ formatSpeed(transferSpeed) }}</span>
          </a-col>
        </a-row>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <a-button
          v-if="!isCompleted && !isError"
          key="cancel"
          type="primary"
          class="cancel-btn"
          danger
          :loading="isCanceling"
          @click="handleCancel"
        >
          {{ t('ssh.cancelTransfer') }}
        </a-button>
        <a-button
          v-else
          key="close"
          type="primary"
          @click="handleClose"
          >{{ t('ssh.close') }}</a-button
        >
      </div>
    </template>
  </a-modal>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

interface Props {
  visible: boolean
  type: 'upload' | 'download'
  progress: number
  transferSpeed: number
  transferSize: number
  totalSize: number
  fileName: string
  isCanceling: boolean
  status: 'normal' | 'error'
  getContainer: () => HTMLElement
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  isCanceling: false,
  type: 'upload',
  progress: 0,
  transferSpeed: 0,
  transferSize: 0,
  totalSize: 0,
  fileName: '',
  status: 'normal',
  getContainer: () => document.body
})
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
const formatSpeed = (speed: number) => {
  if (!speed || speed < 0) return '0 KB/s'
  return `${formatFileSize(speed)}/s`
}

const isError = computed(() => props.status === 'error')

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'close'): void
}>()

const visible = computed({
  get: () => props.visible,
  set: () => {}
})
const localModalStyles = {
  mask: { position: 'absolute' } as any,
  wrap: { position: 'absolute' } as any
}
const progressPercent = computed(() => {
  return Math.floor(props.progress * 100)
})
const isCompleted = computed(() => progressPercent.value >= 100)

const modalTitle = computed(() => {
  if (isCompleted.value) {
    return props.type === 'upload' ? t('ssh.uploadSuccess') : t('ssh.downloadSuccess')
  }
  return props.type === 'upload' ? t('ssh.fileUploading') : t('ssh.fileDownloading')
})

const progressLabel = computed(() => {
  if (isCompleted.value) {
    return t('ssh.complete')
  }
  return props.type === 'upload' ? t('ssh.uploadProgress') : t('ssh.downloadProgress')
})

const progressStatus = computed(() => {
  if (isCompleted.value) {
    return 'success'
  }
  return 'active'
})

const handleCancel = () => {
  emit('cancel')
  // emit('update:visible', false)
}

const handleClose = () => {
  emit('close')
}

const onModalCancel = () => {
  if (props.progress < 100 && props.status !== 'error') {
    handleCancel()
  } else {
    handleClose()
  }
}

// Monitor progress, automatically close upon completion
watch(
  () => props.progress,
  (newProgress) => {
    if (newProgress >= 1) {
      setTimeout(() => {
        handleClose()
      }, 1500)
    }
    if (props.status !== 'error') {
    }
  },
  { flush: 'post' }
)
</script>

<style scoped>
.progress-body {
  background-color: red;
}
.progress-content {
  padding: 0 0;
}

.progress-info {
  margin-bottom: 0;
  font-weight: 500;
}

.transfer-details {
  margin-top: 5px;
  padding: 6px;
  background-color: var(--select-hover-bg);
  border-radius: 6px;
}
:deep(.ant-progress-text) {
  font-size: 14px !important;
  color: var(--text-color) !important;
}

.detail-label {
  color: var(--text-color);
  font-size: 13px;
}

.detail-value {
  color: var(--text-color-secondary);
  font-size: 13px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.text-ellipsis {
  display: inline-block;
  vertical-align: bottom;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.speed {
  color: #0b82ff;
  font-weight: bold;
}

.modal-footer {
  text-align: right;
}
.cancel-btn {
  background-color: var(--button-bg-color);
}

.zomodem-progress :deep(.ant-progress-bg) {
  background-color: var(--button-bg-color) !important;
}
</style>
