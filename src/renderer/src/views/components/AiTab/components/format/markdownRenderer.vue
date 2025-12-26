<template>
  <div>
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
                {{ t('ai.codePreview', { lines: totalLines }) }}
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
    <div v-else>
      <!-- Code content of command_output uses markdown rendering -->
      <div
        v-if="props.say === 'command_output' && codeDetection.isCode"
        class="terminal-output-container"
      >
        <div
          v-show="true"
          class="terminal-output-header"
        >
          <div
            class="output-title-section"
            @click="toggleCodeOutput"
          >
            <a-button
              class="toggle-button"
              type="text"
              size="small"
            >
              <CaretDownOutlined v-if="isCodeExpanded" />
              <CaretRightOutlined v-else />
            </a-button>
            <span class="output-title">OUTPUT</span>
          </div>
          <div class="output-controls">
            <span class="output-lines">{{ props.content.split('\n').length }} lines</span>
            <a-button
              class="copy-button-header"
              type="text"
              size="small"
              @click="copyCodeContent"
            >
              <img
                :src="copySvg"
                alt="copy"
                class="copy-icon"
              />
            </a-button>
          </div>
        </div>
        <div
          v-show="isCodeExpanded"
          class="code-content-body"
          v-html="marked('```' + (codeDetection.language || '') + '\n' + props.content + '\n```')"
        ></div>
      </div>
      <TerminalOutputRenderer
        v-else-if="props.say === 'command_output'"
        :content="props.content"
        :host-id="props.hostId"
        :host-name="props.hostName"
        :color-tag="props.colorTag"
      />
      <div
        v-else-if="props.say === 'search_result'"
        class="command-output-container search-result"
      >
        <div
          class="command-output-header"
          @click="toggleCommandOutput"
        >
          <span class="output-title">
            <CodeOutlined class="output-icon" />
            Search Result
          </span>
          <div class="output-controls">
            <span class="output-lines">{{ contentLines.length }} lines</span>
            <a-button
              class="copy-button-header"
              type="text"
              size="small"
              @click.stop="copyCommandOutput"
            >
              <img
                :src="copySvg"
                alt="copy"
                class="copy-icon"
              />
            </a-button>
            <a-button
              class="toggle-button"
              type="text"
              size="small"
              @click.stop="toggleCommandOutput"
            >
              <CaretDownOutlined v-if="commandOutputActiveKey.includes('1')" />
              <CaretRightOutlined v-else />
            </a-button>
          </div>
        </div>
        <div
          v-show="commandOutputActiveKey.includes('1')"
          class="command-output"
        >
          <div
            v-for="(line, index) in contentLines"
            :key="index"
            class="output-line"
          >
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
          </div>
        </div>
      </div>

      <template v-else-if="thinkingContent">
        <div
          v-if="showThinkingMeasurement"
          ref="contentRef"
          class="thinking-measurement"
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

      <div v-else-if="normalContent || codeBlocks.length > 0">
        <template
          v-for="(part, index) in contentParts"
          :key="index"
        >
          <div
            v-if="part.type === 'text'"
            class="markdown-content"
            :class="{ 'ssh-info-message': props.say === 'sshInfo' }"
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
                      {{ t('ai.codePreview', { lines: part.block.lines }) }}
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
import { LoadingOutlined, CaretDownOutlined, CaretRightOutlined, CodeOutlined } from '@ant-design/icons-vue'
import thinkingSvg from '@/assets/icons/thinking.svg'
import copySvg from '@/assets/icons/copy.svg'
import { message } from 'ant-design-vue'
import i18n from '@/locales'
import { extractFinalOutput, cleanAnsiEscapeSequences } from '@/utils/terminalOutputExtractor'
import { userConfigStore as userConfigStoreService } from '@/services/userConfigStoreService'
import { getCustomTheme, isDarkTheme } from '@/utils/themeUtils'
import TerminalOutputRenderer from '../format/terminalOutputRenderer.vue'

const { t } = i18n.global

// Add functions related to sensitive data de-identification
const applySecretRedactionToMarkdown = (text: string, enabled: boolean = true): string => {
  if (!enabled || !text) {
    return text
  }

  // Define the detection mode for sensitive data
  const SECRET_PATTERNS = [
    { name: 'IPv4 Address', pattern: /\b((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}\b/g },
    { name: 'IPv6 Address', pattern: /\b((([0-9A-Fa-f]{1,4}:){1,6}:)|(([0-9A-Fa-f]{1,4}:){7}))([0-9A-Fa-f]{1,4})\b/g },
    { name: 'Slack App Token', pattern: /\bxapp-[0-9]+-[A-Za-z0-9_]+-[0-9]+-[a-f0-9]+\b/g },
    { name: 'Phone Number', pattern: /\b(\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g },
    { name: 'AWS Access ID', pattern: /\b(AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{12,}\b/g },
    { name: 'MAC Address', pattern: /\b((([a-zA-z0-9]{2}[-:]){5}([a-zA-z0-9]{2}))|(([a-zA-z0-9]{2}:){5}([a-zA-z0-9]{2})))\b/g },
    { name: 'Google API Key', pattern: /\bAIza[0-9A-Za-z-_]{35}\b/g },
    { name: 'Google OAuth ID', pattern: /\b[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com\b/g },
    { name: 'GitHub Classic Personal Access Token', pattern: /\bghp_[A-Za-z0-9_]{36}\b/g },
    { name: 'GitHub Fine Grained Personal Access Token', pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
    { name: 'GitHub OAuth Access Token', pattern: /\bgho_[A-Za-z0-9_]{36}\b/g },
    { name: 'GitHub User to Server Token', pattern: /\bghu_[A-Za-z0-9_]{36}\b/g },
    { name: 'GitHub Server to Server Token', pattern: /\bghs_[A-Za-z0-9_]{36}\b/g },
    { name: 'Stripe Key', pattern: /\b(?:r|s)k_(test|live)_[0-9a-zA-Z]{24}\b/g },
    { name: 'Firebase Auth Domain', pattern: /\b([a-z0-9-]){1,30}(\.firebaseapp\.com)\b/g },
    { name: 'JSON Web Token', pattern: /\b(ey[a-zA-z0-9_\-=]{10,}\.){2}[a-zA-z0-9_\-=]{10,}\b/g },
    { name: 'OpenAI API Key', pattern: /\bsk-[a-zA-Z0-9]{48}\b/g },
    { name: 'Anthropic API Key', pattern: /\bsk-ant-api\d{0,2}-[a-zA-Z0-9\-]{80,120}\b/g },
    { name: 'Fireworks API Key', pattern: /\bfw_[a-zA-Z0-9]{24}\b/g }
  ]

  let redactedText = text
  for (const pattern of SECRET_PATTERNS) {
    redactedText = redactedText.replace(pattern.pattern, (match) => {
      // Use strikethrough Markdown syntax to mark sensitive information
      return `~~${match}~~`
    })
  }

  return redactedText
}

// Check if sensitive data de-identification has been enabled
const isMarkdownSecretRedactionEnabled = async (): Promise<boolean> => {
  try {
    const config = await userConfigStoreService.getConfig()
    return config?.secretRedaction === 'enabled'
  } catch (error) {
    console.error('Failed to get secret redaction config for markdown:', error)
    return false
  }
}

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
      'editor.background': '#1a1a1a',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#636d83',
      'editorLineNumber.activeForeground': '#9da5b4',
      'editor.selectionBackground': '#264f78',
      'editor.lineHighlightBackground': '#2c313c'
    }
  })
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
      'editor.background': '#f8fafc',
      'editor.foreground': '#000000',
      'editorLineNumber.foreground': '#666666',
      'editorLineNumber.activeForeground': '#000000',
      'editor.selectionBackground': '#add6ff',
      'editor.lineHighlightBackground': '#f0f0f0'
    }
  })
}

const thinkingContent = ref('')
const normalContent = ref('')
const thinkingLoading = ref(false)
const showThinkingMeasurement = ref(false)
let thinkingMeasurementToken = 0
const isCancelled = ref(false)
const commandOutputActiveKey = ref<string[]>(['1'])
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
  executedCommand?: string
  // Multi-host execution identification
  hostId?: string
  hostName?: string
  colorTag?: string
}>()

// Detect if content is code - reuse existing detectLanguage method
const isCodeContent = (content: string): { isCode: boolean; language?: string } => {
  if (!content || typeof content !== 'string') {
    return { isCode: false }
  }

  const lines = content.split('\n')
  const nonEmptyLines = lines.filter((line) => line.trim())

  // If content is too short, it is not considered code
  if (nonEmptyLines.length < 3) return { isCode: false }

  // Use existing detectLanguage method to detect language
  const detectedLanguage = detectLanguage(content)

  // If the detected language is not 'shell', it is considered code
  if (detectedLanguage && detectedLanguage !== 'shell') {
    return { isCode: true, language: detectedLanguage }
  }

  return { isCode: false }
}

// Computed property: detect if current content is code
const codeDetection = computed(() => {
  if (props.say === 'command_output' && props.content) {
    return isCodeContent(props.content)
  }
  return { isCode: false }
})

const codeBlocks = ref<Array<{ content: string; activeKey: string[]; lines: number }>>([])
const codeEditors = ref<Array<HTMLElement | null>>([])
const isCodeExpanded = ref(false) // Code content default folded

const contentStableTimeout = ref<NodeJS.Timeout | null>(null)

const detectLanguage = (content: string): string => {
  if (!content) return 'shell'

  const contentLower = content.toLowerCase()
  const firstLine = content.split('\n')[0].trim()

  if (firstLine.startsWith('#!')) {
    if (firstLine.includes('python')) return 'python'
    if (firstLine.includes('node')) return 'javascript'
    if (firstLine.includes('ruby')) return 'ruby'
    if (firstLine.includes('php')) return 'php'
    return 'shell'
  }

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

const initEditor = (content: string) => {
  if (!monacoContainer.value || !monaco.editor) return

  const editorContent = content || ''
  const lines = editorContent.split('\n').length

  try {
    const options: monaco.editor.IStandaloneEditorConstructionOptions = {
      value: editorContent,
      language: detectLanguage(editorContent),
      theme: getCustomTheme(),
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

    editor = monaco.editor.create(monacoContainer.value, options)

    editor.setSelection(new monaco.Selection(0, 0, 0, 0))

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

    const updateLinesAndCollapse = () => {
      if (!editor) return
      const model = editor.getModel()
      if (model) {
        const lines = model.getLineCount()
        totalLines.value = lines
        codeActiveKey.value = ['1']
      }
    }

    const updateHeight = () => {
      if (!editor) return

      const contentHeight = editor.getContentHeight()
      if (monacoContainer.value) {
        monacoContainer.value.style.height = `${contentHeight + 10}px`
        editor.layout()
      }
    }

    editor.onDidChangeModelContent(() => {
      updateLinesAndCollapse()
    })

    editor.onDidContentSizeChange(updateHeight)
    updateHeight()

    updateLinesAndCollapse()

    watch(codeActiveKey, () => {
      if (!editor) return
      nextTick(() => {
        editor!.layout()
      })
    })

    // Set new timer to wait for content stability
    contentStableTimeout.value = setTimeout(() => {
      if (editor) {
        const model = editor.getModel()
        if (model && model.getLineCount() > 10) {
          codeActiveKey.value = []
        }
      }
    }, 2000)
  } catch (error) {
    console.error('Error in initEditor:', error)
  }
}

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

const extractCodeBlocks = (content: string) => {
  const blocks: Array<{
    content: string
    activeKey: string[]
    lines: number
    index: number
  }> = []

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
  }

  return blocks.sort((a, b) => a.index - b.index)
}

const processContent = async (content: string) => {
  if (!content) {
    thinkingContent.value = ''
    showThinkingMeasurement.value = false
    thinkingMeasurementToken++
    normalContent.value = ''
    codeBlocks.value = []
    thinkingLoading.value = false
    return
  }

  // Apply sensitive data de-identification
  const redactionEnabled = await isMarkdownSecretRedactionEnabled()
  let processedContent = applySecretRedactionToMarkdown(content, redactionEnabled)

  if (props.say === 'reasoning') {
    processReasoningContent(processedContent)
    return
  }
  if (props.say === 'command_output') {
    return
  }

  let startTag = ''
  let endTag = ''

  if (processedContent.startsWith('<think>')) {
    startTag = '<think>'
    endTag = '</think>'
  } else if (processedContent.startsWith('<thinking>')) {
    startTag = '<thinking>'
    endTag = '</thinking>'
  }

  if (startTag) {
    processedContent = processedContent.substring(startTag.length)

    const endIndex = processedContent.indexOf(endTag)
    if (endIndex !== -1) {
      thinkingContent.value = processedContent.substring(0, endIndex).trim()
      showThinkingMeasurement.value = true
      processedContent = processedContent.substring(endIndex + endTag.length).trim()
      thinkingLoading.value = false
      if (activeKey.value.length !== 0) {
        checkContentHeight()
      }
    } else {
      thinkingContent.value = processedContent.trim()
      showThinkingMeasurement.value = true
      processedContent = ''
      if (!isCancelled.value) {
        thinkingLoading.value = true
      }
    }
  } else {
    thinkingContent.value = ''
    showThinkingMeasurement.value = false
    thinkingMeasurementToken++
  }

  if (processedContent) {
    const blocks = extractCodeBlocks(processedContent)
    codeBlocks.value = blocks

    let finalContent = processedContent
    blocks.forEach((_, index) => {
      finalContent = finalContent.replace(/```(?:\w+)?\n[\s\S]*?```/, `[CODE_BLOCK_${index}]`)
    })

    normalContent.value = finalContent.trim()
  } else {
    normalContent.value = ''
    codeBlocks.value = []
  }

  nextTick(() => {
    initCodeBlockEditors()
  })
}

const initCodeBlockEditors = () => {
  nextTick(() => {
    codeBlocks.value.forEach((block, index) => {
      const container = codeEditors.value[index]
      if (!container || !monaco.editor) return

      const existingEditor = monaco.editor.getEditors().find((e) => e.getContainerDomNode() === container)
      if (existingEditor) {
        existingEditor.dispose()
      }

      const editor = monaco.editor.create(container, {
        value: block.content,
        language: detectLanguage(block.content),
        theme: getCustomTheme(),
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

      editor.setSelection(new monaco.Selection(0, 0, 0, 0))

      editor.onDidChangeModelContent(() => {
        const model = editor.getModel()
        if (model) {
          const currentLines = model.getLineCount()
          editor.updateOptions({
            lineNumbers: currentLines > 1 ? 'on' : 'off'
          })
        }
      })

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
    showThinkingMeasurement.value = false
    thinkingMeasurementToken++
    return
  }
  thinkingContent.value = content.trim()
  showThinkingMeasurement.value = true
  if (props.partial && !isCancelled.value) {
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
    const shouldCollapse = contentRef.value.scrollHeight > maxHeight
    const currentToken = ++thinkingMeasurementToken
    setTimeout(() => {
      if (currentToken !== thinkingMeasurementToken) {
        return
      }
      activeKey.value = shouldCollapse ? [] : ['1']
      thinkingLoading.value = false
      showThinkingMeasurement.value = false
    }, 1000)
  }
}

watch(
  () => thinkingContent.value,
  async (newVal) => {
    if (newVal && !isCancelled.value) {
      thinkingLoading.value = true
    } else {
      activeKey.value = ['1']
    }
  },
  { immediate: true }
)

const themeObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.target === document.documentElement && mutation.attributeName === 'class') {
      const isDark = isDarkTheme()
      if (editor) {
        monaco.editor.setTheme(isDark ? 'custom-dark' : 'custom-light')
      }
      monaco.editor.getEditors().forEach((ed) => {
        if (ed !== editor) {
          monaco.editor.setTheme(isDark ? 'custom-dark' : 'custom-light')
        }
      })
    }
  })
})

onMounted(async () => {
  marked.setOptions({
    breaks: true,
    gfm: true
  })

  // Make sure that the strikethrough renderer is functioning properly
  marked.use({
    renderer: {
      del(token) {
        return `<del>${this.parser.parseInline(token.tokens)}</del>`
      }
    }
  })

  themeObserver.observe(document.documentElement, { attributes: true })

  if (props.content) {
    if (props.ask === 'command' || props.say === 'command') {
      initEditor(props.content)
    } else if (props.say === 'command_output') {
      // command_output is handled by TerminalOutputRenderer component, no additional processing needed
    } else if (props.say === 'search_result') {
      await processContentLines(props.content)
    } else {
      await processContent(props.content)
      initCodeBlockEditors()
    }
  }
})

watch(
  () => props.content,
  (newContent) => {
    if (!newContent) {
      thinkingContent.value = ''
      showThinkingMeasurement.value = false
      thinkingMeasurementToken++
      normalContent.value = ''
      codeBlocks.value = []
      if (editor) {
        editor.setValue('')
      }
      return
    }

    if (props.ask === 'command' || props.say === 'command') {
      if (contentStableTimeout.value) {
        clearTimeout(contentStableTimeout.value)
      }

      updateEditor(newContent)
      codeActiveKey.value = ['1']

      contentStableTimeout.value = setTimeout(() => {
        if (editor) {
          const model = editor.getModel()
          if (model && model.getLineCount() > 10) {
            codeActiveKey.value = []
          }
        }
      }, 2000)
    } else if (props.say === 'command_output') {
      // command_output is handled by TerminalOutputRenderer component, no additional processing needed
    } else if (props.say === 'search_result') {
      nextTick(async () => {
        await processContentLines(newContent)
      })
    } else {
      nextTick(async () => {
        await processContent(newContent)
      })
    }
  }
)

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
        if (props.say === 'command_output') {
          // command_output is handled by TerminalOutputRenderer component, no additional processing needed
        } else if (props.say === 'search_result') {
          nextTick(async () => {
            await processContentLines(props.content)
          })
        } else {
          nextTick(async () => {
            await processContent(props.content)
          })
        }
      }
    }
  }
)

watch(
  () => props.say,
  (newSay) => {
    if (props.content) {
      if (newSay === 'command_output') {
        // command_output is handled by TerminalOutputRenderer component, no additional processing needed
      } else if (newSay === 'search_result') {
        nextTick(async () => {
          await processContentLines(props.content)
        })
      } else if (newSay === 'command') {
        if (!editor) {
          initEditor(props.content)
        } else {
          updateEditor(props.content)
        }
      } else {
        if (editor) {
          editor.dispose()
          editor = null
        }
        nextTick(async () => {
          await processContent(props.content)
        })
      }
    }
  }
)

watch(
  () => props.partial,
  (newPartial) => {
    if (props.say === 'reasoning' && !newPartial) {
      nextTick(async () => {
        await processContent(props.content)
      })
    }
  }
)

onBeforeUnmount(() => {
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
      if (segment.trim()) {
        parts.push({ type: 'text', content: segment.trim() })
      }
    } else {
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

const stripAnsiCodes = (str: string): string => {
  return cleanAnsiEscapeSequences(str)
}

const processAnsiCodes = (str: string): string => {
  if (!str.includes('\u001b[')) return str

  let result = str
    .replace(/\u001b\[[\d;]*[HfABCDEFGJKSTijklmnpqrsu]/g, '')
    .replace(/\u001b\[\?[0-9;]*[hl]/g, '')
    .replace(/\u001b\([AB01]/g, '')
    .replace(/\u001b[=>]/g, '')
    .replace(/\u001b[NO]/g, '')
    .replace(/\u001b\]0;[^\x07]*\x07/g, '')
    .replace(/\u001b\[K/g, '')
    .replace(/\u001b\[J/g, '')
    .replace(/\u001b\[2J/g, '')
    .replace(/\u001b\[H/g, '')
    .replace(/\x00/g, '')
    .replace(/\r/g, '')
    .replace(/\x07/g, '')
    .replace(/\x08/g, '')
    .replace(/\x0B/g, '')
    .replace(/\x0C/g, '')
    .replace(/\u001b\[0m/g, '</span>') // Reset
    .replace(/\u001b\[1m/g, '<span class="ansi-bold">') // Bold
    .replace(/\u001b\[3m/g, '<span class="ansi-italic">') // Italic
    .replace(/\u001b\[4m/g, '<span class="ansi-underline">') // Underline
    .replace(/\u001b\[30m/g, '<span class="ansi-black">') // Black
    .replace(/\u001b\[31m/g, '<span class="ansi-red">') // Red
    .replace(/\u001b\[32m/g, '<span class="ansi-green">') // Green
    .replace(/\u001b\[33m/g, '<span class="ansi-yellow">') // Yellow
    .replace(/\u001b\[34m/g, '<span class="ansi-blue">') // Blue
    .replace(/\u001b\[35m/g, '<span class="ansi-magenta">') // Magenta
    .replace(/\u001b\[36m/g, '<span class="ansi-cyan">') // Cyan
    .replace(/\u001b\[37m/g, '<span class="ansi-white">') // White
    .replace(/\u001b\[90m/g, '<span class="ansi-bright-black">') // Bright Black
    .replace(/\u001b\[91m/g, '<span class="ansi-bright-red">') // Bright Red
    .replace(/\u001b\[92m/g, '<span class="ansi-bright-green">') // Bright Green
    .replace(/\u001b\[93m/g, '<span class="ansi-bright-yellow">') // Bright Yellow
    .replace(/\u001b\[94m/g, '<span class="ansi-bright-blue">') // Bright Blue
    .replace(/\u001b\[95m/g, '<span class="ansi-bright-magenta">') // Bright Magenta
    .replace(/\u001b\[96m/g, '<span class="ansi-bright-cyan">') // Bright Cyan
    .replace(/\u001b\[97m/g, '<span class="ansi-bright-white">') // Bright White
    .replace(/\u001b\[40m/g, '<span class="ansi-bg-black">') // Black background
    .replace(/\u001b\[41m/g, '<span class="ansi-bg-red">') // Red background
    .replace(/\u001b\[42m/g, '<span class="ansi-bg-green">') // Green background
    .replace(/\u001b\[43m/g, '<span class="ansi-bg-yellow">') // Yellow background
    .replace(/\u001b\[44m/g, '<span class="ansi-bg-blue">') // Blue background
    .replace(/\u001b\[45m/g, '<span class="ansi-bg-magenta">') // Magenta background
    .replace(/\u001b\[46m/g, '<span class="ansi-bg-cyan">') // Cyan background
    .replace(/\u001b\[47m/g, '<span class="ansi-bg-white">') // White background
    .replace(/\u001b\[100m/g, '<span class="ansi-bg-bright-black">') // Bright Black background
    .replace(/\u001b\[101m/g, '<span class="ansi-bg-bright-red">') // Bright Red background
    .replace(/\u001b\[102m/g, '<span class="ansi-bg-bright-green">') // Bright Green background
    .replace(/\u001b\[103m/g, '<span class="ansi-bg-bright-yellow">') // Bright Yellow background
    .replace(/\u001b\[104m/g, '<span class="ansi-bg-bright-blue">') // Bright Blue background
    .replace(/\u001b\[105m/g, '<span class="ansi-bg-bright-magenta">') // Bright Magenta background
    .replace(/\u001b\[106m/g, '<span class="ansi-bg-bright-cyan">') // Bright Cyan background
    .replace(/\u001b\[107m/g, '<span class="ansi-bg-bright-white">') // Bright White background

  result = result.replace(/\u001b\[(\d+);(\d+)m/g, (_, p1, p2) => {
    let replacement = ''

    if (p1 === '0') replacement += '</span><span>'
    else if (p1 === '1') replacement += '<span class="ansi-bold">'
    else if (p1 === '3') replacement += '<span class="ansi-italic">'
    else if (p1 === '4') replacement += '<span class="ansi-underline">'
    else if (p1 >= '30' && p1 <= '37') replacement += `<span class="ansi-${getColorName(parseInt(p1, 10) - 30)}">`
    else if (p1 >= '40' && p1 <= '47') replacement += `<span class="ansi-bg-${getColorName(parseInt(p1, 10) - 40)}">`
    else if (p1 >= '90' && p1 <= '97') replacement += `<span class="ansi-bright-${getColorName(parseInt(p1, 10) - 90)}">`
    else if (p1 >= '100' && p1 <= '107') replacement += `<span class="ansi-bg-bright-${getColorName(parseInt(p1, 10) - 100)}">`

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

  result = result.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
  result = result.replace(/\u001b\[\??\d+[hl]/g, '')
  result = result.replace(/\u001b\[K/g, '')

  const openTags = (result.match(/<span/g) || []).length
  const closeTags = (result.match(/<\/span>/g) || []).length

  if (openTags > closeTags) {
    result += '</span>'.repeat(openTags - closeTags)
  }

  return result
}

const getColorName = (index: number): string => {
  const colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
  return colors[index] || 'white'
}

// Reactive ref to store processed content lines with redaction applied
const processedContentLines = ref<Array<any>>([])

// Function to process content lines with secret redaction
const processContentLines = async (content: string) => {
  if (!content) {
    processedContentLines.value = []
    return
  }

  const redactionEnabled = await isMarkdownSecretRedactionEnabled()
  const formattedOutput = extractFinalOutput(content)

  // Apply secret redaction to the entire output if redaction is enabled
  const processedOutput = redactionEnabled ? applySecretRedactionToMarkdown(formattedOutput, true) : formattedOutput

  const lines = processedOutput.split('\n')

  processedContentLines.value = lines.map((line) => {
    const processedLine = stripAnsiCodes(line)

    if (processedLine.startsWith('$ ') || processedLine.startsWith('# ')) {
      return {
        type: 'prompt',
        prompt: processedLine.charAt(0),
        command: processedLine.substring(2)
      }
    }

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

    // Convert markdown strikethrough to HTML for command output
    let htmlContent = processAnsiCodes(line)
    if (redactionEnabled && htmlContent.includes('~~')) {
      htmlContent = htmlContent.replace(/~~([^~]+)~~/g, '<del>$1</del>')
    }

    return {
      type: 'content',
      content: processedLine,
      html: htmlContent
    }
  })
}

// Computed property that returns the processed content lines
const contentLines = computed(() => {
  return processedContentLines.value
})

const copyEditorContent = () => {
  if (editor) {
    const content = editor.getValue()
    navigator.clipboard.writeText(content).then(() => {
      message.success(t('ai.copyToClipboard'))
    })
  }
}

const copyCodeContent = () => {
  if (props.content) {
    navigator.clipboard.writeText(props.content).then(() => {
      message.success(t('ai.copyToClipboard'))
    })
  }
}

const toggleCodeOutput = () => {
  isCodeExpanded.value = !isCodeExpanded.value
}

const copyBlockContent = (blockIndex: number) => {
  const container = codeEditors.value[blockIndex]
  if (container) {
    const editorInstance = monaco.editor.getEditors().find((e) => e.getContainerDomNode() === container)
    if (editorInstance) {
      const content = editorInstance.getValue()
      navigator.clipboard.writeText(content).then(() => {
        message.success(t('ai.copyToClipboard'))
      })
    }
  }
}

const copyCommandOutput = () => {
  const outputText = contentLines.value
    .map((line) => {
      if (line.type === 'prompt') {
        return `${line.prompt} ${line.command}`
      } else if (line.type === 'ls') {
        return `${line.permissions} ${line.links} ${line.user} ${line.group} ${line.size} ${line.date} ${line.name}`
      } else {
        return line.content || ''
      }
    })
    .join('\n')

  navigator.clipboard.writeText(outputText).then(() => {
    message.success(t('ai.copyToClipboard'))
  })
}

const toggleCommandOutput = () => {
  if (commandOutputActiveKey.value.includes('1')) {
    commandOutputActiveKey.value = []
  } else {
    commandOutputActiveKey.value = ['1']
  }
}

// Expose method to parent component
const setThinkingLoading = (loading: boolean) => {
  thinkingLoading.value = loading
  if (!loading) {
    isCancelled.value = true
  }
}

// Expose method to parent component
defineExpose({
  setThinkingLoading
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
  background-color: var(--command-output-bg);
  min-height: 30px;
  height: auto;
}

.thinking-measurement {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  height: auto;
  left: -9999px;
  top: -9999px;
  width: calc(100% - 10px);
  overflow: visible;
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
  background-color: var(--bg-color-secondary);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
}

.markdown-content p {
  margin: 8px 0;
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
  background-color: var(--bg-color-secondary) !important;
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
  min-height: 30px;
  position: relative;
  padding: 2px 0 4px 0;
}

.monaco-container.collapsed .copy-button {
  top: -30px;
  right: 30px;
}

.copy-button {
  color: var(--text-color);
  opacity: 0.6;
  transition: all 0.3s;
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
  filter: var(--icon-filter, invert(0.25));
  transition: filter 0.2s ease;
}

.copy-icon {
  width: 11px;
  height: 11px;
  vertical-align: middle;
  filter: invert(0.25);
}

.markdown-content pre {
  background-color: var(--bg-color-secondary);
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

.markdown-content del,
.markdown-content s,
.command-output del,
.command-output s {
  color: #999;
  text-decoration-color: #ff6b6b;
  text-decoration-thickness: 2px;
  opacity: 0.7;
}

.command-output-container {
  margin: 4px 0;
  border-radius: 6px;
  overflow: hidden;
  background-color: var(--command-output-bg);
  min-height: 30px;
  height: auto;
}

.command-output-header {
  position: relative;
  height: 18px;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--bg-color-quaternary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  font-size: 10px;
  color: #7e8ba3;
}

.terminal-output-container {
  margin: 10px 0;
  border-radius: 6px;
  overflow-x: auto;
  overflow-y: visible;
  background-color: var(--command-output-bg);
  min-height: 40px;
  height: auto;
  width: 100%;
  max-width: 100%;
}

.terminal-output-header {
  position: relative;
  height: 18px;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--bg-color-quaternary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  font-size: 10px;
  color: #7e8ba3;
  border-radius: 6px 6px 0 0;
}

.output-title-section {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  flex: 1;
}

.output-title {
  font-weight: 500;
  color: #7e8ba3;
}

.output-title .output-icon {
  margin-right: 6px;
  font-size: 12px;
  vertical-align: -1px;
}

.output-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.output-lines {
  font-size: 10px;
  color: #7e8ba3;
}

.copy-button-header {
  color: var(--text-color);
  opacity: 0.6;
  transition: opacity 0.3s;
  padding: 0;
  height: 16px;
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.copy-button-header:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}

.toggle-button {
  color: var(--text-color);
  opacity: 0.6;
  transition: opacity 0.3s;
  padding: 0;
  height: 16px;
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
}

.toggle-button:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}

.command-output {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background-color: var(--bg-color-secondary);
  color: var(--text-color);
  padding: 12px;
  border-radius: 0 0 8px 8px;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  border-top: none;
  overflow: hidden;
  overflow-x: auto;
  position: relative;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* Constrain search_result block height and enable vertical scrolling */
.search-result .command-output {
  max-height: 220px;
  overflow-y: auto;
  font-size: 11px;
}

.search-result .command-output-header {
  cursor: pointer;
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
  background-color: var(--bg-color-secondary);
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
  color: #4a9ba8;
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
  color: #6bb6c7;
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

.code-content-body {
  padding: 12px;
  background: var(--command-output-bg);
  color: var(--text-color);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  border-top: none;
}

.code-content-body pre {
  margin: 0;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.code-content-body code {
  background: transparent;
  padding: 0;
  border: none;
  border-radius: 0;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.command-output::-webkit-scrollbar {
  height: 2px;
}

.command-output::-webkit-scrollbar-track {
  background: transparent;
}

/* Info message styling */
.info-message {
  background: linear-gradient(135deg, rgba(24, 144, 255, 0.1), rgba(24, 144, 255, 0.05));
  border-left: 3px solid #1890ff;
  border-radius: 6px;
  padding: 12px 16px;
  margin: 8px 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-color);
  position: relative;
  overflow: hidden;
}

.info-message::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(24, 144, 255, 0.3), transparent);
}

.info-message p {
  margin: 0;
  font-weight: 500;
}

.info-message p:first-child {
  margin-top: 0;
}

.info-message p:last-child {
  margin-bottom: 0;
}

/* Dark theme adjustments for info messages */
.theme-dark .info-message {
  background: linear-gradient(135deg, rgba(24, 144, 255, 0.15), rgba(24, 144, 255, 0.08));
  border-left-color: #40a9ff;
}

/* SSH Info message styling - Agent-like appearance */
.ssh-info-message {
  background-color: transparent;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
  padding: 4px 0;
  margin: 2px 0;
  border-radius: 0;
  border: none;
  font-style: italic;
  opacity: 0.8;
}

.ssh-info-message p {
  margin: 0;
  font-weight: 400;
}

.ssh-info-message p:first-child {
  margin-top: 0;
}

.ssh-info-message p:last-child {
  margin-bottom: 0;
}

/* Dark theme adjustments for SSH info messages */
.theme-dark .ssh-info-message {
  color: var(--text-color-tertiary);
}

.command-output::-webkit-scrollbar-thumb {
  background: var(--bg-color-quaternary);
  border-radius: 1px;
}
</style>
