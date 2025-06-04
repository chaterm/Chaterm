# Update the template and script
<template>
  <div
    v-if="props.ask === 'command'"
    ref="editorContainer"
    class="command-editor-container"
  ></div>
  <div v-else>
    <template v-if="thinkingContent">
      <div
        ref="contentRef"
        style="position: absolute; visibility: hidden; height: auto"
      >
        <div
          class="thinking-content markdown-content"
          v-html="marked(getThinkingContent(thinkingContent), null)"
        ></div>
      </div>
      <a-collapse
        v-model:active-key="activeKey"
        :default-active-key="['1']"
        class="thinking-collapse"
        expand-icon-position="end"
        @change="onToggleExpand"
      >
        <a-collapse-panel
          key="1"
          class="thinking-panel"
        >
          <template #header>
            <a-space>
              <a-typography-text
                type="secondary"
                italic
              >
                <ThinkingOutlinedIcon style="margin-right: 4px" />
                {{ getThinkingTitle(thinkingContent) }}
              </a-typography-text>
            </a-space>
          </template>
          <div
            class="thinking-content markdown-content"
            v-html="marked(getThinkingContent(thinkingContent), null)"
          ></div>
        </a-collapse-panel>
      </a-collapse>
    </template>
    <div
      v-if="normalContent"
      v-html="marked(normalContent, null)"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, onBeforeUnmount, computed, nextTick } from 'vue'
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
import { ThinkingOutlined as ThinkingOutlinedIcon } from '@ant-design/icons-vue/lib/icons'

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
const thinkingContent = ref('')
const normalContent = ref('')
const activeKey = ref<string[]>(['1'])
const contentRef = ref<HTMLElement | null>(null)
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

  const options: monaco.editor.IStandaloneEditorConstructionOptions = {
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
    domReadOnly: true,
    guides: {
      indentation: false,
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

// Function to process content and extract think tags
const processContent = (content: string) => {
  const thinkMatch = content.match(/<think>([\s\S]*)/)
  if (thinkMatch) {
    thinkingContent.value = thinkMatch[1].trim()
    normalContent.value = content.replace(/<think>[\s\S]*/, '').trim()
  } else {
    thinkingContent.value = ''
    normalContent.value = content
  }
}

const onToggleExpand = (keys: string[]) => {
  activeKey.value = keys
}

const checkContentHeight = async () => {
  await nextTick()
  if (contentRef.value) {
    const lineHeight = 19.2
    const maxHeight = lineHeight
    activeKey.value = contentRef.value.scrollHeight > maxHeight ? [] : ['1']
  }
}

watch(
  () => thinkingContent.value,
  async (newVal) => {
    if (newVal) {
      await checkContentHeight()
    } else {
      activeKey.value = ['1']
    }
  },
  { immediate: true }
)

onMounted(() => {
  marked.setOptions({
    breaks: true,
    gfm: true
  })

  if (props.content) {
    if (props.ask === 'command') {
      initEditor(props.content)
    } else {
      processContent(props.content)
    }
  }
})

// Update the watch handler for content
watch(
  () => props.content,
  (newContent) => {
    if (!newContent) {
      renderedContent.value = ''
      thinkingContent.value = ''
      normalContent.value = ''
      if (editor) {
        editor.setValue('')
      }
      return
    }

    if (props.ask === 'command') {
      updateEditor(newContent)
    } else {
      processContent(newContent)
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
        processContent(props.content)
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

const getThinkingTitle = (content: string) => {
  const firstLineEnd = content.indexOf('\n')
  return firstLineEnd > -1 ? content.substring(0, firstLineEnd).trim() : content
}

const getThinkingContent = (content: string) => {
  const firstLineEnd = content.indexOf('\n')
  return firstLineEnd > -1 ? content.substring(firstLineEnd + 1).trim() : ''
}
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

.thinking-collapse {
  background-color: #3a3a3a !important;
  border: none !important;
}

.thinking-collapse .ant-collapse-item {
  background-color: #3a3a3a !important;
  border: none !important;
}

.thinking-collapse .ant-collapse-header {
  background-color: #3a3a3a !important;
  color: #ffffff !important;
}

.thinking-collapse .ant-collapse-content {
  background-color: #3a3a3a !important;
  color: #ffffff !important;
  border: none !important;
}

.thinking-collapse .ant-typography {
  color: #ffffff !important;
}

.thinking-collapse .thinking-content {
  color: #ffffff !important;
}

.thinking-collapse .ant-collapse-arrow {
  color: #ffffff !important;
}

.thinking-collapse .anticon {
  color: #ffffff !important;
}

.thinking-collapse.ant-collapse {
  background: #3a3a3a;
  border: none;
  margin-bottom: 10px;
  border-radius: 4px !important;
  font-size: 12px;
}

.thinking-collapse.ant-collapse .ant-collapse-item {
  border: none;
  background: #3a3a3a;
  border-radius: 4px !important;
  overflow: hidden;
  font-size: 12px;
}

.thinking-collapse.ant-collapse .ant-collapse-header {
  padding: 8px 12px !important;
  border-radius: 4px !important;
  transition: all 0.3s;
  color: #ffffff !important;
  background-color: #3a3a3a;
  font-size: 12px !important;
}

.thinking-collapse.ant-collapse .ant-collapse-content {
  background-color: #3a3a3a;
  border-top: none;
  border-radius: 0 0 4px 4px !important;
}

.thinking-collapse.ant-collapse .ant-collapse-content-box {
  padding: 2px;
}

.thinking-collapse.ant-collapse .ant-collapse-item-active .ant-collapse-header {
  border-radius: 4px 4px 0 0 !important;
}

.thinking-collapse.ant-collapse .ant-typography {
  color: #ffffff !important;
  margin-bottom: 0;
  font-size: 12px !important;
}

.thinking-collapse.ant-collapse .ant-collapse-header:hover {
  background-color: #3a3a3a;
}

.thinking-collapse.ant-collapse .thinking-content {
  padding: 0px 5px 5px 5px;
  margin: 0;
  background-color: #3a3a3a;
  border-radius: 0 0 4px 4px;
  font-size: 12px;
  line-height: 1.5715;
  color: #ffffff;
}

.thinking-collapse.ant-collapse .ant-collapse-arrow {
  font-size: 12px;
  right: 12px;
  color: #ffffff;
}

.thinking-collapse.ant-collapse .ant-space {
  display: flex;
  align-items: center;
  font-size: 12px;
}

.thinking-collapse.ant-collapse .anticon {
  display: inline-flex;
  align-items: center;
  color: #ffffff;
  font-size: 12px;
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

.markdown-content {
  font-size: 12px;
  line-height: 1.6;
  color: #ffffff;
}

.markdown-content ul,
.markdown-content ol {
  padding-left: 20px;
  margin: 8px 0;
}

.markdown-content li {
  margin: 4px 0;
}

.markdown-content code {
  background-color: #2a2a2a;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
}

.markdown-content p {
  margin: 8px 0;
}

.thinking-collapse.no-collapse {
  background: #3a3a3a;
  border: none;
  margin-bottom: 10px;
  border-radius: 4px !important;
}

.thinking-collapse.no-collapse .thinking-header {
  padding: 8px 12px !important;
  border-radius: 4px 4px 0 0 !important;
  color: #ffffff !important;
  background-color: #3a3a3a;
  font-size: 12px !important;
}

.thinking-collapse.no-collapse .thinking-content {
  padding: 0px 5px 5px 5px;
  background-color: #3a3a3a;
  border-radius: 0 0 4px 4px;
}
</style>
