<template>
  <a-modal
    :open="visible"
    :title="t('k8s.terminal.clusterSettings')"
    :width="500"
    :mask-closable="false"
    :ok-loading="loading"
    :ok-text="t('common.save')"
    :cancel-text="t('common.cancel')"
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

    <!-- Danger Zone -->
    <div class="danger-zone">
      <div class="danger-title">{{ t('k8s.terminal.dangerZone') }}</div>
      <div class="danger-content">
        <span>{{ t('k8s.terminal.deleteClusterWarning') }}</span>
        <a-button
          danger
          @click="handleDelete"
          >{{ t('common.delete') }}</a-button
        >
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import { useK8sStore } from '@/store/k8sStore'
import type { K8sCluster } from '@/api/k8s'

const props = defineProps<{
  visible: boolean
  cluster: K8sCluster | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'success'): void
  (e: 'delete', id: string): void
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

const handleDelete = () => {
  if (!props.cluster) return

  Modal.confirm({
    title: t('k8s.terminal.deleteConfirm'),
    content: t('k8s.terminal.deleteClusterMessage', { name: props.cluster.name }),
    okText: t('common.confirm'),
    cancelText: t('common.cancel'),
    okType: 'danger',
    onOk: () => emit('delete', props.cluster!.id)
  })
}
</script>

<style scoped>
.danger-zone {
  margin-top: 24px;
  padding: 16px;
  border: 1px solid var(--color-error);
  border-radius: 8px;
}

.danger-title {
  font-weight: 600;
  color: var(--color-error);
  margin-bottom: 12px;
}

.danger-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.danger-content span {
  color: var(--color-text-secondary);
  font-size: 13px;
}
</style>
