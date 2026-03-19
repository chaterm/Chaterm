<template>
  <a-modal
    :open="visible"
    :title="t('k8s.terminal.addCluster')"
    :width="560"
    :mask-closable="false"
    :ok-loading="loading"
    :ok-text="t('common.save')"
    :cancel-text="t('common.cancel')"
    @cancel="handleClose"
    @ok="handleSubmit"
  >
    <a-tabs v-model:active-key="activeTab">
      <!-- Import from Kubeconfig -->
      <a-tab-pane
        key="import"
        :tab="t('k8s.terminal.importKubeconfig')"
      >
        <a-form
          :model="importForm"
          :label-col="{ span: 6 }"
          :wrapper-col="{ span: 18 }"
        >
          <a-form-item :label="t('k8s.terminal.kubeconfigFile')">
            <a-input-group compact>
              <a-input
                v-model:value="importForm.kubeconfigPath"
                style="width: calc(100% - 100px)"
                :placeholder="t('k8s.terminal.selectFile')"
                readonly
              />
              <a-button @click="handleSelectFile">{{ t('k8s.terminal.browse') }}</a-button>
            </a-input-group>
          </a-form-item>

          <a-form-item
            v-if="availableContexts.length > 0"
            :label="t('k8s.terminal.context')"
          >
            <a-select
              v-model:value="importForm.contextName"
              :placeholder="t('k8s.terminal.selectContext')"
            >
              <a-select-option
                v-for="ctx in availableContexts"
                :key="ctx.name"
                :value="ctx.name"
              >
                {{ ctx.name }} ({{ ctx.cluster }})
              </a-select-option>
            </a-select>
          </a-form-item>

          <a-form-item :label="t('k8s.terminal.clusterName')">
            <a-input
              v-model:value="importForm.name"
              :placeholder="t('k8s.terminal.clusterNamePlaceholder')"
            />
          </a-form-item>

          <a-form-item :label="t('k8s.terminal.defaultNamespace')">
            <a-input
              v-model:value="importForm.defaultNamespace"
              placeholder="default"
            />
          </a-form-item>
        </a-form>
      </a-tab-pane>

      <!-- Manual Configuration -->
      <a-tab-pane
        key="manual"
        :tab="t('k8s.terminal.manualConfig')"
      >
        <a-form
          :model="manualForm"
          :label-col="{ span: 6 }"
          :wrapper-col="{ span: 18 }"
        >
          <a-form-item
            :label="t('k8s.terminal.clusterName')"
            required
          >
            <a-input
              v-model:value="manualForm.name"
              :placeholder="t('k8s.terminal.clusterNamePlaceholder')"
            />
          </a-form-item>

          <a-form-item
            :label="t('k8s.terminal.serverUrl')"
            required
          >
            <a-input
              v-model:value="manualForm.serverUrl"
              placeholder="https://kubernetes.default.svc:6443"
            />
          </a-form-item>

          <a-form-item
            :label="t('k8s.terminal.contextName')"
            required
          >
            <a-input
              v-model:value="manualForm.contextName"
              :placeholder="t('k8s.terminal.contextNamePlaceholder')"
            />
          </a-form-item>

          <a-form-item :label="t('k8s.terminal.kubeconfigContent')">
            <a-textarea
              v-model:value="manualForm.kubeconfigContent"
              :rows="6"
              :placeholder="t('k8s.terminal.kubeconfigContentPlaceholder')"
            />
          </a-form-item>

          <a-form-item :label="t('k8s.terminal.defaultNamespace')">
            <a-input
              v-model:value="manualForm.defaultNamespace"
              placeholder="default"
            />
          </a-form-item>
        </a-form>
      </a-tab-pane>
    </a-tabs>

    <!-- Test Connection Button -->
    <div class="test-connection">
      <a-button
        :loading="testing"
        @click="handleTestConnection"
      >
        <template #icon><ApiOutlined /></template>
        {{ t('k8s.terminal.testConnection') }}
      </a-button>
      <span
        v-if="testResult !== null"
        :class="['test-result', testResult ? 'success' : 'error']"
      >
        {{ testResult ? t('k8s.terminal.connectionSuccess') : t('k8s.terminal.connectionFailed') }}
      </span>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { ApiOutlined } from '@ant-design/icons-vue'
import { useK8sStore } from '@/store/k8sStore'
import type { K8sContextInfo } from '@/api/k8s'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'success'): void
}>()

const { t } = useI18n()
const k8sStore = useK8sStore()

const activeTab = ref('import')
const loading = ref(false)
const testing = ref(false)
const testResult = ref<boolean | null>(null)
const availableContexts = ref<K8sContextInfo[]>([])
const defaultKubeconfigPath = ref('')

const importForm = reactive({
  kubeconfigPath: '',
  kubeconfigContent: '',
  contextName: '',
  name: '',
  defaultNamespace: 'default'
})

const manualForm = reactive({
  name: '',
  serverUrl: '',
  contextName: '',
  kubeconfigContent: '',
  defaultNamespace: 'default'
})

// Get user home directory for default kubeconfig path
onMounted(async () => {
  try {
    const homePath = await window.api.getHomePath()
    if (homePath) {
      defaultKubeconfigPath.value = `${homePath}/.kube/config`
    }
  } catch {
    // Fallback if getHomePath is not available
    defaultKubeconfigPath.value = ''
  }
})

watch(
  () => props.visible,
  async (val) => {
    if (val) {
      resetForms()
      // Auto-load default kubeconfig if exists
      await loadDefaultKubeconfig()
    }
  }
)

const loadDefaultKubeconfig = async () => {
  if (!defaultKubeconfigPath.value) return

  try {
    // Check if default kubeconfig exists
    const checkResult = await window.api.kbCheckPath(defaultKubeconfigPath.value)
    if (checkResult && checkResult.exists && checkResult.isFile) {
      importForm.kubeconfigPath = defaultKubeconfigPath.value
      // Import and get contexts
      const importResult = await k8sStore.importFromKubeconfig(defaultKubeconfigPath.value)
      if (importResult.success && importResult.contexts) {
        availableContexts.value = importResult.contexts
        // Store the kubeconfig content
        importForm.kubeconfigContent = importResult.kubeconfigContent || ''
        if (importResult.contexts.length > 0) {
          importForm.contextName = importResult.contexts[0].name
          importForm.name = importResult.contexts[0].cluster
        }
      }
    }
  } catch {
    // Silently ignore if default kubeconfig doesn't exist
  }
}

const resetForms = () => {
  activeTab.value = 'import'
  testResult.value = null
  availableContexts.value = []
  Object.assign(importForm, {
    kubeconfigPath: '',
    kubeconfigContent: '',
    contextName: '',
    name: '',
    defaultNamespace: 'default'
  })
  Object.assign(manualForm, {
    name: '',
    serverUrl: '',
    contextName: '',
    kubeconfigContent: '',
    defaultNamespace: 'default'
  })
}

const handleClose = () => {
  emit('update:visible', false)
}

const handleSelectFile = async () => {
  // Set default path to ~/.kube directory
  let defaultPath = ''
  if (defaultKubeconfigPath.value) {
    // Get the directory part (.kube)
    const lastSlash = defaultKubeconfigPath.value.lastIndexOf('/')
    if (lastSlash > 0) {
      defaultPath = defaultKubeconfigPath.value.substring(0, lastSlash)
    }
  }

  const result = await window.api.showOpenDialog({
    defaultPath: defaultPath || undefined,
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'YAML Files', extensions: ['yaml', 'yml'] }
    ]
  })

  if (result && !result.canceled && result.filePaths.length > 0) {
    importForm.kubeconfigPath = result.filePaths[0]

    // Import and get contexts
    const importResult = await k8sStore.importFromKubeconfig(result.filePaths[0])
    if (importResult.success && importResult.contexts) {
      availableContexts.value = importResult.contexts
      // Store the kubeconfig content for later use
      importForm.kubeconfigContent = importResult.kubeconfigContent || ''
      if (importResult.contexts.length > 0) {
        importForm.contextName = importResult.contexts[0].name
        importForm.name = importResult.contexts[0].cluster
      }
    }
  }
}

const handleTestConnection = async () => {
  testing.value = true
  testResult.value = null

  try {
    let contextName = ''
    let kubeconfigPath = ''
    let kubeconfigContent = ''

    if (activeTab.value === 'import') {
      contextName = importForm.contextName
      kubeconfigPath = importForm.kubeconfigPath
    } else {
      contextName = manualForm.contextName
      kubeconfigContent = manualForm.kubeconfigContent
    }

    if (!contextName) {
      message.warning(t('k8s.terminal.pleaseSelectContext'))
      return
    }

    const result = await window.api.k8sClusterTest({
      kubeconfigPath: kubeconfigPath || undefined,
      kubeconfigContent: kubeconfigContent || undefined,
      contextName
    })

    testResult.value = result.success && result.isValid === true
  } catch (err) {
    testResult.value = false
  } finally {
    testing.value = false
  }
}

const handleSubmit = async () => {
  loading.value = true

  try {
    let params: any = {}

    if (activeTab.value === 'import') {
      if (!importForm.kubeconfigPath || !importForm.contextName) {
        message.warning(t('k8s.terminal.pleaseCompleteForm'))
        return
      }

      // Find the selected context
      const selectedContext = availableContexts.value.find((c) => c.name === importForm.contextName)

      params = {
        name: importForm.name || importForm.contextName,
        kubeconfigPath: importForm.kubeconfigPath,
        kubeconfigContent: importForm.kubeconfigContent || undefined,
        contextName: importForm.contextName,
        serverUrl: selectedContext?.server || '',
        defaultNamespace: importForm.defaultNamespace || 'default'
      }
    } else {
      if (!manualForm.name || !manualForm.serverUrl || !manualForm.contextName) {
        message.warning(t('k8s.terminal.pleaseCompleteForm'))
        return
      }

      params = {
        name: manualForm.name,
        kubeconfigContent: manualForm.kubeconfigContent,
        contextName: manualForm.contextName,
        serverUrl: manualForm.serverUrl,
        defaultNamespace: manualForm.defaultNamespace || 'default'
      }
    }

    const result = await k8sStore.addCluster(params)

    if (result.success) {
      emit('success')
      handleClose()
    } else {
      message.error(result.error || t('k8s.terminal.addFailed'))
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.test-connection {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.test-result {
  font-size: 13px;
}

.test-result.success {
  color: var(--color-success);
}

.test-result.error {
  color: var(--color-error);
}
</style>
