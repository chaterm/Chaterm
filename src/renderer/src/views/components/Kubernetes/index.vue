<template>
  <div class="k8s-container">
    <div class="k8s-header">
      <h3>{{ $t('kubernetes.title') }}</h3>
      <a-button
        type="primary"
        size="small"
        :loading="loading"
        @click="handleRefresh"
      >
        <template #icon>
          <RedoOutlined />
        </template>
        {{ $t('common.refresh') }}
      </a-button>
    </div>

    <a-alert
      v-if="error"
      type="error"
      :message="error"
      closable
      style="margin-bottom: 16px"
      @close="clearError"
    />

    <a-spin
      :spinning="loading"
      tip="Loading contexts..."
    >
      <div
        v-if="hasContexts"
        class="contexts-list"
      >
        <a-list
          :data-source="contexts"
          :loading="loading"
        >
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta>
                <template #title>
                  <span :class="{ 'active-context': item.isActive }">
                    {{ item.name }}
                    <a-tag
                      v-if="item.isActive"
                      color="green"
                      size="small"
                      style="margin-left: 8px"
                    >
                      {{ $t('kubernetes.active') }}
                    </a-tag>
                  </span>
                </template>
                <template #description>
                  <div class="context-info">
                    <div>
                      <strong>{{ $t('kubernetes.cluster') }}:</strong> {{ item.cluster }}
                    </div>
                    <div>
                      <strong>{{ $t('kubernetes.namespace') }}:</strong> {{ item.namespace }}
                    </div>
                    <div>
                      <strong>{{ $t('kubernetes.server') }}:</strong> {{ item.server }}
                    </div>
                  </div>
                </template>
              </a-list-item-meta>
              <template #actions>
                <a-button
                  v-if="!item.isActive"
                  type="link"
                  size="small"
                  @click="handleSwitchContext(item.name)"
                >
                  {{ $t('kubernetes.switchTo') }}
                </a-button>
              </template>
            </a-list-item>
          </template>
        </a-list>
      </div>

      <a-empty
        v-else-if="!loading"
        :description="$t('kubernetes.noContexts')"
      >
        <template #image>
          <CloudServerOutlined style="font-size: 64px; color: #ccc" />
        </template>
      </a-empty>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { RedoOutlined, CloudServerOutlined } from '@ant-design/icons-vue'
import { useK8sStore } from '@/store/k8sStore'

const { t } = useI18n()
const k8sStore = useK8sStore()

// Computed properties from store
const contexts = computed(() => k8sStore.contexts)
const loading = computed(() => k8sStore.loading)
const error = computed(() => k8sStore.error)
const hasContexts = computed(() => k8sStore.hasContexts)

// Methods
const handleRefresh = async () => {
  await k8sStore.reloadConfig()
  if (!k8sStore.error) {
    message.success(t('kubernetes.refreshSuccess'))
  }
}

const handleSwitchContext = async (contextName: string) => {
  await k8sStore.switchContext(contextName)
  if (!k8sStore.error) {
    message.success(t('kubernetes.switchSuccess', { context: contextName }))
  } else {
    message.error(t('kubernetes.switchFailed', { error: k8sStore.error }))
  }
}

const clearError = () => {
  k8sStore.clearError()
}

// Initialize on mount
onMounted(async () => {
  console.log('[K8s Component] Mounting...')
  await k8sStore.initialize()
  console.log('[K8s Component] Contexts loaded:', k8sStore.contexts)
})
</script>

<style scoped>
.k8s-container {
  height: 100%;
  padding: 16px;
  background-color: var(--bg-color);
  color: var(--text-color);
  overflow-y: auto;
}

.k8s-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.k8s-header h3 {
  margin: 0;
  color: var(--text-color);
}

.contexts-list {
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
  padding: 8px;
}

.active-context {
  font-weight: bold;
  color: var(--primary-color);
}

.context-info {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.context-info div {
  margin: 4px 0;
}

:deep(.ant-list-item) {
  background-color: var(--bg-color);
  margin-bottom: 8px;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

:deep(.ant-list-item:hover) {
  background-color: var(--bg-color-secondary);
  border-color: var(--primary-color);
}

:deep(.ant-empty) {
  color: var(--text-color);
}
</style>
