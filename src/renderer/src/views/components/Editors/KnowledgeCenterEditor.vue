<template>
  <div
    class="kb-editor-root"
    @paste.capture="handlePaste"
  >
    <div
      v-if="activeFile.relPath"
      class="kb-body"
    >
      <!-- Image Preview Mode -->
      <div
        v-if="activeFile.isImage"
        class="kb-image-preview"
        @wheel.prevent="handleImageWheel"
      >
        <div
          v-if="activeFile.imageDataUrl"
          class="kb-image-container"
          :class="{ 'is-dragging': isDragging, 'is-draggable': imageScale > 1 }"
          :style="imageContainerStyle"
          @mousedown="handleImageMouseDown"
          @mousemove="handleImageMouseMove"
          @mouseup="handleImageMouseUp"
          @mouseleave="handleImageMouseUp"
        >
          <img
            :src="activeFile.imageDataUrl"
            :alt="activeFile.relPath"
            class="kb-image"
            draggable="false"
          />
        </div>
        <div
          v-else
          class="kb-image-loading"
        >
          {{ t('knowledgeCenter.loadingImage') }}
        </div>
        <!-- Zoom Controls -->
        <div
          v-if="activeFile.imageDataUrl"
          class="kb-image-controls"
        >
          <button
            class="kb-zoom-btn"
            title="Zoom Out"
            @click="zoomOut"
          >
            <MinusOutlined />
          </button>
          <span class="kb-zoom-level">{{ Math.round(imageScale * 100) }}%</span>
          <button
            class="kb-zoom-btn"
            title="Zoom In"
            @click="zoomIn"
          >
            <PlusOutlined />
          </button>
          <button
            class="kb-zoom-btn kb-zoom-reset"
            title="Reset Zoom"
            @click="resetZoom"
          >
            <ExpandOutlined />
          </button>
        </div>
      </div>

      <!-- Preview Mode (Markdown) -->
      <div
        v-else-if="mode === 'preview'"
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
          ref="monacoEditorRef"
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
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import { message } from 'ant-design-vue'
import { MinusOutlined, PlusOutlined, ExpandOutlined } from '@ant-design/icons-vue'
import MonacoEditor from '@views/components/Editors/base/monacoEditor.vue'
import { getMonacoTheme } from '@/utils/themeUtils'
import eventBus from '@/utils/eventBus'
import DOMPurify from 'dompurify'
import { useEditorConfigStore } from '@/stores/editorConfig'
import { userConfigStore } from '@/services/userConfigStoreService'

const { t } = useI18n()

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

// Image file extensions for detection
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

// Initialize editor config store
const editorConfigStore = useEditorConfigStore()

// Initialize with props.relPath to avoid showing empty state during async load
const activeFile = reactive({
  relPath: props.relPath || '',
  content: '',
  mtimeMs: 0,
  isMarkdown: false,
  isImage: false,
  imageDataUrl: '',
  language: 'plaintext'
})

const currentTheme = computed(() => getMonacoTheme())

// Ref to access Monaco Editor instance
const monacoEditorRef = ref<InstanceType<typeof MonacoEditor> | null>(null)

// Image zoom and pan state
const imageScale = ref(1)
const imageTranslateX = ref(0)
const imageTranslateY = ref(0)
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)

const MIN_SCALE = 0.1
const MAX_SCALE = 10
const ZOOM_STEP = 0.25

const imageContainerStyle = computed(() => ({
  transform: `translate(${imageTranslateX.value}px, ${imageTranslateY.value}px) scale(${imageScale.value})`,
  cursor: imageScale.value > 1 ? (isDragging.value ? 'grabbing' : 'grab') : 'default'
}))

function zoomIn() {
  imageScale.value = Math.min(MAX_SCALE, imageScale.value + ZOOM_STEP)
}

function zoomOut() {
  const newScale = Math.max(MIN_SCALE, imageScale.value - ZOOM_STEP)
  imageScale.value = newScale
  if (newScale <= 1) {
    imageTranslateX.value = 0
    imageTranslateY.value = 0
  }
}

function resetZoom() {
  imageScale.value = 1
  imageTranslateX.value = 0
  imageTranslateY.value = 0
}

function handleImageWheel(event: WheelEvent) {
  const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, imageScale.value + delta))
  imageScale.value = newScale
  if (newScale <= 1) {
    imageTranslateX.value = 0
    imageTranslateY.value = 0
  }
}

function handleImageMouseDown(event: MouseEvent) {
  if (imageScale.value <= 1) return
  isDragging.value = true
  dragStartX.value = event.clientX - imageTranslateX.value
  dragStartY.value = event.clientY - imageTranslateY.value
}

function handleImageMouseMove(event: MouseEvent) {
  if (!isDragging.value) return
  imageTranslateX.value = event.clientX - dragStartX.value
  imageTranslateY.value = event.clientY - dragStartY.value
}

function handleImageMouseUp() {
  isDragging.value = false
}

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

function isImageFile(relPath: string): boolean {
  const ext = relPath.toLowerCase().split('.').pop()
  return ext ? IMAGE_EXTS.has(`.${ext}`) : false
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

// Rendered Markdown HTML with resolved image paths
const mdHtml = ref('')

// Cache for loaded images: relPath -> dataUrl
const imageCache = new Map<string, string>()

// Check if a path is a relative local path (not http/https/data URL)
function isLocalImagePath(src: string): boolean {
  if (!src) return false
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return false
  return true
}

// Load image from knowledge base and return data URL
async function loadImageAsDataUrl(relPath: string): Promise<string | null> {
  if (imageCache.has(relPath)) {
    return imageCache.get(relPath)!
  }

  try {
    const res = await mainApi.kbReadFile(relPath, 'base64')
    const dataUrl = `data:${res.mimeType || 'image/png'};base64,${res.content}`
    imageCache.set(relPath, dataUrl)
    return dataUrl
  } catch {
    return null
  }
}

// Resolve image path relative to current file's directory
function resolveImagePath(src: string): string {
  if (src.startsWith('/')) {
    return src.slice(1)
  }
  const dir = getDirOf(activeFile.relPath)
  return dir ? `${dir}/${src}` : src
}

// Process Markdown content and resolve images
async function renderMarkdownWithImages() {
  if (!activeFile.isMarkdown) {
    mdHtml.value = ''
    return
  }

  const rawHtml = marked.parse(activeFile.content || '') as string

  const sanitizedHtml = DOMPurify.sanitize(rawHtml)

  // Parse HTML to find and replace local image sources
  const parser = new DOMParser()
  const doc = parser.parseFromString(sanitizedHtml, 'text/html')
  const images = doc.querySelectorAll('img')

  const loadPromises: Promise<void>[] = []

  images.forEach((img) => {
    const src = img.getAttribute('src')

    if (src && isLocalImagePath(src)) {
      const resolvedPath = resolveImagePath(src)

      loadPromises.push(
        loadImageAsDataUrl(resolvedPath).then((dataUrl) => {
          if (dataUrl) {
            img.setAttribute('src', dataUrl)
          }
        })
      )
    }
  })

  await Promise.all(loadPromises)
  mdHtml.value = doc.body.innerHTML
}

// Watch for content changes to re-render Markdown
watch(
  () => [activeFile.content, activeFile.isMarkdown, props.mode],
  () => {
    if (props.mode === 'preview' && activeFile.isMarkdown) {
      renderMarkdownWithImages()
    }
  },
  { immediate: true }
)

// Get directory path from file path
function getDirOf(relPath: string): string {
  const parts = relPath.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

// Handle paste event for image pasting in Markdown files
async function handlePaste(event: ClipboardEvent) {
  // Only handle image paste in Markdown files in editor mode
  if (!activeFile.isMarkdown || props.mode !== 'editor') return

  const items = event.clipboardData?.items
  if (!items) return

  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const file = item.getAsFile()
      if (!file) continue

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            const base64Data = result.split(',')[1]
            resolve(base64Data)
          }
          reader.onerror = () => reject(new Error('Failed to read image'))
          reader.readAsDataURL(file)
        })

        const ext = file.type.split('/')[1] || 'png'
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const fileName = `pasted-image-${timestamp}.${ext}`

        // Save image to the same directory as the current Markdown file
        const targetDir = getDirOf(activeFile.relPath)
        await mainApi.kbCreateImage(targetDir, fileName, base64)

        // Insert Markdown image reference at cursor position
        const editor = monacoEditorRef.value?.getEditor?.()
        if (editor) {
          const selection = editor.getSelection()
          if (selection) {
            const markdownRef = `![](${fileName})`
            editor.executeEdits('paste-image', [
              {
                range: selection,
                text: markdownRef,
                forceMoveMarkers: true
              }
            ])
          }
        }

        eventBus.emit('kbRefresh', { relDir: targetDir })
      } catch (e: any) {
        message.error(`Failed to save image: ${e?.message || String(e)}`)
      }
      break
    }
  }
}

async function openFile(relPath: string) {
  if (!relPath) return

  // Reset zoom state when opening a new file
  resetZoom()

  try {
    await mainApi.kbEnsureRoot()

    // Check if file is an image
    if (isImageFile(relPath)) {
      const res = await mainApi.kbReadFile(relPath, 'base64')
      activeFile.relPath = relPath
      activeFile.content = ''
      activeFile.mtimeMs = res.mtimeMs
      activeFile.isMarkdown = false
      activeFile.isImage = true
      activeFile.imageDataUrl = `data:${res.mimeType};base64,${res.content}`
      activeFile.language = 'plaintext'
    } else {
      const res = await mainApi.kbReadFile(relPath)
      activeFile.relPath = relPath
      activeFile.content = res.content
      activeFile.mtimeMs = res.mtimeMs
      activeFile.isMarkdown = isMarkdownFile(relPath)
      activeFile.isImage = false
      activeFile.imageDataUrl = ''
      activeFile.language = languageFromPath(relPath)
    }
  } catch (e: any) {
    message.error(e?.message || String(e))
  }
}

onMounted(async () => {
  // Load global editor configuration
  await editorConfigStore.loadConfig()

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
  // Clear image cache to prevent memory leaks
  imageCache.clear()
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

.kb-image-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 24px;
  background: var(--bg-color);
  position: relative;
}

.kb-image-container {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease-out;
  user-select: none;

  &.is-draggable {
    cursor: grab;
  }

  &.is-dragging {
    cursor: grabbing;
    transition: none;
  }
}

.kb-image {
  max-width: 100%;
  max-height: calc(100vh - 150px);
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  pointer-events: none;
}

.kb-image-controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 20px;
  backdrop-filter: blur(4px);
}

.kb-zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  &:active {
    background: rgba(255, 255, 255, 0.25);
  }
}

.kb-zoom-reset {
  margin-left: 4px;
}

.kb-zoom-level {
  color: #fff;
  font-size: 12px;
  min-width: 45px;
  text-align: center;
}

.kb-image-loading {
  color: var(--text-color-secondary);
  font-size: 14px;
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
