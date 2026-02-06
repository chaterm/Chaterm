<template>
  <div
    class="monaco-editor-container"
    :class="{ 'with-custom-bg': hasCustomBg }"
  >
    <div
      ref="editorContainer"
      class="monaco-editor-inner"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount, PropType, computed } from 'vue'
import { storeToRefs } from 'pinia'
import * as monaco from 'monaco-editor'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController'
import { useEditorConfigStore, getFontFamily } from '@/stores/editorConfig'

// Configure Monaco Environment for Web Workers
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// @ts-ignore
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker()
      case 'typescript':
      case 'javascript':
        return new tsWorker()
      default:
        return new editorWorker()
    }
  }
}

// Define props
const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  height: {
    type: String,
    default: '300px'
  },
  language: {
    type: String,
    default: 'javascript'
  },
  theme: {
    type: String,
    default: 'vs-dark'
  },
  options: {
    type: Object as PropType<monaco.editor.IStandaloneEditorConstructionOptions>,
    default: () => ({})
  }
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const editorContainer = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
const monacoVimInstance: any = null
const hasCustomBg = ref(typeof document !== 'undefined' && !!document.body?.classList.contains('has-custom-bg'))
let bgClassObserver: MutationObserver | null = null

// Global editor config store; use storeToRefs so config changes from settings trigger watch
const editorConfigStore = useEditorConfigStore()
const { config: storeConfig } = storeToRefs(editorConfigStore)

// Merge options: props.options > global config > defaults. Build from storeConfig ref for reactivity.
const mergedOptions = computed(() => {
  const c = storeConfig.value
  const globalOptions = {
    fontSize: c.fontSize,
    fontFamily: getFontFamily(c.fontFamily),
    tabSize: c.tabSize,
    wordWrap: c.wordWrap,
    minimap: { enabled: c.minimap },
    mouseWheelZoom: c.mouseWheelZoom,
    cursorBlinking: c.cursorBlinking,
    lineHeight: c.lineHeight || 0
  }
  return {
    ...globalOptions,
    ...props.options
  }
})

const syncHasCustomBg = () => {
  if (typeof document === 'undefined' || !document.body) {
    hasCustomBg.value = false
    return
  }
  hasCustomBg.value = document.body.classList.contains('has-custom-bg')
}

// Set different color config based on theme
const getThemeColors = (): monaco.editor.IColors => {
  if (props.theme === 'vs') {
    // Light theme config
    return {
      'editor.background': '#ffffff',
      'editor.foreground': '#000000',
      'editor.lineHighlightBackground': '#f0f0f0',
      'editorLineNumber.foreground': '#666666',
      'editorLineNumber.activeForeground': '#000000',
      'editorCursor.foreground': '#000000',
      'editor.selectionBackground': '#add6ff',
      'editor.inactiveSelectionBackground': '#e5ebf1'
    }
  }
  return {} // Dark theme keeps default
}

const createEditor = (): void => {
  if (!editorContainer.value) return

  // If it's light theme, define custom theme first
  if (props.theme === 'vs') {
    const themeColors = getThemeColors()
    monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: themeColors
    })
  }

  const defaultOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    value: props.modelValue,
    language: props.language,
    theme: props.theme === 'vs' ? 'custom-light' : props.theme,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    scrollbar: {
      useShadows: false,
      verticalScrollbarSize: 5,
      horizontalScrollbarSize: 5
    },
    padding: {
      top: 0,
      bottom: 400 // Leave about 200px blank space at bottom, similar to VSCode effect
    },
    insertSpaces: true,
    automaticLayout: true,
    guides: {
      indentation: true,
      bracketPairs: true
    },
    stickyScroll: {
      enabled: false
    },
    find: {
      seedSearchStringFromSelection: 'selection',
      autoFindInSelection: 'multiline'
    },
    snippetSuggestions: 'inline',
    suggest: {
      showIcons: true,
      filterGraceful: true,
      localityBonus: true
    },
    lineNumbers: 'on',
    glyphMargin: true,
    folding: true,
    matchBrackets: 'always',
    renderLineHighlight: 'line',
    quickSuggestions: true,
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    // Ensure these don't override user config
    detectIndentation: false, // Don't auto-detect indentation
    useTabStops: true
  }

  // Option priority: props.options > global config > default options
  const finalOptions = {
    ...defaultOptions,
    ...mergedOptions.value
  }

  editor = monaco.editor.create(editorContainer.value, finalOptions)

  // tabSize is model option: apply to model right after creation so indentation takes effect
  const model = editor.getModel()
  if (model && finalOptions.tabSize != null) {
    model.updateOptions({
      tabSize: finalOptions.tabSize,
      insertSpaces: true,
      indentSize: finalOptions.tabSize
    })
  }

  editor.onDidChangeModelContent(() => {
    const value = editor?.getValue() || ''
    if (value !== props.modelValue) {
      emit('update:modelValue', value)
    }
  })
}

onMounted(async () => {
  // Load global editor config from store
  await editorConfigStore.loadConfig()

  // Keep editor background in sync with global custom background state.
  // When `body.has-custom-bg` is toggled in settings, we update a wrapper class
  // to switch Monaco background to a semi-transparent `--bg-color`.
  syncHasCustomBg()
  bgClassObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        syncHasCustomBg()
        break
      }
    }
  })
  bgClassObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  })
  createEditor()
})

watch(
  () => props.modelValue,
  (newValue) => {
    if (editor && newValue !== editor.getValue()) {
      editor.setValue(newValue)
    }
  }
)

watch(
  () => props.language,
  (newValue) => {
    if (editor) {
      const model = editor.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, newValue)
      }
    }
  }
)

watch(
  () => props.theme,
  (newValue) => {
    if (editor) {
      if (newValue === 'vs') {
        // Light theme: apply custom color config
        const themeColors = getThemeColors()
        monaco.editor.defineTheme('custom-light', {
          base: 'vs',
          inherit: true,
          rules: [],
          colors: themeColors
        })
        editor.updateOptions({ theme: 'custom-light' })
      } else {
        // Dark theme: use default theme
        editor.updateOptions({ theme: newValue })
      }
    }
  }
)

watch(
  () => props.height,
  () => {
    if (editor) {
      editor.layout()
    }
  }
)

// Listen for global config changes. tabSize on model; font/size/minimap etc. on editor; then layout to apply font.
watch(
  () => mergedOptions.value,
  (newOptions) => {
    if (!editor) return

    // Update editor options
    editor.updateOptions(newOptions)

    // Update model options for tabSize
    const model = editor.getModel()
    if (model && newOptions.tabSize != null) {
      model.updateOptions({
        tabSize: newOptions.tabSize,
        insertSpaces: true,
        indentSize: newOptions.tabSize
      })
    }

    // Force layout to apply font changes
    editor.layout()
  },
  { deep: true }
)

defineExpose({
  getEditor: () => editor
})

onBeforeUnmount(() => {
  if (bgClassObserver) {
    bgClassObserver.disconnect()
    bgClassObserver = null
  }
  if (monacoVimInstance) {
    monacoVimInstance.dispose()
  }
  if (editor) {
    editor.dispose()
  }
})
</script>

<style scoped>
.monaco-editor-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.monaco-editor-inner {
  width: 100%;
  height: 100%;
}

/* When a custom background image is enabled, use a semi-transparent background
 * so the global background image can show through.
 */
.monaco-editor-container.with-custom-bg :deep(.monaco-editor),
.monaco-editor-container.with-custom-bg :deep(.monaco-editor-background),
.monaco-editor-container.with-custom-bg :deep(.monaco-editor .margin),
.monaco-editor-container.with-custom-bg :deep(.monaco-editor .minimap),
.monaco-editor-container.with-custom-bg :deep(.monaco-editor .minimap-slider) {
  background-color: var(--bg-color) !important;
}
</style>
