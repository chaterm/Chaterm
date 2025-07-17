<template>
  <div class="monaco-editor-container">
    <div
      ref="editorContainer"
      class="monaco-editor-inner"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount, PropType } from 'vue'
import * as monaco from 'monaco-editor'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController'

// 定义属性
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

// 根据主题设置不同的颜色配置
const getThemeColors = (): monaco.editor.IColors => {
  if (props.theme === 'vs') {
    // 亮色主题配置
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
  return {} // 暗色主题保持默认
}

const createEditor = (): void => {
  if (!editorContainer.value) return

  // 如果是亮色主题，先定义自定义主题
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
    fontSize: 12,
    fontFamily: 'Hack',
    smoothScrolling: true,
    scrollbar: {
      useShadows: false,
      verticalScrollbarSize: 5,
      horizontalScrollbarSize: 5
    },
    lineHeight: 0,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'off',
    automaticLayout: true,
    guides: {
      indentation: true,
      bracketPairs: true
    },
    stickyScroll: {
      enabled: false
    },
    mouseWheelZoom: true,
    find: {
      seedSearchStringFromSelection: 'selection',
      autoFindInSelection: 'multiline'
    },
    cursorBlinking: 'blink',
    snippetSuggestions: 'inline',
    suggest: {
      showIcons: true,
      filterGraceful: true,
      localityBonus: true
    },
    lineNumbers: 'on',
    glyphMargin: true,
    folding: true,
    minimap: {
      enabled: true,
      side: 'right',
      showSlider: 'mouseover',
      renderCharacters: true
    },
    matchBrackets: 'always',
    renderLineHighlight: 'line',
    quickSuggestions: true,
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined'
  }

  editor = monaco.editor.create(editorContainer.value, {
    ...defaultOptions,
    ...props.options
  })

  editor.onDidChangeModelContent(() => {
    const value = editor?.getValue() || ''
    if (value !== props.modelValue) {
      emit('update:modelValue', value)
    }
  })
}

onMounted(() => {
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
        // 亮色主题：应用自定义颜色配置
        const themeColors = getThemeColors()
        monaco.editor.defineTheme('custom-light', {
          base: 'vs',
          inherit: true,
          rules: [],
          colors: themeColors
        })
        editor.updateOptions({ theme: 'custom-light' })
      } else {
        // 暗色主题：使用默认主题
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

defineExpose({
  getEditor: () => editor
})

onBeforeUnmount(() => {
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
</style>
