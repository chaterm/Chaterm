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

const createEditor = (): void => {
  if (!editorContainer.value) return

  const defaultOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    value: props.modelValue,
    language: props.language,
    theme: props.theme,
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
      monaco.editor.setTheme(newValue)
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
