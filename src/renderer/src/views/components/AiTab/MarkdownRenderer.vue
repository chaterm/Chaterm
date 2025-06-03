# Update the template and script
<template>
  <div
    v-if="props.ask === 'command'"
    ref="editorContainer"
    class="command-editor-container"
  ></div>
  <div
    v-else
    v-html="renderedContent"
  ></div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, onBeforeUnmount } from 'vue'
import { marked } from 'marked'
import 'highlight.js/styles/atom-one-dark.css'
import * as monaco from 'monaco-editor'
import 'monaco-editor/esm/vs/editor/editor.all.js'
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution'
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution'
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution'
import 'monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution'
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'

// 配置 Monaco Editor 的全局设置
monaco.editor.defineTheme('custom-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '569cd6', fontStyle: 'bold' },
    { token: 'string', foreground: 'ce9178' },
    { token: 'number', foreground: 'b5cea8' },
    { token: 'comment', foreground: '6a9955' },
    { token: 'variable', foreground: '9cdcfe' },
    { token: 'type', foreground: '4ec9b0' },
    { token: 'function', foreground: 'dcdcaa' },
    { token: 'operator', foreground: 'd4d4d4' }
  ],
  colors: {
    'editor.background': '#282c34',
    'editor.foreground': '#d4d4d4',
    'editorLineNumber.foreground': '#636d83',
    'editorLineNumber.activeForeground': '#9da5b4',
    'editor.selectionBackground': '#264f78',
    'editor.lineHighlightBackground': '#2c313c'
  }
})

const renderedContent = ref('')
const editorContainer = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

const props = defineProps<{
  content: string
  ask?: string
}>()

// Function to detect language from content
const detectLanguage = (content: string): string => {
  if (!content) return 'shell'

  const contentLower = content.toLowerCase()
  const firstLine = content.split('\n')[0].trim()

  // Shebang detection
  if (firstLine.startsWith('#!')) {
    if (firstLine.includes('python')) return 'python'
    if (firstLine.includes('node')) return 'javascript'
    if (firstLine.includes('ruby')) return 'ruby'
    if (firstLine.includes('php')) return 'php'
    return 'shell'
  }

  // File extension in first line comment
  const extensionMatch = firstLine.match(/\.(ts|js|py|go|java|cpp|cs|rb|php|rs|sql)$/i)
  if (extensionMatch) {
    const ext = extensionMatch[1].toLowerCase()
    const extensionMap: { [key: string]: string } = {
      ts: 'typescript',
      js: 'javascript',
      py: 'python',
      go: 'go',
      java: 'java',
      cpp: 'cpp',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      rs: 'rust',
      sql: 'sql'
    }
    if (extensionMap[ext]) return extensionMap[ext]
  }

  // Language specific patterns
  if (contentLower.includes('package ') && contentLower.includes('func ')) {
    return 'go'
  }
  if (
    contentLower.includes('def ') &&
    (contentLower.includes('import ') || contentLower.includes('print('))
  ) {
    return 'python'
  }
  if (
    contentLower.includes('interface ') &&
    (contentLower.includes('extends ') || contentLower.includes('implements '))
  ) {
    return 'typescript'
  }
  if (contentLower.includes('const ') || contentLower.includes('let ') || content.includes('=>')) {
    return 'javascript'
  }
  if (contentLower.includes('public class ') || contentLower.includes('private class ')) {
    return 'java'
  }
  if (
    contentLower.includes('#include') &&
    (contentLower.includes('std::') || contentLower.includes('cout'))
  ) {
    return 'cpp'
  }
  if (contentLower.includes('namespace ') && contentLower.includes('using ')) {
    return 'csharp'
  }
  if (contentLower.includes('require ') && contentLower.includes('end')) {
    return 'ruby'
  }
  if (
    contentLower.includes('<?php') ||
    (contentLower.includes('namespace ') && contentLower.includes('use '))
  ) {
    return 'php'
  }
  if (contentLower.includes('fn ') && contentLower.includes('impl ')) {
    return 'rust'
  }
  if (
    contentLower.includes('select ') &&
    (contentLower.includes('from ') || contentLower.includes('where '))
  ) {
    return 'sql'
  }

  return 'shell'
}

// Initialize editor with content
const initEditor = (content: string) => {
  if (!editorContainer.value) return

  const options: {
    scrollbar: {
      horizontal: string
      horizontalScrollbarSize: number
      vertical: string
      verticalScrollbarSize: number
      alwaysConsumeMouseWheel: boolean
    }
    occurrencesHighlight: boolean
    wordWrap: string
    folding: boolean
    language: string
    cursorBlinking: string
    guides: { highlightActiveIndentGuide: boolean; indentation: boolean; bracketPairs: boolean }
    unicodeHighlight: {
      ambiguousCharacters: boolean
      nonBasicASCII: boolean
      invisibleCharacters: boolean
    }
    minimap: { enabled: boolean }
    theme: string
    links: boolean
    value: string
    padding: { top: number; bottom: number }
    lineNumbers: string
    roundedSelection: boolean
    contextmenu: boolean
    readOnly: boolean
    lineNumbersMinChars: number
    glyphMargin: boolean
    selectionHighlight: boolean
    lineDecorationsWidth: number
    renderWhitespace: string
    scrollBeyondLastLine: boolean
    automaticLayout: boolean
    fixedOverflowWidgets: boolean
    domReadOnly: boolean
    renderLineHighlight: string
    fontSize: number
    lineHeight: number
    cursorStyle: string
  } = {
    value: content,
    language: detectLanguage(content),
    theme: 'custom-dark',
    readOnly: true,
    minimap: { enabled: false },
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    lineDecorationsWidth: 12,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: 13,
    lineHeight: 20,
    wordWrap: 'on',
    scrollbar: {
      vertical: 'hidden',
      horizontal: 'hidden',
      verticalScrollbarSize: 0,
      horizontalScrollbarSize: 0,
      alwaysConsumeMouseWheel: false
    },
    renderLineHighlight: 'line',
    glyphMargin: false,
    folding: false,
    padding: {
      top: 8,
      bottom: 8
    },
    fixedOverflowWidgets: true,
    roundedSelection: false,
    renderWhitespace: 'none',
    contextmenu: false,
    links: false,
    selectionHighlight: false,
    occurrencesHighlight: false,
    domReadOnly: true,
    unicodeHighlight: {
      ambiguousCharacters: false,
      invisibleCharacters: false,
      nonBasicASCII: false
    },
    guides: {
      indentation: false,
      highlightActiveIndentGuide: false,
      bracketPairs: false
    },
    cursorStyle: 'line-thin',
    cursorBlinking: 'solid'
  }

  editor = monaco.editor.create(editorContainer.value, options)

  // 设置编辑器最小高度
  const updateHeight = () => {
    const contentHeight = Math.max(editor!.getContentHeight(), 30) // 最小高度30px
    editorContainer.value!.style.height = `${contentHeight}px`
    editor!.layout()
  }

  editor.onDidContentSizeChange(updateHeight)
  updateHeight()
}

// Update editor content and language
const updateEditor = (content: string) => {
  if (!editor) {
    initEditor(content)
    return
  }

  const model = editor.getModel()
  if (model) {
    const language = detectLanguage(content)
    monaco.editor.setModelLanguage(model, language)
    editor.setValue(content)
  }
}

onMounted(() => {
  marked.setOptions({
    breaks: true,
    gfm: true
  })

  if (props.content) {
    if (props.ask === 'command') {
      initEditor(props.content)
    } else {
      renderedContent.value = marked(props.content)
    }
  }
})

// Watch for content changes
watch(
  () => props.content,
  (newContent) => {
    if (!newContent) {
      renderedContent.value = ''
      if (editor) {
        editor.setValue('')
      }
      return
    }

    if (props.ask === 'command') {
      updateEditor(newContent)
    } else {
      renderedContent.value = marked(newContent)
    }
  }
)

// Watch for ask type changes
watch(
  () => props.ask,
  (newAsk) => {
    if (newAsk === 'command') {
      if (props.content) {
        if (!editor) {
          initEditor(props.content)
        } else {
          updateEditor(props.content)
        }
      }
    } else {
      if (editor) {
        editor.dispose()
        editor = null
      }
      if (props.content) {
        renderedContent.value = marked(props.content)
      }
    }
  }
)

// Cleanup
onBeforeUnmount(() => {
  if (editor) {
    editor.dispose()
    editor = null
  }
})
</script>

<style>
pre {
  background-color: #282c34;
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 1em 0;
}

code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.9em;
}

.command-editor-container {
  margin: 4px 0;
  border-radius: 6px;
  overflow: hidden;
  background-color: #282c34;
  min-height: 30px;
  height: auto;
}

:deep(.monaco-editor) {
  padding-top: 4px;
  padding-bottom: 4px;
}

:deep(.monaco-editor .margin) {
  background-color: #282c34 !important;
  border-right: 1px solid #3a3f4b !important;
  width: 50px !important;
}

:deep(.monaco-editor .line-numbers) {
  color: #636d83 !important;
  font-size: 12px !important;
  cursor: default !important;
  padding-right: 8px !important;
}

:deep(.monaco-editor .current-line) {
  border: none !important;
  background-color: #2c313c !important;
}

:deep(.monaco-editor .view-overlays .current-line) {
  border: none !important;
}

:deep(.monaco-editor .lines-content) {
  padding-left: 8px !important;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-title,
.hljs-section,
.hljs-doctag,
.hljs-name,
.hljs-strong {
  font-weight: bold;
}

.hljs-comment {
  color: #7f848e;
}

.hljs-string,
.hljs-attr {
  color: #98c379;
}

.hljs-keyword,
.hljs-type {
  color: #c678dd;
}

.hljs-literal,
.hljs-number {
  color: #d19a66;
}

.hljs-tag,
.hljs-name,
.hljs-attribute {
  color: #e06c75;
}

.hljs-function,
.hljs-subst {
  color: #61afef;
}
</style>
