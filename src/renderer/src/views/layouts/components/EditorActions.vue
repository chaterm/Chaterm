<template>
  <div
    v-if="showActions"
    class="editor-actions"
  >
    <a-tooltip title="Open Preview to the Side">
      <div
        class="action-item"
        @click="openPreview"
      >
        <FileSearchOutlined />
      </div>
    </a-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { FileSearchOutlined } from '@ant-design/icons-vue'
import type { DockviewApi, IDockviewPanel } from 'dockview-core'
import eventBus from '@/utils/eventBus'

const props = defineProps<{
  dockApi?: any
}>()

const activePanel = ref<IDockviewPanel | undefined>(undefined)

const updateActivePanel = () => {
  activePanel.value = props.dockApi?.activePanel
}

let disposable: { dispose: () => void } | undefined

const setupListeners = (api?: DockviewApi) => {
  disposable?.dispose()
  if (api) {
    disposable = api.onDidActivePanelChange(() => {
      updateActivePanel()
    })
    updateActivePanel()
  }
}

watch(
  () => props.dockApi,
  (newApi) => {
    setupListeners(newApi)
  },
  { immediate: true }
)

onUnmounted(() => {
  disposable?.dispose()
})

const showActions = computed(() => {
  const panel = activePanel.value
  if (!panel) return false
  // Only show for KnowledgeCenterEditor in editor mode and for markdown files
  return panel.params?.content === 'KnowledgeCenterEditor' && panel.params?.mode !== 'preview' && panel.params?.isMarkdown
})

const openPreview = () => {
  const panel = activePanel.value
  if (!panel || !props.dockApi) return

  const relPath = panel.params?.props?.relPath
  if (!relPath) return

  const stableId = `kc_preview_${relPath.replaceAll('/', '__')}`

  // Check if preview already exists
  const existing = props.dockApi.panels.find((p) => p.id === 'panel_' + stableId)
  if (existing) {
    existing.api.setActive()
    return
  }

  // Use eventBus to request preview panel creation (to get closeCurrentPanel callback)
  eventBus.emit('openKbPreview', {
    relPath,
    referencePanel: panel.id
  })
}
</script>

<style scoped lang="less">
.editor-actions {
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 35px; /* Match tab height */
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color);
  gap: 8px;
}

.action-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--text-color-secondary);
  transition: all 0.2s;

  &:hover {
    color: var(--text-color);
    background: rgba(255, 255, 255, 0.1);
  }

  span {
    font-size: 16px;
  }
}
</style>
