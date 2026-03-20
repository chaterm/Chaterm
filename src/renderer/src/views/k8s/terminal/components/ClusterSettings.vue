<template>
  <a-modal
    :open="visible"
    :title="t('k8s.terminal.clusterSettings')"
    :width="500"
    :mask-closable="false"
    :ok-loading="loading"
    :ok-text="t('common.save')"
    :cancel-text="t('common.cancel')"
    wrap-class-name="cluster-settings-modal"
    @cancel="handleClose"
    @ok="handleSubmit"
  >
    <a-form
      v-if="cluster"
      :model="form"
      :label-col="{ span: 6 }"
      :wrapper-col="{ span: 18 }"
    >
      <a-form-item :label="t('k8s.terminal.clusterName')">
        <a-input v-model:value="form.name" />
      </a-form-item>

      <a-form-item :label="t('k8s.terminal.contextName')">
        <a-input
          v-model:value="form.contextName"
          disabled
        />
      </a-form-item>

      <a-form-item :label="t('k8s.terminal.serverUrl')">
        <a-input
          v-model:value="form.serverUrl"
          disabled
        />
      </a-form-item>

      <a-form-item :label="t('k8s.terminal.defaultNamespace')">
        <a-input v-model:value="form.defaultNamespace" />
      </a-form-item>

      <a-form-item :label="t('k8s.terminal.autoConnect')">
        <a-switch v-model:checked="form.autoConnect" />
      </a-form-item>

      <a-form-item :label="t('k8s.terminal.connectionStatus')">
        <a-tag :color="statusColor">{{ statusText }}</a-tag>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { useK8sStore } from '@/store/k8sStore'
import type { K8sCluster } from '@/api/k8s'

const props = defineProps<{
  visible: boolean
  cluster: K8sCluster | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'success'): void
}>()

const { t } = useI18n()
const k8sStore = useK8sStore()

const loading = ref(false)

const form = reactive({
  name: '',
  contextName: '',
  serverUrl: '',
  defaultNamespace: '',
  autoConnect: false
})

watch(
  () => props.cluster,
  (cluster) => {
    if (cluster) {
      form.name = cluster.name
      form.contextName = cluster.context_name
      form.serverUrl = cluster.server_url
      form.defaultNamespace = cluster.default_namespace
      form.autoConnect = cluster.auto_connect === 1
    }
  },
  { immediate: true }
)

const statusColor = computed(() => {
  if (!props.cluster) return 'default'
  switch (props.cluster.connection_status) {
    case 'connected':
      return 'success'
    case 'error':
      return 'error'
    default:
      return 'default'
  }
})

const statusText = computed(() => {
  if (!props.cluster) return ''
  switch (props.cluster.connection_status) {
    case 'connected':
      return t('k8s.terminal.connected')
    case 'error':
      return t('k8s.terminal.error')
    default:
      return t('k8s.terminal.disconnected')
  }
})

const handleClose = () => {
  emit('update:visible', false)
}

const handleSubmit = async () => {
  if (!props.cluster) return

  loading.value = true

  try {
    const result = await k8sStore.updateCluster(props.cluster.id, {
      name: form.name,
      defaultNamespace: form.defaultNamespace,
      autoConnect: form.autoConnect
    })

    if (result.success) {
      emit('success')
    } else {
      message.error(result.error || t('k8s.terminal.updateFailed'))
    }
  } finally {
    loading.value = false
  }
}
</script>

<style>
.cluster-settings-modal .ant-modal-content {
  background-color: var(--bg-color) !important;
  color: var(--text-color) !important;
}

.cluster-settings-modal .ant-modal-header {
  background-color: transparent !important;
  border-bottom: 1px solid var(--border-color) !important;
}

.cluster-settings-modal .ant-modal-title {
  color: var(--text-color) !important;
}

.cluster-settings-modal .ant-modal-close {
  color: var(--text-color-secondary) !important;
}

.cluster-settings-modal .ant-form-item-label > label {
  color: var(--text-color-secondary) !important;
}

.cluster-settings-modal .ant-input,
.cluster-settings-modal .ant-select-selector,
.cluster-settings-modal .ant-textarea {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

.cluster-settings-modal .ant-input[disabled] {
  background-color: var(--bg-color-tertiary) !important;
  color: var(--text-color-secondary) !important;
  border-color: var(--border-color) !important;
  opacity: 0.7;
}

.cluster-settings-modal .ant-switch {
  background-color: var(--bg-color-tertiary) !important;
  border: 1px solid var(--border-color) !important;
}

.cluster-settings-modal .ant-switch-checked {
  background-color: #1890ff !important;
  border: 1px solid transparent !important;
}

.cluster-settings-modal .ant-tag {
  background-color: var(--bg-color-tertiary) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color-secondary) !important;
}

.cluster-settings-modal .ant-tag-success {
  background-color: rgba(82, 196, 26, 0.1) !important;
  border-color: rgba(82, 196, 26, 0.2) !important;
  color: #52c41a !important;
}

.cluster-settings-modal .ant-tag-error {
  background-color: rgba(255, 77, 79, 0.1) !important;
  border-color: rgba(255, 77, 79, 0.2) !important;
  color: #ff4d4f !important;
}

/* Style secondary buttons in modal footer and body */
.cluster-settings-modal .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous) {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

.cluster-settings-modal .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous):hover {
  background-color: var(--hover-bg-color) !important;
  border-color: var(--primary-color) !important;
  color: var(--primary-color) !important;
}

/* Scoped styles for internal elements */
</style>
