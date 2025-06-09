# Update the template and script
<template>
  <!--  当 props.ask === 'command' 时，整个内容会使用 Monaco 编辑器以代码形式显示。-->
  <!--  当 props.ask !== 'command' 时，内容会被分成三个部分：-->
  <!--      1.<think></think> 标签中的内容会显示为思考内容，带有折叠面板-->
  <!--      2.代码块（被 ``` ``` 包围的内容）会使用 Monaco 编辑器显示-->
  <!--      3.其他内容会作为普通文本显示，支持 Markdown 渲染-->
  <div>
    <!-- Command mode -->
    <div
      v-if="props.ask === 'command'"
      ref="editorContainer"
      class="command-editor-container"
    >
      <a-collapse
        v-model:active-key="codeActiveKey"
        :default-active-key="['1']"
        :class="{ 'hide-expand-icon': totalLines < 10 }"
        class="code-collapse"
        expand-icon-position="end"
      >
        <a-collapse-panel
          key="1"
          class="code-panel"
        >
          <template #header>
            <a-space>
              <a-typography-text
                type="secondary"
                italic
                :class="{ 'hidden-header': totalLines < 10 }"
              >
                代码预览 ({{ totalLines }}行)
              </a-typography-text>
            </a-space>
          </template>
          <div
            ref="monacoContainer"
            class="monaco-container"
          ></div>
        </a-collapse-panel>
      </a-collapse>
    </div>

    <!-- Non-command mode -->
    <div v-else>
      <!-- Thinking content -->
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
          @change="onToggleExpand(activeKey)"
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
                  <LoadingOutlined
                    v-if="thinkingLoading && thinkingContent"
                    style="margin-right: 4px"
                  />
                  <img
                    v-else
                    :src="thinkingSvg"
                    alt="thinking"
                    class="thinking-icon"
                  />
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

      <!-- Normal content with interspersed code blocks -->
      <div v-if="normalContent || codeBlocks.length > 0">
        <template
          v-for="(part, index) in contentParts"
          :key="index"
        >
          <div
            v-if="part.type === 'text'"
            class="markdown-content"
            style="margin: 0 8px"
            v-html="marked(part.content, null)"
          ></div>
          <div
            v-else-if="part.type === 'code'"
            class="command-editor-container"
          >
            <a-collapse
              v-model:active-key="part.block.activeKey"
              :default-active-key="['1']"
              :class="{ 'hide-expand-icon': part.block.lines < 10 }"
              class="code-collapse"
              expand-icon-position="end"
            >
              <a-collapse-panel
                key="1"
                class="code-panel"
              >
                <template #header>
                  <a-space>
                    <a-typography-text
                      type="secondary"
                      italic
                      :class="{ 'hidden-header': part.block.lines < 10 }"
                    >
                      代码预览 ({{ part.block.lines }}行)
                    </a-typography-text>
                  </a-space>
                </template>
                <div
                  :ref="
                    (el) => {
                      if (el) codeEditors[part.blockIndex] = el as HTMLElement
                    }
                  "
                  class="monaco-container"
                ></div>
              </a-collapse-panel>
            </a-collapse>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, onBeforeUnmount, nextTick, computed } from 'vue'
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
import { LoadingOutlined } from '@ant-design/icons-vue'
import thinkingSvg from '@/assets/icons/thinking.svg'

// 确保Monaco Editor已经完全初始化
if (monaco.editor) {
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
}

const renderedContent = ref('')
const thinkingContent = ref('')
const normalContent = ref('')
const thinkingLoading = ref(true)
const activeKey = ref<string[]>(['1'])
const contentRef = ref<HTMLElement | null>(null)
const editorContainer = ref<HTMLElement | null>(null)
const codeActiveKey = ref<string[]>(['1'])
const monacoContainer = ref<HTMLElement | null>(null)
const totalLines = ref(0)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

const props = defineProps<{
  content: string
  ask?: string
}>()

const codeBlocks = ref<Array<{ content: string; activeKey: string[]; lines: number }>>([])
const codeEditors = ref<Array<HTMLElement | null>>([])

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
  if (!monacoContainer.value || !monaco.editor) return

  // 确保有内容
  const editorContent = content || ''
  const lines = editorContent.split('\n').length

  try {
    const options: monaco.editor.IStandaloneEditorConstructionOptions = {
      value: editorContent,
      language: detectLanguage(editorContent),
      theme: 'custom-dark',
      readOnly: true,
      minimap: { enabled: false },
      lineNumbers: lines > 1 ? 'on' : 'off',
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 12,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      fontSize: 13,
      lineHeight: 20,
      wordWrap: 'on',
      scrollbar: {
        vertical: lines >= 10 ? 'auto' : 'hidden',
        horizontal: 'hidden',
        verticalScrollbarSize: lines >= 10 ? 10 : 0,
        horizontalScrollbarSize: 0,
        alwaysConsumeMouseWheel: false
      },
      renderLineHighlight: 'none',
      selectionHighlight: false,
      domReadOnly: true,
      guides: {
        indentation: true,
        bracketPairs: false
      },
      cursorStyle: 'line-thin',
      cursorBlinking: 'solid',
      renderValidationDecorations: 'off',
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      overviewRulerLanes: 0,
      occurrencesHighlight: 'off' as const,
      renderFinalNewline: 'off' as const,
      cursorWidth: 0,
      fixedOverflowWidgets: true,
      roundedSelection: false,
      renderWhitespace: 'none',
      contextmenu: false,
      links: false
    }

    // 创建编辑器实例
    editor = monaco.editor.create(monacoContainer.value, options)

    // 清除初始选中状态
    editor.setSelection(new monaco.Selection(0, 0, 0, 0))

    // 更新行数和折叠状态
    const updateLinesAndCollapse = () => {
      if (!editor) return
      const model = editor.getModel()
      if (model) {
        const lines = model.getLineCount()
        totalLines.value = lines
        // 如果超过10行，默认折叠
        if (lines > 10) {
          codeActiveKey.value = []
        } else {
          codeActiveKey.value = ['1']
        }
      }
    }

    // 设置编辑器高度
    const updateHeight = () => {
      if (!editor) return

      const contentHeight = editor.getContentHeight()
      if (monacoContainer.value) {
        monacoContainer.value.style.height = `${contentHeight}px`
        editor.layout()
      }
    }

    // 监听内容变化
    editor.onDidChangeModelContent(() => {
      updateLinesAndCollapse()
    })

    editor.onDidContentSizeChange(updateHeight)
    updateHeight()

    // 初始化行数和折叠状态
    updateLinesAndCollapse()

    // 监听折叠状态变化
    watch(codeActiveKey, () => {
      if (!editor) return
      nextTick(() => {
        editor!.layout()
      })
    })
  } catch (error) {
    console.error('Error in initEditor:', error)
  }
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

// Function to extract code blocks from content
const extractCodeBlocks = (content: string) => {
  const blocks: Array<{
    content: string
    activeKey: string[]
    lines: number
    index: number
  }> = []
  let lastIndex = 0
  let blockIndex = 0

  // Find all code blocks while preserving their position
  const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const code = match[1].trim()
    blocks.push({
      content: code,
      activeKey: ['1'],
      lines: code.split('\n').length,
      index: match.index
    })
    blockIndex++
    lastIndex = match.index + match[0].length
  }

  return blocks.sort((a, b) => a.index - b.index)
}

// Function to process content and extract think tags and code blocks
const processContent = (content: string) => {
  if (!content) {
    thinkingContent.value = ''
    normalContent.value = ''
    codeBlocks.value = []
    thinkingLoading.value = false
    return
  }
  // 检查是否开始于 <think> 标签
  if (content.startsWith('<think>')) {
    // 移除开始标签
    content = content.substring('<think>'.length)

    // 查找结束标签位置
    const endIndex = content.indexOf('</think>')
    if (endIndex !== -1) {
      // 提取思考内容
      thinkingContent.value = content.substring(0, endIndex).trim()
      // 获取剩余内容
      content = content.substring(endIndex + '</think>'.length).trim()
      thinkingLoading.value = false
    } else {
      // 没有找到结束标签，全部内容都是思考内容
      thinkingContent.value = content.trim()
      content = ''
      // 保持 loading 状态，因为还没有结束标签
    }
    console.log('thinkingLoading.value', thinkingLoading.value)
  } else {
    thinkingContent.value = ''
  }

  // 处理剩余的普通内容
  if (content) {
    // Extract code blocks while preserving their position
    const blocks = extractCodeBlocks(content)
    codeBlocks.value = blocks

    // Replace code blocks with placeholders in order
    let processedContent = content
    blocks.forEach((block, index) => {
      processedContent = processedContent.replace(
        /```(?:\w+)?\n[\s\S]*?```/,
        `[CODE_BLOCK_${index}]`
      )
    })

    // Set the normal content
    normalContent.value = processedContent.trim()
  } else {
    normalContent.value = ''
    codeBlocks.value = []
  }

  // Initialize editors after content is processed
  nextTick(() => {
    initCodeBlockEditors()
  })
}

// Initialize code block editors
const initCodeBlockEditors = () => {
  nextTick(() => {
    codeBlocks.value.forEach((block, index) => {
      const container = codeEditors.value[index]
      if (!container || !monaco.editor) return

      const editor = monaco.editor.create(container, {
        value: block.content,
        language: detectLanguage(block.content),
        theme: 'custom-dark',
        readOnly: true,
        minimap: { enabled: false },
        lineNumbers: block.lines > 1 ? 'on' : 'off',
        lineNumbersMinChars: 3,
        lineDecorationsWidth: 12,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 13,
        lineHeight: 20,
        wordWrap: 'on',
        scrollbar: {
          vertical: block.lines >= 10 ? 'auto' : 'hidden',
          horizontal: 'hidden',
          verticalScrollbarSize: block.lines >= 10 ? 10 : 0,
          horizontalScrollbarSize: 0,
          alwaysConsumeMouseWheel: false
        },
        glyphMargin: false,
        folding: false,
        padding: {
          top: 8,
          bottom: 8
        },
        renderValidationDecorations: 'off',
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        occurrencesHighlight: 'off' as const,
        renderFinalNewline: 'off' as const,
        cursorWidth: 0,
        renderLineHighlight: 'none',
        fixedOverflowWidgets: true,
        roundedSelection: false,
        renderWhitespace: 'none',
        contextmenu: false,
        links: false
      })

      // 清除初始选中状态
      editor.setSelection(new monaco.Selection(0, 0, 0, 0))

      // Update height
      const updateHeight = () => {
        if (!editor) return
        const contentHeight = editor.getContentHeight()
        if (container) {
          container.style.height = `${contentHeight}px`
          editor.layout()
        }
      }

      editor.onDidContentSizeChange(updateHeight)
      updateHeight()
    })
  })
}

const onToggleExpand = (keys: string[]) => {
  activeKey.value = keys
}

const checkContentHeight = async () => {
  await nextTick()
  if (contentRef.value) {
    const lineHeight = 19.2
    const maxHeight = lineHeight
    // 先计算高度
    const shouldCollapse = contentRef.value.scrollHeight > maxHeight
    setTimeout(() => {
      activeKey.value = shouldCollapse ? [] : ['1']
      thinkingLoading.value = false
    }, 1000) // 与折叠动画时间相同
  }
}

watch(
  () => thinkingContent.value,
  async (newVal) => {
    console.log('thinkingContent watch', thinkingLoading.value)
    if (newVal) {
      thinkingLoading.value = true
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
      initCodeBlockEditors()
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
      codeBlocks.value = []
      // thinkingLoading.value = false
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

// Add computed property for content parts
const contentParts = computed(() => {
  if (!normalContent.value && codeBlocks.value.length === 0) return []

  const parts: Array<{
    type: 'text' | 'code'
    content?: string
    block?: any
    blockIndex?: number
  }> = []
  const segments = normalContent.value.split(/\[CODE_BLOCK_(\d+)\]/)

  segments.forEach((segment, index) => {
    if (index % 2 === 0) {
      // Text content
      if (segment.trim()) {
        parts.push({ type: 'text', content: segment.trim() })
      }
    } else {
      // Code block reference
      const blockIndex = parseInt(segment)
      if (!isNaN(blockIndex) && blockIndex < codeBlocks.value.length) {
        parts.push({
          type: 'code',
          block: codeBlocks.value[blockIndex],
          blockIndex
        })
      }
    }
  })

  return parts
})
</script>

<style>
pre {
  background-color: #2a2a2a;
  border-radius: 8px;
  padding: 8px;
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
  background-color: #1e1e1e !important;
  font-size: 12px !important;
}

.thinking-collapse.ant-collapse .ant-collapse-content {
  background-color: #1e1e1e !important;
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
  background-color: #1e1e1e !important;
}

.thinking-collapse.ant-collapse .thinking-content {
  padding: 0px 5px 5px 5px;
  margin: 0;
  background-color: #1e1e1e !important;
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

.code-collapse {
  border: none !important;
  margin-bottom: 2px;
  border-radius: 4px !important;
  background: transparent !important;
}

.code-collapse .ant-collapse-item {
  border: none !important;
  background: transparent !important;
}

.code-collapse .ant-collapse-header {
  color: #ffffff !important;
  padding: 4px 12px !important;
  background: transparent !important;
  transition: all 0.3s;
  min-height: 0 !important;
  line-height: 1 !important;
}

.code-collapse .ant-collapse-item.ant-collapse-item-active .ant-collapse-header {
  padding-top: 12px !important;
  padding-bottom: 12px !important;
}

.code-collapse .ant-collapse-item:not(.ant-collapse-item-active) .ant-collapse-header {
  padding-top: 12px !important;
}

.code-collapse .ant-collapse-content {
  color: #ffffff !important;
  border: none !important;
  background: transparent !important;
}

.code-collapse .ant-collapse-content-box {
  padding: 2px 5px 2px 5px !important;
}

.code-collapse .ant-typography {
  color: #ffffff !important;
  margin-bottom: 0;
  font-size: 12px !important;
  line-height: 1 !important;
}

.code-collapse .ant-space {
  gap: 4px !important;
}

.monaco-container {
  margin: 4px 0;
  border-radius: 6px;
  overflow: hidden;
  background-color: #282c34;
  min-height: 30px;
}

.hidden-header {
  display: none !important;
}

.code-collapse .ant-collapse-panel .hidden-header + .ant-collapse-arrow {
  display: none !important;
}

.code-collapse .ant-collapse-panel:has(.hidden-header) .ant-collapse-header {
  padding: 0 !important;
  height: 0px !important;
  min-height: 0px !important;
  line-height: 0px !important;
  overflow: hidden !important;
  margin: 0 !important;
  border: none !important;
}

.code-collapse.hide-expand-icon .ant-collapse-header {
  background-color: transparent !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

.code-collapse.hide-expand-icon .ant-collapse-expand-icon {
  display: none !important;
}

.code-collapse.hide-expand-icon .ant-collapse-content {
  margin-top: -35px !important;
  margin-bottom: -7px !important;
}

.thinking-icon {
  width: 16px;
  height: 16px;
  vertical-align: middle;
  filter: invert(0.25);
}
</style>
