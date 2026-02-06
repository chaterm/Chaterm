<template>
  <div class="kb-editor-root">
    <div
      v-if="activeFile.relPath"
      class="kb-body"
    >
      <!-- Preview Mode -->
      <div
        v-if="mode === 'preview'"
        class="kb-preview"
        v-html="mdHtml"
      ></div>

      <!-- Editor Mode -->
      <div
        v-else
        class="kb-editor-pane"
      >
        <MonacoEditor
          v-model="activeFile.content"
          :language="activeFile.language"
          :theme="currentTheme"
          :options="{ minimap: { enabled: false } }"
          @update:model-value="handleEditorChange"
        />
      </div>
    </div>

    <div
      v-else
      class="kb-empty"
    >
      <div class="kb-empty-title">No file opened</div>
      <div class="kb-empty-desc">Select a file from the tree to start editing.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import { marked } from 'marked'
import { message } from 'ant-design-vue'
import MonacoEditor from '@views/components/Editors/base/monacoEditor.vue'
import { getMonacoTheme } from '@/utils/themeUtils'
import eventBus from '@/utils/eventBus'
import DOMPurify from 'dompurify'
import { useEditorConfigStore } from '@/stores/editorConfig'

const props = withDefaults(
  defineProps<{
    relPath: string
    mode?: 'editor' | 'preview'
  }>(),
  {
    mode: 'editor'
  }
)

const mainApi = (window as any).api

// Initialize editor config store
const editorConfigStore = useEditorConfigStore()

// Initialize with props.relPath to avoid showing empty state during async load
const activeFile = reactive({
  relPath: props.relPath || '',
  content: '',
  mtimeMs: 0,
  isMarkdown: false,
  language: 'plaintext'
})

const currentTheme = computed(() => getMonacoTheme())

function isMarkdownFile(relPath: string): boolean {
  return relPath.toLowerCase().endsWith('.md') || relPath.toLowerCase().endsWith('.markdown')
}

function languageFromPath(relPath: string): string {
  const lower = relPath.toLowerCase()
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.sql')) return 'sql'
  return 'plaintext'
}

let saveTimer: number | null = null
const scheduleSave = () => {
  if (!activeFile.relPath || props.mode !== 'editor') return
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    try {
      await mainApi.kbWriteFile(activeFile.relPath, activeFile.content)
    } catch (e: any) {
      message.error(e?.message || String(e))
    }
  }, 1200)
}

const handleEditorChange = () => {
  // Broadcast content change for previewer
  eventBus.emit('kb:content-changed', {
    relPath: activeFile.relPath,
    content: activeFile.content
  })
  scheduleSave()
}

// Listen for content changes (for preview mode or multiple editors)
const handleRemoteChange = (data: { relPath: string; content: string }) => {
  if (data.relPath === activeFile.relPath) {
    activeFile.content = data.content
  }
}

const mdHtml = computed(() => {
  if (!activeFile.isMarkdown) return ''

  // To avoid XSS attacks, we need to sanitize the HTML before rendering it.
  const rawHtml = marked.parse(activeFile.content || '')
  return DOMPurify.sanitize(rawHtml as string)
})

async function openFile(relPath: string) {
  if (!relPath) return
  try {
    await mainApi.kbEnsureRoot()
    const res = await mainApi.kbReadFile(relPath)
    activeFile.relPath = relPath
    activeFile.content = res.content
    activeFile.mtimeMs = res.mtimeMs
    activeFile.isMarkdown = isMarkdownFile(relPath)
    activeFile.language = languageFromPath(relPath)
  } catch (e: any) {
    message.error(e?.message || String(e))
  }
}

onMounted(async () => {
  // Load global editor configuration
  await editorConfigStore.loadConfig()

  eventBus.on('kb:content-changed', handleRemoteChange)
  await openFile(props.relPath)
})

watch(
  () => props.relPath,
  async (next) => {
    if (next && next !== activeFile.relPath) {
      await openFile(next)
    }
  }
)

onBeforeUnmount(() => {
  eventBus.off('kb:content-changed', handleRemoteChange)
  if (saveTimer) window.clearTimeout(saveTimer)
})
</script>

<style scoped lang="less">
.kb-editor-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
  overflow: hidden;
}

.kb-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.kb-editor-pane {
  flex: 1;
  overflow: hidden;
}

.kb-preview {
  flex: 1;
  overflow: auto;
  padding: 12px;
  background: var(--bg-color);
}

.kb-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
}

.kb-empty-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}

.kb-empty-desc {
  font-size: 12px;
}
</style>
