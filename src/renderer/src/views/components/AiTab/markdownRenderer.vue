# Update the template and script
<template>
  <!--  当 props.ask === 'command' 时，整个内容会使用 Monaco 编辑器以代码形式显示。-->
  <!--  当 props.ask !== 'command' 时，内容会被分成三个部分：-->
  <!--      1.<think></think> 或 <thinking></thinking> 标签中的内容会显示为思考内容，带有折叠面板-->
  <!--      2.代码块（被 ``` ``` 包围的内容）会使用 Monaco 编辑器显示-->
  <!--      3.其他内容会作为普通文本显示，支持 Markdown 渲染-->
  <div>
    <!-- Command mode -->
    <div
      v-if="props.ask === 'command' || props.say === 'command'"
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
              <a-button
                v-if="totalLines >= 10"
                class="copy-button"
                type="text"
                size="small"
                @click.stop="copyEditorContent"
              >
                <img
                  :src="copySvg"
                  alt="copy"
                  class="copy-icon"
                />
              </a-button>
            </a-space>
          </template>
          <div
            ref="monacoContainer"
            class="monaco-container"
            :class="{ collapsed: !codeActiveKey.includes('1') }"
          >
            <a-button
              v-if="totalLines < 10"
              class="copy-button"
              type="text"
              size="small"
              @click="copyEditorContent"
            >
              <img
                :src="copySvg"
                alt="copy"
                class="copy-icon"
              />
            </a-button>
          </div>
        </a-collapse-panel>
      </a-collapse>
    </div>

    <!-- Non-command mode -->
    <div v-else>
      <!-- Command output mode -->
      <div
        v-if="props.say === 'command_output'"
        class="command-output"
      >
        <div
          v-for="(line, index) in contentLines"
          :key="index"
          class="output-line"
        >
          <template v-if="line.type === 'prompt'">
            <span class="prompt">{{ line.prompt }}</span>
            <span class="command">{{ line.command }}</span>
          </template>
          <template v-else-if="line.type === 'ls'">
            <span class="permissions">{{ line.permissions }}</span>
            <span class="links">{{ line.links }}</span>
            <span class="user">{{ line.user }}</span>
            <span class="group">{{ line.group }}</span>
            <span class="size">{{ line.size }}</span>
            <span class="date">{{ line.date }}</span>
            <span :class="line.fileType">{{ line.name }}</span>
          </template>
          <template v-else>
            <span
              v-if="line.html"
              class="content"
              v-html="line.html"
            ></span>
            <span
              v-else
              class="content"
              >{{ line.content }}</span
            >
          </template>
        </div>
      </div>

      <!-- Thinking content -->
      <template v-else-if="thinkingContent">
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
      <div v-else-if="normalContent || codeBlocks.length > 0">
        <template
          v-for="(part, index) in contentParts"
          :key="index"
        >
          <div
            v-if="part.type === 'text'"
            class="markdown-content"
            style="margin: 0 8px"
            v-html="marked(part.content || '', null)"
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
                    <a-button
                      v-if="part.block.lines >= 10"
                      class="copy-button"
                      type="text"
                      size="small"
                      @click.stop="part.blockIndex !== undefined && copyBlockContent(part.blockIndex)"
                    >
                      <img
                        :src="copySvg"
                        alt="copy"
                        class="copy-icon"
                      />
                    </a-button>
                  </a-space>
                </template>
                <div
                  :ref="
                    (el) => {
                      if (el && typeof part.blockIndex === 'number') {
                        codeEditors[part.blockIndex] = el as HTMLElement
                      }
                    }
                  "
                  class="monaco-container"
                >
                  <a-button
                    v-if="part.block.lines < 10"
                    class="copy-button"
                    type="text"
                    size="small"
                    @click="part.blockIndex !== undefined && copyBlockContent(part.blockIndex)"
                  >
                    <img
                      :src="copySvg"
                      alt="copy"
                      class="copy-icon"
                    />
                  </a-button>
                </div>
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
import { LoadingOutlined, CopyOutlined } from '@ant-design/icons-vue'
import thinkingSvg from '@/assets/icons/thinking.svg'
import copySvg from '@/assets/icons/copy.svg'
import { message } from 'ant-design-vue'
import i18n from '@/locales'

const { t } = i18n.global
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

  // 定义亮色主题
  monaco.editor.defineTheme('custom-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '0000ff', fontStyle: 'bold' },
      { token: 'string', foreground: 'a31515' },
      { token: 'number', foreground: '098658' },
      { token: 'comment', foreground: '008000' },
      { token: 'variable', foreground: '001080' },
      { token: 'type', foreground: '267f99' },
      { token: 'function', foreground: '795e26' },
      { token: 'operator', foreground: '000000' }
    ],
    colors: {
      'editor.background': '#d9e1ff',
      'editor.foreground': '#000000',
      'editorLineNumber.foreground': '#999999',
      'editorLineNumber.activeForeground': '#333333',
      'editor.selectionBackground': '#add6ff',
      'editor.lineHighlightBackground': '#f5f5f5'
    }
  })
}

const renderedContent = ref('')
const thinkingContent = ref('')
const normalContent = ref('')
const thinkingLoading = ref(false)
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
  say?: string
  partial?: boolean
}>()

const codeBlocks = ref<Array<{ content: string; activeKey: string[]; lines: number }>>([])
const codeEditors = ref<Array<HTMLElement | null>>([])

const contentStableTimeout = ref<NodeJS.Timeout | null>(null)

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
  if (contentLower.includes('def ') && (contentLower.includes('import ') || contentLower.includes('print('))) {
    return 'python'
  }
  if (contentLower.includes('interface ') && (contentLower.includes('extends ') || contentLower.includes('implements '))) {
    return 'typescript'
  }
  if (contentLower.includes('const ') || contentLower.includes('let ') || content.includes('=>')) {
    return 'javascript'
  }
  if (contentLower.includes('public class ') || contentLower.includes('private class ')) {
    return 'java'
  }
  if (contentLower.includes('#include') && (contentLower.includes('std::') || contentLower.includes('cout'))) {
    return 'cpp'
  }
  if (contentLower.includes('namespace ') && contentLower.includes('using ')) {
    return 'csharp'
  }
  if (contentLower.includes('require ') && contentLower.includes('end')) {
    return 'ruby'
  }
  if (contentLower.includes('<?php') || (contentLower.includes('namespace ') && contentLower.includes('use '))) {
    return 'php'
  }
  if (contentLower.includes('fn ') && contentLower.includes('impl ')) {
    return 'rust'
  }
  if (contentLower.includes('select ') && (contentLower.includes('from ') || contentLower.includes('where '))) {
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
      theme: document.body.classList.contains('theme-dark') ? 'custom-dark' : 'custom-light',
      readOnly: true,
      minimap: { enabled: false },
      lineNumbers: lines > 1 ? 'on' : 'off',
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 2,
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

    // 监听内容变化并更新配置
    editor.onDidChangeModelContent(() => {
      if (!editor) return
      const model = editor.getModel()
      if (model) {
        const currentLines = model.getLineCount()
        editor.updateOptions({
          lineNumbers: currentLines > 1 ? 'on' : 'off'
        })
      }
    })

    // 更新行数和折叠状态
    const updateLinesAndCollapse = () => {
      if (!editor) return
      const model = editor.getModel()
      if (model) {
        const lines = model.getLineCount()
        totalLines.value = lines
        // 默认展开
        codeActiveKey.value = ['1']
      }
    }

    // 设置编辑器高度
    const updateHeight = () => {
      if (!editor) return

      const contentHeight = editor.getContentHeight()
      if (monacoContainer.value) {
        monacoContainer.value.style.height = `${contentHeight + 10}px`
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
  // let lastIndex = 0
  // let blockIndex = 0

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
    // blockIndex++
    // lastIndex = match.index + match[0].length
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
  if (props.say === 'reasoning') {
    processReasoningContent(props.content)
    return
  }
  if (props.say === 'command_output') {
    normalContent.value = content
    return
  }

  // 检查是否开始于 <think> 或 <thinking> 标签
  let startTag = ''
  let endTag = ''

  if (content.startsWith('<think>')) {
    startTag = '<think>'
    endTag = '</think>'
  } else if (content.startsWith('<thinking>')) {
    startTag = '<thinking>'
    endTag = '</thinking>'
  }

  if (startTag) {
    // 移除开始标签
    content = content.substring(startTag.length)

    // 查找结束标签位置
    const endIndex = content.indexOf(endTag)
    if (endIndex !== -1) {
      // 提取思考内容
      thinkingContent.value = content.substring(0, endIndex).trim()
      // 获取剩余内容
      content = content.substring(endIndex + endTag.length).trim()
      thinkingLoading.value = false
      if (activeKey.value.length !== 0) {
        checkContentHeight()
      }
    } else {
      // 没有找到结束标签，全部内容都是思考内容
      thinkingContent.value = content.trim()
      content = ''
      // 保持 loading 状态，因为还没有结束标签
      thinkingLoading.value = true
    }
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
    blocks.forEach((_, index) => {
      processedContent = processedContent.replace(/```(?:\w+)?\n[\s\S]*?```/, `[CODE_BLOCK_${index}]`)
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

      // 清理已存在的编辑器实例
      const existingEditor = monaco.editor.getEditors().find((e) => e.getContainerDomNode() === container)
      if (existingEditor) {
        existingEditor.dispose()
      }

      const editor = monaco.editor.create(container, {
        value: block.content,
        language: detectLanguage(block.content),
        theme: document.body.classList.contains('theme-dark') ? 'custom-dark' : 'custom-light',
        readOnly: true,
        minimap: { enabled: false },
        lineNumbers: block.lines > 1 ? 'on' : 'off',
        lineNumbersMinChars: 3,
        lineDecorationsWidth: 2,
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

      // 监听内容变化并更新配置
      editor.onDidChangeModelContent(() => {
        const model = editor.getModel()
        if (model) {
          const currentLines = model.getLineCount()
          editor.updateOptions({
            lineNumbers: currentLines > 1 ? 'on' : 'off'
          })
        }
      })

      // Update height
      const updateHeight = () => {
        if (!editor) return
        const contentHeight = editor.getContentHeight()
        if (container) {
          container.style.height = `${contentHeight + 10}px`
          editor.layout()
        }
      }

      editor.onDidContentSizeChange(updateHeight)
      updateHeight()
    })
  })
}

const processReasoningContent = (content: string) => {
  if (!content) {
    thinkingContent.value = ''
    normalContent.value = ''
    codeBlocks.value = []
    thinkingLoading.value = false
    return
  }
  thinkingContent.value = content.trim()
  if (props.partial) {
    thinkingLoading.value = true
  } else {
    thinkingLoading.value = false
    if (activeKey.value.length !== 0) {
      checkContentHeight()
    }
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
    // 先计算高度
    const shouldCollapse = contentRef.value.scrollHeight > maxHeight
    setTimeout(() => {
      activeKey.value = shouldCollapse ? [] : ['1']
      thinkingLoading.value = false
      // 触发折叠状态变化事件
      // console.log('思考内容折叠状态变化:', activeKey.value)
      emit('collapse-change', activeKey.value)
    }, 1000) // 与折叠动画时间相同
  }
}

watch(
  () => thinkingContent.value,
  async (newVal) => {
    if (newVal) {
      thinkingLoading.value = true
    } else {
      activeKey.value = ['1']
    }
  },
  { immediate: true }
)

// 主题变化观察器
const themeObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.target === document.body && mutation.attributeName === 'class') {
      const isDark = document.body.classList.contains('theme-dark')
      // 更新主编辑器主题
      if (editor) {
        monaco.editor.setTheme(isDark ? 'custom-dark' : 'custom-light')
      }
      // 更新代码块编辑器主题
      monaco.editor.getEditors().forEach((ed) => {
        if (ed !== editor) {
          monaco.editor.setTheme(isDark ? 'custom-dark' : 'custom-light')
        }
      })
    }
  })
})

onMounted(() => {
  marked.setOptions({
    breaks: true,
    gfm: true
  })

  // 开始观察主题变化
  themeObserver.observe(document.body, { attributes: true })

  if (props.content) {
    if (props.ask === 'command' || props.say === 'command') {
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
      if (editor) {
        editor.setValue('')
      }
      return
    }

    if (props.ask === 'command' || props.say === 'command') {
      // 每次内容变化时先清除之前的定时器
      if (contentStableTimeout.value) {
        clearTimeout(contentStableTimeout.value)
      }

      // 内容变化时先更新编辑器并展开
      updateEditor(newContent)
      codeActiveKey.value = ['1']

      // 设置新的定时器等待内容稳定
      contentStableTimeout.value = setTimeout(() => {
        if (editor) {
          const model = editor.getModel()
          if (model && model.getLineCount() > 10) {
            codeActiveKey.value = []
            // 触发折叠状态变化事件
            // console.log('代码块思考内容折叠状态变化:', codeActiveKey.value)
            emit('collapse-change', codeActiveKey.value)
          }
        }
      }, 2000) // 等待1秒无变化
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

watch(
  () => props.partial,
  (newPartial) => {
    if (props.say === 'reasoning' && !newPartial) {
      processContent(props.content)
    }
  }
)

// Cleanup
onBeforeUnmount(() => {
  // 停止主题观察
  themeObserver.disconnect()

  if (contentStableTimeout.value) {
    clearTimeout(contentStableTimeout.value)
  }
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

// Function to strip ANSI escape codes
const stripAnsiCodes = (str: string): string => {
  // This regex matches ANSI escape sequences like color codes
  return str.replace(/\u001b\[\d+(;\d+)*m/g, '')
}

// Function to process ANSI escape codes into HTML with CSS classes
const processAnsiCodes = (str: string): string => {
  // If no ANSI codes, return as is
  if (!str.includes('\u001b[')) return str

  // Replace common ANSI color codes with span elements
  let result = str
    // Text formatting
    .replace(/\u001b\[0m/g, '</span>') // Reset
    .replace(/\u001b\[1m/g, '<span class="ansi-bold">') // Bold
    .replace(/\u001b\[3m/g, '<span class="ansi-italic">') // Italic
    .replace(/\u001b\[4m/g, '<span class="ansi-underline">') // Underline

    // Foreground colors
    .replace(/\u001b\[30m/g, '<span class="ansi-black">') // Black
    .replace(/\u001b\[31m/g, '<span class="ansi-red">') // Red
    .replace(/\u001b\[32m/g, '<span class="ansi-green">') // Green
    .replace(/\u001b\[33m/g, '<span class="ansi-yellow">') // Yellow
    .replace(/\u001b\[34m/g, '<span class="ansi-blue">') // Blue
    .replace(/\u001b\[35m/g, '<span class="ansi-magenta">') // Magenta
    .replace(/\u001b\[36m/g, '<span class="ansi-cyan">') // Cyan
    .replace(/\u001b\[37m/g, '<span class="ansi-white">') // White

    // Bright foreground colors
    .replace(/\u001b\[90m/g, '<span class="ansi-bright-black">') // Bright Black
    .replace(/\u001b\[91m/g, '<span class="ansi-bright-red">') // Bright Red
    .replace(/\u001b\[92m/g, '<span class="ansi-bright-green">') // Bright Green
    .replace(/\u001b\[93m/g, '<span class="ansi-bright-yellow">') // Bright Yellow
    .replace(/\u001b\[94m/g, '<span class="ansi-bright-blue">') // Bright Blue
    .replace(/\u001b\[95m/g, '<span class="ansi-bright-magenta">') // Bright Magenta
    .replace(/\u001b\[96m/g, '<span class="ansi-bright-cyan">') // Bright Cyan
    .replace(/\u001b\[97m/g, '<span class="ansi-bright-white">') // Bright White

    // Background colors
    .replace(/\u001b\[40m/g, '<span class="ansi-bg-black">') // Black background
    .replace(/\u001b\[41m/g, '<span class="ansi-bg-red">') // Red background
    .replace(/\u001b\[42m/g, '<span class="ansi-bg-green">') // Green background
    .replace(/\u001b\[43m/g, '<span class="ansi-bg-yellow">') // Yellow background
    .replace(/\u001b\[44m/g, '<span class="ansi-bg-blue">') // Blue background
    .replace(/\u001b\[45m/g, '<span class="ansi-bg-magenta">') // Magenta background
    .replace(/\u001b\[46m/g, '<span class="ansi-bg-cyan">') // Cyan background
    .replace(/\u001b\[47m/g, '<span class="ansi-bg-white">') // White background

    // Bright background colors
    .replace(/\u001b\[100m/g, '<span class="ansi-bg-bright-black">') // Bright Black background
    .replace(/\u001b\[101m/g, '<span class="ansi-bg-bright-red">') // Bright Red background
    .replace(/\u001b\[102m/g, '<span class="ansi-bg-bright-green">') // Bright Green background
    .replace(/\u001b\[103m/g, '<span class="ansi-bg-bright-yellow">') // Bright Yellow background
    .replace(/\u001b\[104m/g, '<span class="ansi-bg-bright-blue">') // Bright Blue background
    .replace(/\u001b\[105m/g, '<span class="ansi-bg-bright-magenta">') // Bright Magenta background
    .replace(/\u001b\[106m/g, '<span class="ansi-bg-bright-cyan">') // Bright Cyan background
    .replace(/\u001b\[107m/g, '<span class="ansi-bg-bright-white">') // Bright White background

  // Handle combined color codes like \u001b[1;31m (bold red)
  result = result.replace(/\u001b\[(\d+);(\d+)m/g, (match, p1, p2) => {
    let replacement = ''

    // Handle first parameter
    if (p1 === '0') replacement += '</span><span>'
    else if (p1 === '1') replacement += '<span class="ansi-bold">'
    else if (p1 === '3') replacement += '<span class="ansi-italic">'
    else if (p1 === '4') replacement += '<span class="ansi-underline">'
    else if (p1 >= '30' && p1 <= '37') replacement += `<span class="ansi-${getColorName(parseInt(p1, 10) - 30)}">`
    else if (p1 >= '40' && p1 <= '47') replacement += `<span class="ansi-bg-${getColorName(parseInt(p1, 10) - 40)}">`
    else if (p1 >= '90' && p1 <= '97') replacement += `<span class="ansi-bright-${getColorName(parseInt(p1, 10) - 90)}">`
    else if (p1 >= '100' && p1 <= '107') replacement += `<span class="ansi-bg-bright-${getColorName(parseInt(p1, 10) - 100)}">`

    // Handle second parameter
    if (p2 === '0') replacement += '</span><span>'
    else if (p2 === '1') replacement += '<span class="ansi-bold">'
    else if (p2 === '3') replacement += '<span class="ansi-italic">'
    else if (p2 === '4') replacement += '<span class="ansi-underline">'
    else if (p2 >= '30' && p2 <= '37') replacement += `<span class="ansi-${getColorName(parseInt(p2, 10) - 30)}">`
    else if (p2 >= '40' && p2 <= '47') replacement += `<span class="ansi-bg-${getColorName(parseInt(p2, 10) - 40)}">`
    else if (p2 >= '90' && p2 <= '97') replacement += `<span class="ansi-bright-${getColorName(parseInt(p2, 10) - 90)}">`
    else if (p2 >= '100' && p2 <= '107') replacement += `<span class="ansi-bg-bright-${getColorName(parseInt(p2, 10) - 100)}">`

    return replacement
  })

  // Handle any remaining ANSI codes by stripping them
  result = result.replace(/\u001b\[\d+[A-Za-z]/g, '') // Remove cursor movement codes
  result = result.replace(/\u001b\[\d+(;\d+)*[A-Za-z]/g, '') // Remove other control sequences
  result = result.replace(/\u001b\[\??\d+[hl]/g, '') // Remove mode setting
  result = result.replace(/\u001b\[K/g, '') // Remove EL - Erase in Line

  // Ensure all spans are closed
  const openTags = (result.match(/<span/g) || []).length
  const closeTags = (result.match(/<\/span>/g) || []).length

  if (openTags > closeTags) {
    result += '</span>'.repeat(openTags - closeTags)
  }

  return result
}

// Helper function to get color name from index
const getColorName = (index: number): string => {
  const colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
  return colors[index] || 'white'
}

// Add computed property for content lines
const contentLines = computed(() => {
  if (!props.content) return []

  const lines = props.content.split('\n')
  return lines.map((line) => {
    // Process ANSI escape codes for display
    const processedLine = stripAnsiCodes(line)

    // Check if it's a prompt line
    if (processedLine.startsWith('$ ') || processedLine.startsWith('# ')) {
      return {
        type: 'prompt',
        prompt: processedLine.charAt(0),
        command: processedLine.substring(2)
      }
    }

    // Check if it's an ls output line
    const lsMatch = processedLine.match(/^([drwx-]+)\s+(\d+)\s+(\w+)\s+(\w+)\s+(\d+)\s+([A-Za-z]+\s+\d+\s+(?:\d{2}:\d{2}|\d{4}))\s+(.+)$/)
    if (lsMatch) {
      const [, permissions, links, user, group, size, date, name] = lsMatch
      return {
        type: 'ls',
        permissions,
        links,
        user,
        group,
        size,
        date,
        name,
        fileType: permissions.startsWith('d') ? 'directory' : permissions.includes('x') ? 'executable' : 'file'
      }
    }

    // Regular content line with ANSI processing
    return {
      type: 'content',
      content: processedLine,
      html: processAnsiCodes(line)
    }
  })
})

const copyEditorContent = () => {
  if (editor) {
    const content = editor.getValue()
    navigator.clipboard.writeText(content).then(() => {
      // 可以添加一个复制成功的提示
      message.success(t('ai.copyToClipboard'))
    })
  }
}

const copyBlockContent = (blockIndex: number) => {
  const container = codeEditors.value[blockIndex]
  if (container) {
    // 获取对应的 Monaco Editor 实例
    const editorInstance = monaco.editor.getEditors().find((e) => e.getContainerDomNode() === container)
    if (editorInstance) {
      const content = editorInstance.getValue()
      navigator.clipboard.writeText(content).then(() => {
        message.success(t('ai.copyToClipboard'))
      })
    }
  }
}

// 定义emit
const emit = defineEmits(['collapse-change'])
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
  background-color: var(--bg-color-septenary);
  min-height: 30px;
  height: auto;
}

.thinking-collapse {
  background-color: var(--bg-color-quaternary) !important;
  border: none !important;
}

.thinking-collapse .ant-collapse-item {
  background-color: var(--bg-color-quaternary) !important;
  border: none !important;
}

.thinking-collapse .ant-collapse-header {
  background-color: var(--bg-color-quaternary) !important;
  color: var(--text-color) !important;
}

.thinking-collapse .ant-collapse-content {
  background-color: var(--bg-color-quaternary) !important;
  color: var(--text-color) !important;
  border: none !important;
}

.thinking-collapse .ant-typography {
  color: var(--text-color) !important;
}

.thinking-collapse .thinking-content {
  color: var(--text-color) !important;
}

.thinking-collapse .ant-collapse-arrow {
  color: var(--text-color) !important;
}

.thinking-collapse .anticon {
  color: var(--text-color) !important;
}

.thinking-collapse.ant-collapse {
  background: var(--bg-color-quaternary);
  border: none;
  margin-bottom: 10px;
  border-radius: 4px !important;
  font-size: 12px;
}

.thinking-collapse.ant-collapse .ant-collapse-item {
  border: none;
  background: var(--bg-color-quaternary);
  border-radius: 4px !important;
  overflow: hidden;
  font-size: 12px;
}

.thinking-collapse.ant-collapse .ant-collapse-header {
  padding: 8px 12px !important;
  border-radius: 4px !important;
  transition: all 0.3s;
  color: var(--text-color) !important;
  background-color: var(--bg-color-secondary) !important;
  font-size: 12px !important;
}

.thinking-collapse.ant-collapse .ant-collapse-content {
  background-color: var(--bg-color-secondary) !important;
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
  color: var(--text-color) !important;
  margin-bottom: 0;
  font-size: 12px !important;
}

.thinking-collapse.ant-collapse .ant-collapse-header:hover {
  background-color: var(--bg-color-secondary) !important;
}

.thinking-collapse.ant-collapse .thinking-content {
  padding: 0px 5px 5px 5px;
  margin: 0;
  background-color: var(--bg-color-secondary) !important;
  border-radius: 0 0 4px 4px;
  font-size: 12px;
  line-height: 1.5715;
  color: var(--text-color);
}

.thinking-collapse.ant-collapse .ant-collapse-arrow {
  font-size: 12px;
  right: 12px;
  color: var(--text-color);
}

.thinking-collapse.ant-collapse .ant-space {
  display: flex;
  align-items: center;
  font-size: 12px;
}

.thinking-collapse.ant-collapse .anticon {
  display: inline-flex;
  align-items: center;
  color: var(--text-color);
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
  color: var(--text-color);
  word-wrap: break-word;
  word-break: break-word;
  overflow-wrap: break-word;
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
  background-color: var(--bg-color-quinary);
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
  color: var(--text-color) !important;
  background-color: var(--bg-color-quaternary);
  font-size: 12px !important;
}

.thinking-collapse.no-collapse .thinking-content {
  padding: 0px 5px 5px 5px;
  background-color: var(--bg-color-quaternary);
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
  color: var(--text-color) !important;
  padding: 4px 12px !important;
  background: transparent !important;
  transition: all 0.3s;
  min-height: 32px !important;
  height: 32px !important;
  line-height: 32px !important;
  display: flex !important;
  align-items: center !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.code-collapse .ant-collapse-content {
  color: var(--text-color) !important;
  border: none !important;
  background: transparent !important;
}

.code-collapse .ant-collapse-content-box {
  padding: 2px 5px 2px 5px !important;
}

.code-collapse .ant-typography {
  color: var(--text-color) !important;
  margin-bottom: 0;
  font-size: 12px !important;
}

.code-collapse .ant-space {
  gap: 4px !important;
  height: 100%;
  align-items: center;
}

.code-collapse .ant-collapse-header-text {
  margin-right: 80px;
  display: flex;
  align-items: center;
  height: 100%;
}

.code-collapse .ant-collapse-expand-icon {
  position: absolute !important;
  right: 16px !important;
  margin-left: 0 !important;
  height: 32px !important;
  line-height: 32px !important;
  display: flex !important;
  align-items: center !important;
}

.code-collapse .ant-collapse-header .copy-button {
  position: absolute;
  right: 30px;
  top: 40%;
  transform: translateY(-50%);
  z-index: 1;
  height: 24px !important;
  line-height: 24px !important;
}

.monaco-container {
  margin: 4px 0;
  border-radius: 6px;
  overflow: hidden;
  background-color: var(--bg-color-septenary);
  min-height: 30px;
  position: relative;
  padding: 2px 0 8px 0;
}

.monaco-container.collapsed .copy-button {
  top: -30px;
  right: 30px;
}

.copy-button {
  color: var(--text-color);
  opacity: 0.6;
  transition: opacity 0.3s;
}

.monaco-container .copy-button {
  position: absolute;
  top: -1px;
  right: -4px;
  z-index: 100;
}

.copy-button:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
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

.copy-icon {
  width: 11px;
  height: 11px;
  vertical-align: middle;
  filter: invert(0.25);
}

.markdown-content pre {
  background-color: var(--bg-color-quinary);
  border-radius: 8px;
  padding: 8px;
  overflow-x: hidden;
  margin: 1em 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.markdown-content pre code {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.command-output {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background-color: var(--bg-color-quinary);
  color: var(--text-color);
  padding: 28px 12px 12px;
  border-radius: 8px;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  overflow: hidden;
  overflow-x: auto;
  position: relative;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.command-output::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 18px;
  background: var(--bg-color-quinary);
  border-bottom: 1px solid var(--bg-color-quaternary);
}

.command-output::after {
  content: 'OUTPUT';
  position: absolute;
  top: 0;
  left: 8px;
  height: 18px;
  line-height: 18px;
  font-size: 10px;
  color: #7e8ba3;
}

.command-output .error {
  color: #e06c75;
  font-weight: 500;
}

.command-output .success {
  color: #98c379;
}

.command-output .warning {
  color: #e5c07b;
}

.command-output .info {
  color: #61afef;
}

.command-output .directory {
  color: #61afef;
  font-weight: 500;
}

.command-output .file {
  color: var(--text-color);
}

.command-output .executable {
  color: #98c379;
  font-weight: 500;
}

.command-output .link {
  color: #c678dd;
  text-decoration: underline;
}

.command-output .line-number {
  color: #636d83;
  margin-right: 8px;
  user-select: none;
}

.command-output .highlight {
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  padding: 0 2px;
}

.command-output .cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background-color: var(--text-color);
  animation: blink 1s step-end infinite;
  margin-left: 2px;
  vertical-align: middle;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

.command-output pre {
  margin: 8px 0;
  padding: 8px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre;
  width: 100%;
}

.command-output code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  padding: 2px 4px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  white-space: pre;
}

.command-output .table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  table-layout: fixed;
}

.command-output .table th,
.command-output .table td {
  padding: 4px 8px;
  text-align: left;
  border-bottom: 1px solid #2a2a2a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-output .table th:last-child,
.command-output .table td:last-child {
  width: 100%;
}

.command-output .table th:not(:last-child),
.command-output .table td:not(:last-child) {
  width: auto;
  white-space: nowrap;
}

.command-output .progress-bar {
  height: 4px;
  background-color: var(--bg-color-quinary);
  border-radius: 2px;
  margin: 8px 0;
  overflow: hidden;
}

.command-output .progress-bar-fill {
  height: 100%;
  background-color: #61afef;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.command-output .output-line {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  min-width: max-content;
  width: 100%;
}

.command-output .output-line > * {
  flex-shrink: 0;
}

.command-output .output-line .content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  word-break: break-all;
}

.command-output .permissions {
  color: #e5c07b;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  width: 80px;
  flex-shrink: 0;
}

.command-output .links {
  color: #98c379;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  width: 20px;
  flex-shrink: 0;
}

.command-output .user {
  color: #e06c75;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  width: 80px;
  flex-shrink: 0;
}

.command-output .group {
  color: #c678dd;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  width: 80px;
  flex-shrink: 0;
}

.command-output .size {
  color: #56b6c2;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  width: 60px;
  flex-shrink: 0;
}

.command-output .date {
  color: #d19a66;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  width: 120px;
  flex-shrink: 0;
}

.command-output .filename {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-output .prompt {
  color: #98c379;
  font-weight: 500;
  margin-right: 4px;
  flex-shrink: 0;
}

.command-output .command {
  color: #61afef;
  font-weight: 500;
  flex-shrink: 0;
}

.command-output .output {
  color: #d4d4d4;
  margin: 4px 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  word-break: break-all;
}

/* ANSI Color Styles */
.ansi-black {
  color: #000000;
}

.ansi-red {
  color: #e06c75;
}

.ansi-green {
  color: #98c379;
}

.ansi-yellow {
  color: #e5c07b;
}

.ansi-blue {
  color: #61afef;
}

.ansi-magenta {
  color: #c678dd;
}

.ansi-cyan {
  color: #56b6c2;
}

.ansi-white {
  color: #abb2bf;
}

.ansi-bright-black {
  color: #5c6370;
}

.ansi-bright-red {
  color: #ff7b86;
}

.ansi-bright-green {
  color: #b5e890;
}

.ansi-bright-yellow {
  color: #ffd68a;
}

.ansi-bright-blue {
  color: #79c0ff;
}

.ansi-bright-magenta {
  color: #d8a6ff;
}

.ansi-bright-cyan {
  color: #7ce8ff;
}

.ansi-bright-white {
  color: #ffffff;
}

/* ANSI Background Colors */
.ansi-bg-black {
  background-color: #000000;
}

.ansi-bg-red {
  background-color: #e06c75;
}

.ansi-bg-green {
  background-color: #98c379;
}

.ansi-bg-yellow {
  background-color: #e5c07b;
}

.ansi-bg-blue {
  background-color: #61afef;
}

.ansi-bg-magenta {
  background-color: #c678dd;
}

.ansi-bg-cyan {
  background-color: #56b6c2;
}

.ansi-bg-white {
  background-color: #abb2bf;
}

.ansi-bg-bright-black {
  background-color: #5c6370;
}

.ansi-bg-bright-red {
  background-color: #ff7b86;
}

.ansi-bg-bright-green {
  background-color: #b5e890;
}

.ansi-bg-bright-yellow {
  background-color: #ffd68a;
}

.ansi-bg-bright-blue {
  background-color: #79c0ff;
}

.ansi-bg-bright-magenta {
  background-color: #d8a6ff;
}

.ansi-bg-bright-cyan {
  background-color: #7ce8ff;
}

.ansi-bg-bright-white {
  background-color: #ffffff;
}

/* ANSI Text Formatting */
.ansi-bold {
  font-weight: bold;
}

.ansi-italic {
  font-style: italic;
}

.ansi-underline {
  text-decoration: underline;
}

.command-output::-webkit-scrollbar {
  height: 2px;
}

.command-output::-webkit-scrollbar-track {
  background: transparent;
}

.command-output::-webkit-scrollbar-thumb {
  background: var(--bg-color-quaternary);
  border-radius: 1px;
}
</style>
