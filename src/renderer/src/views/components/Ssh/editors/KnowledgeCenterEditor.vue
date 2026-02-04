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
        :style="previewStyle"
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { marked } from 'marked'
import { message } from 'ant-design-vue'
import MonacoEditor from '@renderer/views/components/Ssh/editors/monacoEditor.vue'
import { getMonacoTheme } from '@/utils/themeUtils'
import eventBus from '@/utils/eventBus'
import DOMPurify from 'dompurify'
import { userConfigStore } from '@/services/userConfigStoreService'

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

// Initialize with props.relPath to avoid showing empty state during async load
const activeFile = reactive({
  relPath: props.relPath || '',
  content: '',
  mtimeMs: 0,
  isMarkdown: false,
  language: 'plaintext'
})

const currentTheme = computed(() => getMonacoTheme())

// Font settings from user config
const fontFamily = ref('Menlo, Monaco, "Courier New", Consolas, Courier, monospace')
const fontSize = ref(14)

const previewStyle = computed(() => ({
  fontFamily: fontFamily.value,
  fontSize: `${fontSize.value}px`,
  lineHeight: 1.6
}))

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
  eventBus.on('kb:content-changed', handleRemoteChange)

  // Load user font settings
  try {
    const config = await userConfigStore.getConfig()
    if (config.fontFamily) {
      fontFamily.value = config.fontFamily
    }
    if (config.fontSize) {
      fontSize.value = config.fontSize
    }
  } catch (e) {
    console.error('Failed to load user config:', e)
  }

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
  padding: 16px 24px 360px;
  background: var(--bg-color);
  color: var(--text-color);
  user-select: text;

  // Remove top margin from first element
  :deep(> :first-child) {
    margin-top: 0;
  }

  // Markdown content styles (penetrate scoped)
  :deep(h1) {
    font-size: 2em;
    margin: 0.67em 0;
    font-weight: 600;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 0.3em;
  }
  :deep(h2) {
    font-size: 1.5em;
    margin: 0.83em 0;
    font-weight: 600;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 0.3em;
  }
  :deep(h3) {
    font-size: 1.25em;
    margin: 1em 0;
    font-weight: 600;
  }
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    margin: 1em 0;
    font-weight: 600;
  }
  :deep(p) {
    margin: 1em 0;
  }
  :deep(ul) {
    margin: 1em 0;
    padding-left: 2em;
    list-style-type: disc;
  }
  :deep(ol) {
    margin: 1em 0;
    padding-left: 2em;
    list-style-type: decimal;
  }
  :deep(li) {
    margin: 0.25em 0;
    display: list-item;
  }
  // Remove margin for nested lists
  :deep(li > ul),
  :deep(li > ol) {
    margin: 0;
  }
  :deep(blockquote) {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid #3794ff;
    background: rgba(55, 148, 255, 0.1);
    color: var(--text-color-secondary);
  }
  :deep(code) {
    background: rgba(110, 118, 129, 0.4);
    color: #e8912d;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
  }
  :deep(pre) {
    background: rgba(30, 30, 30, 0.6);
    padding: 12px 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 1em 0;
    border: 1px solid var(--border-color);
  }
  :deep(pre code) {
    background: none;
    color: #d4d4d4;
    padding: 0;
    border-radius: 0;
  }
  :deep(table) {
    border-collapse: collapse;
    margin: 1em 0;
    width: 100%;
  }
  :deep(th),
  :deep(td) {
    border: 1px solid var(--border-color);
    padding: 8px 12px;
    text-align: left;
  }
  :deep(th) {
    background: var(--bg-color-secondary);
    font-weight: 600;
  }
  :deep(a) {
    color: #3794ff;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
      color: #4da3ff;
    }
  }
  :deep(img) {
    max-width: 100%;
    height: auto;
  }
  :deep(hr) {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: 1.5em 0;
  }
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
