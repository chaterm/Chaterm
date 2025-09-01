<template>
  <div
    ref="terminalContainer"
    class="terminal-container"
    :data-ssh-connect-id="connectionId"
  >
    <SearchComp
      v-if="showSearch"
      :search-addon="searchAddon"
      :terminal="terminal"
      @close-search="closeSearch"
    />
    <div
      ref="terminalElement"
      class="terminal"
      @contextmenu="handleRightClick"
      @mousedown="handleMouseDown"
    >
    </div>
    <a-button
      v-show="showAiButton"
      :id="`${connectionId}Button`"
      class="select-button"
      @mousedown.prevent
      @click="onChatToAiClick"
    >
      <span class="main-text">Chat to AI</span>
      <span class="shortcut-text">{{ shortcutKey }}</span>
    </a-button>
    <SuggComp
      v-bind="{ ref: (el) => setRef(el, connectionId) }"
      :unique-key="connectionId"
      :suggestions="suggestions"
      :active-suggestion="activeSuggestion"
      :selection-mode="suggestionSelectionMode"
    />
    <v-contextmenu ref="contextmenu">
      <Context
        :is-connect="isConnected"
        :is-sync-input="isSyncInput"
        :term-instance="terminal as any"
        :copy-text="copyText"
        :terminal-id="connectionId"
        @context-act="contextAct"
      />
    </v-contextmenu>
  </div>

  <!-- Per-terminal Command Dialog -->
  <CommandDialog
    v-model:visible="isCommandDialogVisible"
    :connection-id="currentConnectionId"
  />

  <div
    v-for="editor in openEditors"
    v-show="editor?.visible"
    :key="editor?.filePath"
  >
    <EditorCode
      :editor="editor"
      :is-active="editor.key === activeEditorKey"
      @close-vim-editor="closeVimEditor"
      @handle-save="handleSave"
      @focus-editor="() => handleFocusEditor(editor)"
    />
  </div>

  <!-- MFA弹窗已移至全局组件 -->
</template>

<script lang="ts" setup>
const copyText = ref('')
import SearchComp from '../Term/searchComp.vue'
import Context from '../Term/contextComp.vue'
import SuggComp from '../Term/suggestion.vue'
import eventBus from '@/utils/eventBus'
import { getActualTheme } from '@/utils/themeUtils'
import { useCurrentCwdStore } from '@/store/currentCwdStore'
import { markRaw, onBeforeUnmount, onMounted, PropType, nextTick, reactive, ref, watch, computed } from 'vue'
import { shortcutService } from '@/services/shortcutService'
import { useI18n } from 'vue-i18n'
import CommandDialog from '@/components/global/CommandDialog.vue'
// 引入全局MFA状态（已移除本地MFA实现）
// MFA功能现在由全局组件处理

import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { SearchAddon } from 'xterm-addon-search'
import { WebglAddon } from 'xterm-addon-webgl'
import { IDisposable } from 'xterm'
import 'xterm/css/xterm.css'
import { defineEmits } from 'vue'
import { editorData } from '@/views/components/Term/Editor/dragEditor.vue'
import { LanguageMap } from '@/views/components/Term/Editor/languageMap'
import EditorCode from '@/views/components/Term/Editor/dragEditor.vue'
import { message, Modal } from 'ant-design-vue'
import { aliasConfigStore } from '@/store/aliasConfigStore'
import { userConfigStore } from '../../../store/userConfigStore'
import { userConfigStore as serviceUserConfig } from '@/services/userConfigStoreService'
import { v4 as uuidv4 } from 'uuid'
import { Base64Util } from '@/utils/base64'
import { userInfoStore } from '@/store/index'
import stripAnsi from 'strip-ansi'
import { inputManager, commandBarHeight } from './termInputManager'
import { shellCommands } from './shellCmd'
import { createJumpServerStatusHandler, formatStatusMessage } from './jumpServerStatusHandler'
import { useDeviceStore } from '@/store/useDeviceStore'
import { checkUserDevice } from '@api/user/user'
// import { createContextFetcher, type ContextFetcher } from './autocomplete/contextFetcher'
const { t } = useI18n()
const selectFlag = ref(false)
const configStore = userConfigStore()
interface CommandSuggestion {
  command: string
  source: 'base' | 'history'
}
const suggestions = ref<CommandSuggestion[]>([])
const activeSuggestion = ref(-1)
const suggestionSelectionMode = ref(false) // Whether suggestion box is in selection mode
const props = defineProps({
  connectData: {
    type: Object as PropType<sshConnectData>,
    default: () => ({})
  },
  serverInfo: {
    type: Object,
    default: () => {
      return {}
    }
  },
  activeTabId: { type: String, required: true },
  currentConnectionId: { type: String, required: true }
})
const queryCommandFlag = ref(false)
export interface sshConnectData {
  uuid: string
  ip: string
  port: number
  username: string
  password: string
  privateKey: string
  authType: string
  passphrase: string
  asset_type?: string
}

const handleRightClick = (event) => {
  event.preventDefault()

  switch (config.rightMouseEvent) {
    case 'paste':
      if (startStr.value == '') {
        startStr.value = beginStr.value
      }
      pasteFlag.value = true
      navigator.clipboard
        .readText()
        .then((text) => {
          sendData(text)
          terminal.value?.focus()
        })
        .catch(() => {
          console.warn('无法读取剪贴板内容')
        })
      break
    case 'contextMenu':
      if (contextmenu.value && contextmenu.value.show) {
        contextmenu.value.show(event)
      }
      break
    default:
      break
  }
}

const handleMouseDown = (event) => {
  event.preventDefault()
  if (event.button === 1) {
    switch (config.middleMouseEvent) {
      case 'paste':
        if (startStr.value == '') {
          startStr.value = beginStr.value
        }
        pasteFlag.value = true
        navigator.clipboard
          .readText()
          .then((text) => {
            sendData(text)
            terminal.value?.focus()
          })
          .catch(() => {
            console.warn('无法读取剪贴板内容')
          })
        break
      case 'contextMenu':
        if (contextmenu.value && contextmenu.value.show) {
          contextmenu.value.show(event)
        }
        break
      case 'none':
        break
    }
  }
}
const componentRefs = ref({})
const setRef = (el, key) => {
  if (el) {
    componentRefs.value[key] = el
  }
}
const isConnected = ref(false)
const isSyncInput = ref(false)
const terminal = ref<Terminal | null>(null)
const fitAddon = ref<FitAddon | null>(null)
const connectionId = ref('')
const connectionHasSudo = ref(false)
const connectionSftpAvailable = ref(false)
const cleanupListeners = ref<Array<() => void>>([])
const terminalElement = ref<HTMLDivElement | null>(null)
const terminalContainer = ref<HTMLDivElement | null>(null)
const contextmenu = ref()
const cursorStartX = ref(0)
const api = window.api as any
const encoder = new TextEncoder()
let cusWrite: ((data: string, options?: { isUserCall?: boolean }) => void) | null = null
let resizeObserver: ResizeObserver | null = null
const showSearch = ref(false)
const searchAddon = ref<SearchAddon | null>(null)
const showAiButton = ref(false)
let jumpServerStatusHandler: ReturnType<typeof createJumpServerStatusHandler> | null = null
const isCommandDialogVisible = ref(false)
const wasDialogVisibleBeforeDeactivation = ref(false)

// let contextFetcher: ContextFetcher | null = null

// 计算快捷键显示文本
const shortcutKey = computed(() => {
  const shortcuts = shortcutService.getShortcuts()
  if (shortcuts && shortcuts['sendOrToggleAi']) {
    return shortcutService.formatShortcut(shortcuts['sendOrToggleAi'])
  }
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  return isMac ? '⌘L' : 'Ctrl+L'
})
const activeEditorKey = ref(null)
const handleFocusEditor = (editor) => {
  activeEditorKey.value = editor.key
}
const dataBuffer = ref<number[]>([])
const EDITOR_SEQUENCES = {
  enter: [
    { pattern: [0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x68], editor: 'vim' },
    { pattern: [0x1b, 0x5b, 0x3f, 0x34, 0x37, 0x68], editor: 'vim' },
    { pattern: [0x1b, 0x5b, 0x3f, 0x31, 0x68, 0x1b, 0x3d], editor: 'nano' }
  ],
  exit: [
    { pattern: [0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x6c], editor: 'vim' },
    { pattern: [0x1b, 0x5b, 0x3f, 0x34, 0x37, 0x6c], editor: 'vim' },
    { pattern: [0x1b, 0x5b, 0x3f, 0x31, 0x6c, 0x1b, 0x3e], editor: 'nano' }
  ]
}
const userInputFlag = ref(false)
const currentCwdStore = useCurrentCwdStore()
let termOndata: IDisposable | null = null
let handleInput
let textareaCompositionListener: ((e: CompositionEvent) => void) | null = null
let textareaPasteListener: (() => void) | null = null
const pasteFlag = ref(false)
let dbConfigStash: {
  aliasStatus?: number
  autoCompleteStatus?: number
  scrollBack?: number
  highlightStatus?: number
  [key: string]: any
} = {}
let config

const deviceStore = useDeviceStore()
const isOfficeDevice = ref(false)
const isLocalConnect = ref(false)

const getUserInfo = async () => {
  try {
    const res = (await checkUserDevice({ ip: deviceStore.getDeviceIp, macAddress: deviceStore.getMacAddress })) as any
    if (res && res.code === 200) {
      isOfficeDevice.value = res.data.isOfficeDevice
    }
  } catch (error) {
    console.error('获取用户信息失败:', error)
  }
}

onMounted(async () => {
  await getUserInfo()
  config = await serviceUserConfig.getConfig()
  dbConfigStash = config
  queryCommandFlag.value = config.autoCompleteStatus == 1
  const actualTheme = getActualTheme(config.theme)
  const termInstance = markRaw(
    new Terminal({
      scrollback: config.scrollBack,
      cursorBlink: true,
      cursorStyle: config.cursorStyle,
      fontSize: config.fontSize || 12,
      fontFamily: config.fontFamily || 'Menlo, Monaco, "Courier New", Consolas, Courier, monospace',
      theme:
        actualTheme === 'light'
          ? {
              background: '#ffffff',
              foreground: '#000000',
              cursor: '#000000',
              cursorAccent: '#000000',
              selectionBackground: 'rgba(0, 0, 0, 0.3)'
            }
          : {
              background: '#141414',
              foreground: '#f0f0f0',
              cursor: '#f0f0f0',
              cursorAccent: '#f0f0f0',
              selectionBackground: 'rgba(255, 255, 255, 0.3)'
            }
    })
  )
  terminal.value = termInstance
  termInstance?.onKey(handleKeyInput)
  termInstance?.onSelectionChange(() => {
    if (termInstance.hasSelection()) {
      copyText.value = termInstance.getSelection()
      if (copyText.value.trim()) {
        navigator.clipboard.writeText(copyText.value.trim()).catch(() => {
          console.warn('Failed to copy to clipboard')
        })
      }
    }
    updateSelectionButtonPosition()
  })
  nextTick(() => {
    const viewport = terminalElement.value?.querySelector('.xterm-viewport')
    if (viewport) {
      viewport.addEventListener('scroll', () => updateSelectionButtonPosition())
    }
  })

  fitAddon.value = new FitAddon()
  termInstance.loadAddon(fitAddon.value)
  if (terminalElement.value) {
    termInstance.open(terminalElement!.value)
  }
  fitAddon?.value.fit()
  searchAddon.value = new SearchAddon()
  termInstance.loadAddon(searchAddon.value)
  termInstance.scrollToBottom()
  termInstance.focus()
  const webgl = new WebglAddon()
  termInstance.loadAddon(webgl)
  termInstance.onResize((size) => {
    resizeSSH(size.cols, size.rows)
  })
  const textarea = termInstance?.element?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
  if (textarea) {
    textareaCompositionListener = (e) => {
      handleKeyInput({
        domEvent: {
          keyCode: encoder.encode(e.data),
          code: e.data,
          altKey: false,
          metaKey: false,
          ctrlKey: false,
          ...e
        },
        key: e.data
      })
    }
    textareaPasteListener = () => {
      pasteFlag.value = true
    }
    textarea.addEventListener('compositionend', textareaCompositionListener)
    textarea.addEventListener('paste', textareaPasteListener)
  }
  const core = (termInstance as any)._core
  const renderService = core._renderService
  const originalWrite = termInstance.write.bind(termInstance)
  const debouncedUpdateTerminalState = (data, currentIsUserCall) => {
    if (updateTimeout) {
      clearTimeout(updateTimeout)
    }
    if (currentIsUserCall || terminalMode.value === 'none') {
      updateTerminalState(JSON.stringify(data).endsWith(startStr.value), enterPress.value, tagPress.value)
    }
    let highLightFlag: boolean = true
    if (enterPress.value || specialCode.value) {
      highLightFlag = false
    }
    if (terminalMode.value !== 'none') {
      highLightFlag = false
    }
    if (currentIsUserCall) {
      highLightFlag = false
    }
    if (pasteFlag.value) {
      highLightFlag = true
    }
    if (highLightFlag) {
      if (config.highlightStatus == 1) {
        highlightSyntax(terminalState.value)
        pasteFlag.value = false
      }
      if (!selectFlag.value) {
        queryCommand()
      }
    }
    updateTimeout = null
  }

  cusWrite = function (data: string, options?: { isUserCall?: boolean }): void {
    const currentIsUserCall = options?.isUserCall ?? false
    userInputFlag.value = currentIsUserCall
    const originalRequestRefresh = renderService.refreshRows.bind(renderService)
    const originalTriggerRedraw = renderService._renderDebouncer.refresh.bind(renderService._renderDebouncer)
    renderService.refreshRows = () => {}
    renderService._renderDebouncer.refresh = () => {}

    originalWrite(data, () => {
      if (!currentIsUserCall) {
        debouncedUpdateTerminalState(data, currentIsUserCall)
      }
      // Ensure scroll to bottom after write completion
      if (!currentIsUserCall) {
        nextTick(() => {
          terminal.value?.scrollToBottom()
        })
      }
    })

    renderService.refreshRows = originalRequestRefresh
    renderService._renderDebouncer.refresh = originalTriggerRedraw
    renderService.refreshRows(0, core._bufferService.rows - 1)
  }
  termInstance.write = cusWrite as any
  if (terminalContainer.value) {
    resizeObserver = new ResizeObserver(
      debounce(
        () => {
          handleResize()
        },
        30,
        true
      )
    )
    resizeObserver.observe(terminalContainer.value)
  }
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleGlobalKeyDown)
  window.addEventListener('click', () => {
    if (contextmenu.value && typeof contextmenu.value.hide === 'function') {
      contextmenu.value.hide()
    }
  })

  nextTick(() => {
    setTimeout(() => {
      handleResize()
      inputManager.registerInstances(
        {
          termOndata: handleExternalInput,
          syncInput: false
        },
        connectionId.value
      )
    }, 100)
    terminalContainerResize()
  })

  if (props.connectData.asset_type === 'shell') {
    // TODO 本地连接后续兼容
    config.highlightStatus = 2
    config.autoCompleteStatus = 2
    isLocalConnect.value = true
    await connectLocalSSH()
  } else {
    await connectSSH()
  }

  const handleExecuteCommand = (command) => {
    if (props.activeTabId !== props.currentConnectionId) return
    sendMarkedData(command, 'Chaterm:command')
    termInstance.focus()
  }

  const handleSendOrToggleAi = () => {
    if (props.activeTabId !== props.currentConnectionId) {
      console.log('Not active tab, ignoring event')
      return
    }

    const activeElement = document.activeElement
    const terminalContainer = terminalElement.value?.closest('.terminal-container')
    const isTerminalFocused =
      activeElement === terminal.value?.textarea ||
      terminalContainer?.contains(activeElement) ||
      activeElement?.classList.contains('xterm-helper-textarea')

    if (termInstance && termInstance.hasSelection() && isTerminalFocused) {
      const selectedText = termInstance.getSelection().trim()
      if (selectedText) {
        eventBus.emit('openAiRight')
        nextTick(() => {
          const formattedText = `Terminal output:\n\`\`\`\n${selectedText}\n\`\`\``
          eventBus.emit('chatToAi', formattedText)
        })
        return
      }
    }
    eventBus.emit('toggleSideBar', 'right')
  }

  const handleSendOrToggleAiForTab = (targetTabId: string) => {
    if (targetTabId !== props.currentConnectionId) {
      return
    }

    handleSendOrToggleAi()
  }

  const handleRequestUpdateCwdForHost = (hostIp: string) => {
    if (props.connectData.ip !== hostIp) return

    sendMarkedData('pwd\r', 'Chaterm:pwd')
  }
  const handleUpdateTheme = (theme) => {
    if (terminal.value) {
      const actualTheme = getActualTheme(theme)
      terminal.value.options.theme =
        actualTheme === 'light'
          ? {
              background: '#ffffff',
              foreground: '#000000',
              cursor: '#000000',
              cursorAccent: '#000000',
              selectionBackground: 'rgba(0, 0, 0, 0.3)'
            }
          : {
              background: '#141414',
              foreground: '#f0f0f0',
              cursor: '#f0f0f0',
              cursorAccent: '#f0f0f0',
              selectionBackground: 'rgba(255, 255, 255, 0.3)'
            }
    }
  }
  const handleGetCursorPosition = (callback: (position: any) => void) => {
    if (props.activeTabId !== props.currentConnectionId) return

    const position = getCursorLinePosition()
    callback(position)
  }

  eventBus.on('executeTerminalCommand', handleExecuteCommand)
  eventBus.on('autoExecuteCode', autoExecuteCode)
  eventBus.on('getCursorPosition', handleGetCursorPosition)
  eventBus.on('sendOrToggleAiFromTerminalForTab', handleSendOrToggleAiForTab)
  eventBus.on('requestUpdateCwdForHost', handleRequestUpdateCwdForHost)
  eventBus.on('updateTheme', handleUpdateTheme)
  eventBus.on('openSearch', openSearch)

  eventBus.on('clearCurrentTerminal', () => {
    contextAct('clearTerm')
  })

  // Listen for font size change events
  eventBus.on('fontSizeIncrease', () => {
    contextAct('fontsizeLargen')
  })

  eventBus.on('fontSizeDecrease', () => {
    contextAct('fontsizeSmaller')
  })

  // Listen for font update events
  const handleUpdateFont = (newFontFamily) => {
    if (terminal.value) {
      terminal.value.options.fontFamily = newFontFamily
    }
  }
  eventBus.on('updateTerminalFont', handleUpdateFont)
  cleanupListeners.value.push(() => {
    eventBus.off('updateTheme', handleUpdateTheme)
    eventBus.off('executeTerminalCommand', handleExecuteCommand)
    eventBus.off('autoExecuteCode', autoExecuteCode)
    eventBus.off('getCursorPosition', handleGetCursorPosition)
    eventBus.off('sendOrToggleAiFromTerminalForTab', handleSendOrToggleAiForTab)
    eventBus.off('requestUpdateCwdForHost', handleRequestUpdateCwdForHost)
    eventBus.off('updateTerminalFont', handleUpdateFont)
    eventBus.off('openSearch', openSearch)
    eventBus.off('clearCurrentTerminal')
    eventBus.off('fontSizeIncrease')
    eventBus.off('fontSizeDecrease')
    window.removeEventListener('keydown', handleGlobalKeyDown)
  })

  if (terminal.value?.textarea) {
    terminal.value.textarea.addEventListener('focus', () => {
      inputManager.setActiveTerm(connectionId.value)
    })
    terminal.value.textarea.addEventListener('blur', hideSelectionButton)
    cleanupListeners.value.push(() => {
      if (terminal.value?.textarea) {
        terminal.value.textarea.removeEventListener('focus', () => {
          inputManager.setActiveTerm(connectionId.value)
        })
        terminal.value.textarea.removeEventListener('blur', hideSelectionButton)
      }
    })
  }
})
const getCmdList = async (systemCommands) => {
  const allCommands = [...systemCommands, ...shellCommands]
  commands.value = [...new Set(allCommands)].sort()
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  inputManager.unregisterInstances(connectionId.value)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  cleanupListeners.value.forEach((cleanup) => cleanup())
  cleanupListeners.value = []

  if (terminal.value) {
    const textarea = terminal.value.element?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
    if (textarea) {
      if (textareaCompositionListener) {
        textarea.removeEventListener('compositionend', textareaCompositionListener)
        textareaCompositionListener = null
      }
      if (textareaPasteListener) {
        textarea.removeEventListener('paste', textareaPasteListener)
        textareaPasteListener = null
      }
    }
  }

  if (isConnected.value) {
    disconnectSSH()
  }

  const viewport = terminalElement.value?.querySelector('.xterm-viewport')
  if (viewport) {
    viewport.removeEventListener('scroll', () => updateSelectionButtonPosition())
  }
})
const getFileExt = (fileName: string): string => {
  const match = fileName.match(/\.[^.\/\\]+$/)
  return match ? match[0] : ''
}

const isOnlyAnsiCodes = (str: string): boolean => {
  const cleaned = stripAnsi(str)
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
  return cleaned.length === 0
}

const cleanForFileName = (str: string): string => {
  return stripAnsi(str)
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const normalizeControl = (str: string): string => {
  str = str.replace(/\x08\x1B\[K/g, '')
  const chars: string[] = []
  for (const ch of str) {
    if (ch === '\b') {
      chars.pop()
    } else {
      chars.push(ch)
    }
  }
  return chars.join('')
}

const parseVimLine = (raw: string) => {
  const originalLines = raw.split(/\r?\n/)
  const cleaned = normalizeControl(raw)
    .replace(/\x1B\][0-9]*;[^\x07]*\x07/g, '')
    .replace(/\x1BP.*?\x1B\\/g, '')
    .replace(/\x1B\[\?[0-9;]*[hl]/g, '')
    .replace(/\x1B\[[0-9;]*[ABCDEFGJKST]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()

  const lines = cleaned.split(/\r?\n/)
  let filePath = ''
  if (lines.length > 1) {
    filePath = stripAnsi(lines[1])
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim()
  }

  const ext = getFileExt(filePath)
  const contentType = LanguageMap[ext] || 'python'

  let lastLine = ''
  for (let i = originalLines.length - 1; i >= 0; i--) {
    const line = originalLines[i].trim()
    if (line && !isOnlyAnsiCodes(line)) {
      lastLine = '\r\n' + originalLines[i]
      break
    }
  }

  if (filePath.includes('No such file or directory')) {
    filePath = cleanForFileName(filePath.replace('No such file or directory', ''))
  }

  return {
    lastLine,
    filePath,
    contentType
  }
}

const openEditors = reactive<editorData[]>([])
const closeVimEditor = (data) => {
  const { key } = data
  const editor = openEditors.find((editor) => editor?.key === key)
  if (editor?.fileChange) {
    if (!editor?.saved) {
      Modal.confirm({
        title: t('common.saveConfirmTitle'),
        content: t('common.saveConfirmContent', { filePath: editor?.filePath }),
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        onOk() {
          handleSave({ key: editor?.key, needClose: true })
        },
        onCancel() {
          const index = openEditors.indexOf(editor)
          if (index !== -1) {
            openEditors.splice(index, 1)
          }
        }
      })
    }
  } else {
    const index = editor ? openEditors.indexOf(editor) : -1
    if (index !== -1) {
      openEditors.splice(index, 1)
    }
  }
}

const handleSave = async (data) => {
  const { key, needClose } = data
  let errMsg = ''
  const editor = openEditors.find((editor) => editor?.key === key)
  if (editor?.fileChange) {
    const newContent = editor.vimText.replace(/\r\n/g, '\n')
    let cmd = `cat <<'EOFChaterm:save' > ${editor.filePath}\n${newContent}\nEOFChaterm:save\n`
    if (connectionHasSudo.value) {
      cmd = `cat <<'EOFChaterm:save' | sudo tee  ${editor.filePath} > /dev/null \n${newContent}\nEOFChaterm:save\n`
    }
    const { stderr } = await api.sshConnExec({
      cmd: cmd,
      id: connectionId.value
    })
    errMsg = stderr
  }
  if (errMsg !== '') {
    message.error(`${t('common.saveFailed')}: ${errMsg}`)
  } else {
    message.success(t('common.saveSuccess'))
    if (editor) {
      if (needClose) {
        const index = openEditors.indexOf(editor)
        if (index !== -1) {
          openEditors.splice(index, 1)
        }
      } else {
        editor.loading = false
        editor.saved = true
        editor.fileChange = false
      }
    }
  }
}

const createEditor = async (filePath, contentType) => {
  const { stdout, stderr } = await api.sshConnExec({
    cmd: `cat ${filePath}`,
    id: connectionId.value
  })
  let action = 'editor'
  if (stderr.indexOf('No such file or directory') !== -1) {
    action = 'create'
  }
  if (stderr.indexOf('Permission denied') !== -1) {
    message.error('Permission denied')
  } else {
    const existingEditor = openEditors.find((editor) => editor.filePath === filePath)
    if (!existingEditor) {
      openEditors.push({
        filePath: filePath,
        visible: true,
        vimText: stdout,
        originVimText: stdout,
        action: action,
        vimEditorX: Math.round(window.innerWidth * 0.5) - Math.round(window.innerWidth * 0.7 * 0.5),
        vimEditorY: Math.round(window.innerHeight * 0.5) - Math.round(window.innerHeight * 0.7 * 0.5),
        contentType: contentType,
        vimEditorHeight: Math.round(window.innerHeight * 0.7),
        vimEditorWidth: Math.round(window.innerWidth * 0.7),
        loading: false,
        fileChange: false,
        saved: false,
        key: connectionId.value + '-' + filePath,
        terminalId: connectionId.value
      } as editorData)
    } else {
      existingEditor.visible = true
      existingEditor.vimText = stdout
    }
  }
}

const debounce = (func, wait, immediate = false) => {
  let timeout
  let isFirstCall = true
  let isDragging = false
  let lastCallTime = 0

  return function executedFunction(...args) {
    const now = Date.now()
    const timeSinceLastCall = now - lastCallTime
    lastCallTime = now
    isDragging = timeSinceLastCall < 50
    const later = () => {
      clearTimeout(timeout)
      timeout = null
      if (!immediate) func(...args)
      isDragging = false
    }
    const callNow = immediate && !timeout
    clearTimeout(timeout)
    let dynamicWait
    if (isDragging) {
      dynamicWait = 5
    } else if (isFirstCall) {
      dynamicWait = 0
    } else {
      dynamicWait = wait
    }

    timeout = setTimeout(later, dynamicWait)

    if (callNow) {
      func(...args)
      isFirstCall = false
    }
  }
}
const autoExecuteCode = (command) => {
  if (props.activeTabId !== props.currentConnectionId) return
  sendData(command)
}
const handleResize = debounce(() => {
  if (fitAddon.value && terminal.value && terminalElement.value) {
    try {
      const rect = terminalElement.value.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        fitAddon.value.fit()
        const { cols, rows } = terminal.value
        if (isLocalConnect.value) {
          resizeLocalSSH(cols, rows)
        } else {
          resizeSSH(cols, rows)
        }
      }
    } catch (error) {
      console.error('Failed to resize terminal:', error)
    }
  }
}, 100)

const emit = defineEmits(['connectSSH', 'disconnectSSH', 'closeTabInTerm', 'createNewTerm'])

const connectSSH = async () => {
  if (termOndata) {
    termOndata.dispose()
    termOndata = null
  }

  if (terminal.value) {
    const textarea = terminal.value.element?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
    if (textarea) {
      if (textareaCompositionListener) {
        textarea.removeEventListener('compositionend', textareaCompositionListener)
        textareaCompositionListener = null
      }
      if (textareaPasteListener) {
        textarea.removeEventListener('paste', textareaPasteListener)
        textareaPasteListener = null
      }
    }
  }

  try {
    const assetInfo = await api.connectAssetInfo({ uuid: props.connectData.uuid })
    const password = ref('')
    const privateKey = ref('')
    const passphrase = ref('')
    if (assetInfo) {
      password.value = assetInfo.auth_type === 'password' ? assetInfo.password : ''
      privateKey.value = assetInfo.auth_type === 'keyBased' ? assetInfo.privateKey : ''
      passphrase.value = assetInfo.auth_type === 'keyBased' ? assetInfo.passphrase : ''
    } else {
      password.value = props.connectData.authType === 'password' ? props.connectData.password : ''
      privateKey.value = props.connectData.authType === 'privateKey' ? props.connectData.privateKey : ''
      passphrase.value = props.connectData.passphrase || ''
    }

    const email = userInfoStore().userInfo.email

    const orgType = props.serverInfo.organizationId === 'personal' ? 'local' : 'local-team'
    const hostnameBase64 =
      props.serverInfo.organizationId === 'personal' ? Base64Util.encode(assetInfo.asset_ip) : Base64Util.encode(assetInfo.hostname)
    connectionId.value = `${assetInfo.username}@${props.connectData.ip}:${orgType}:${hostnameBase64}:${uuidv4()}`

    if (assetInfo.sshType === 'jumpserver' && terminal.value) {
      jumpServerStatusHandler = createJumpServerStatusHandler(terminal.value, connectionId.value)
      jumpServerStatusHandler.setupStatusListener(api)
    }

    const result = await api.connect({
      id: connectionId.value,
      host: assetInfo.asset_ip,
      port: assetInfo.port,
      username: assetInfo.username,
      password: assetInfo.password,
      privateKey: privateKey.value,
      passphrase: passphrase.value,
      targetIp: assetInfo.host,
      sshType: assetInfo.sshType,
      terminalType: config.terminalType,
      agentForward: config.sshAgentsStatus === 1,
      isOfficeDevice: isOfficeDevice.value
    })

    if (jumpServerStatusHandler) {
      jumpServerStatusHandler.cleanup()
      jumpServerStatusHandler = null
    }

    api
      .connectReadyData(connectionId.value)
      .then((connectReadyData) => {
        connectionHasSudo.value = connectReadyData?.hasSudo
        getCmdList(connectReadyData?.commandList)
      })
      .catch(() => {
        connectionHasSudo.value = false
        getCmdList([])
      })

    if (result.status === 'connected') {
      const welcomeName = email.split('@')[0]
      const welcome = '\x1b[38;2;22;119;255m' + t('ssh.welcomeMessage', { username: welcomeName }) + ' \x1b[m\r\n'
      terminal.value?.writeln('') // 添加空行分隔
      terminal.value?.writeln(welcome)
      terminal.value?.writeln(t('ssh.connectingTo', { ip: props.connectData.ip }))
      await startShell()
      setupTerminalInput()
      handleResize()
      setTimeout(() => {
        handleResize()
        // Ensure scroll to bottom after successful connection
        terminal.value?.scrollToBottom()
        terminal.value?.focus()
      }, 200)
    } else {
      const errorMsg = formatStatusMessage(t('ssh.connectionFailed', { message: result.message }), 'error')
      terminal.value?.writeln(errorMsg)
    }
  } catch (error: any) {
    if (jumpServerStatusHandler) {
      jumpServerStatusHandler.cleanup()
      jumpServerStatusHandler = null
    }

    const errorMsg = formatStatusMessage(t('ssh.connectionError', { message: error.message || t('ssh.unknownError') }), 'error')
    terminal.value?.writeln(errorMsg)
  }
  emit('connectSSH', { isConnected: isConnected })
}

const startShell = async () => {
  try {
    const result = await api.shell({ id: connectionId.value, terminalType: config.terminalType })
    if (result.status === 'success') {
      isConnected.value = true
      const removeDataListener = api.onShellData(connectionId.value, (response: MarkedResponse) => {
        checkEditorMode(response)
        handleServerOutput(response)
      })
      const removeErrorListener = api.onShellError(connectionId.value, (data) => {
        cusWrite?.(data)
      })
      const removeCloseListener = api.onShellClose(connectionId.value, () => {
        isConnected.value = false
        cusWrite?.('\r\n' + t('ssh.connectionClosed') + '\r\n\r\n')
        cusWrite?.(t('ssh.disconnectedFromHost', { host: props.serverInfo.title, date: new Date().toDateString() }) + '\r\n')
        cusWrite?.('\r\n' + t('ssh.pressEnterToReconnect') + '\r\n', { isUserCall: true })
      })

      cleanupListeners.value.push(removeDataListener, removeErrorListener, removeCloseListener)

      // contextFetcher = createContextFetcher({
      //   connectionId: connectionId.value,
      //   api: api,
      //   enableOutput: false,
      //   outputCallback: (message) => {
      //     console.log('[ContextFetcher] Context information:', message)
      //   }
      // })
    } else {
      terminal.value?.writeln(
        JSON.stringify({
          cmd: t('ssh.shellStartFailed', { message: result.message }),
          isUserCall: true
        })
      )
    }
  } catch (error: any) {
    terminal.value?.writeln(
      JSON.stringify({
        cmd: t('ssh.shellError', { message: error.message || t('ssh.unknownError') }),
        isUserCall: true
      })
    )
  }
  emit('connectSSH', { isConnected: isConnected })
}

const resizeSSH = async (cols, rows) => {
  try {
    const result = await api.resizeShell(connectionId.value, cols, rows)
    if (result.status === 'error') {
      console.error('Resize failed:', result.message)
    } else {
      // console.log('terminal resized:', result.message)
    }
  } catch (error) {
    console.error('Failed to resize terminal:', error)
  }
}

const connectLocalSSH = async () => {
  if (termOndata) {
    termOndata.dispose()
    termOndata = null
  }

  if (terminal.value) {
    const textarea = terminal.value.element?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
    if (textarea) {
      if (textareaCompositionListener) {
        textarea.removeEventListener('compositionend', textareaCompositionListener)
        textareaCompositionListener = null
      }
      if (textareaPasteListener) {
        textarea.removeEventListener('paste', textareaPasteListener)
        textareaPasteListener = null
      }
    }
  }

  connectionId.value = `localhost@127.0.0.1:local:${Base64Util.encode(props.serverInfo.data.key)}:${uuidv4()}`

  try {
    const email = userInfoStore().userInfo.email

    const localConfig = {
      id: connectionId.value,
      shell: props.serverInfo.data.uuid,
      termType: config.terminalType
    }

    const result = await api.connectLocal(localConfig)
    if (result.success) {
      const welcomeName = email.split('@')[0]
      const welcome = '\x1b[38;2;22;119;255m' + t('ssh.welcomeMessage', { username: welcomeName }) + ' \x1b[m\r\n'
      terminal.value?.writeln('') // 添加空行分隔
      terminal.value?.writeln(welcome)

      await startLocalShell()

      // 处理输入
      terminal.value?.onData((data) => {
        api.sendDataLocal(connectionId.value, data)
      })

      handleResize()
      setTimeout(() => {
        handleResize()
      }, 200)
    } else {
      const errorMsg = formatStatusMessage(`连接失败: ${result.message}`, 'error')
      terminal.value?.writeln(errorMsg)
    }
  } catch (error: any) {
    const errorMsg = formatStatusMessage(`连接错误: ${error.message || '未知错误'}`, 'error')
    terminal.value?.writeln(errorMsg)
  }
  emit('connectSSH', { isConnected: isConnected })
}

const startLocalShell = async () => {
  isConnected.value = true
  const removeDataListener = api.onDataLocal(connectionId.value, (data: string) => {
    if (terminal.value) {
      terminal.value.write(data)
    }
  })
  const removeErrorListener = api.onErrorLocal?.(connectionId.value, (error: any) => {
    if (terminal.value) {
      terminal.value.write(`\r\n[错误]: ${error.message || error}\r\n`)
    }
  })

  const removeCloseListener = api.onExitLocal(connectionId.value, (exitCode: any) => {
    isConnected.value = false
    if (terminal.value) {
      terminal.value.write('\r\nConnection closed.\r\n\r\n')
      terminal.value.write(`Disconnected from local shell at ${new Date().toDateString()}\r\n`)
      terminal.value.write(`Exit code: ${exitCode?.code || 'unknown'}\r\n`)
    }
  })

  if (removeErrorListener) {
    cleanupListeners.value.push(removeDataListener, removeErrorListener, removeCloseListener)
  } else {
    cleanupListeners.value.push(removeDataListener, removeCloseListener)
  }
}

const resizeLocalSSH = async (cols, rows) => {
  try {
    const result = await api.resizeLocal(connectionId.value, cols, rows)
    if (result.status === 'error') {
      console.error('Resize failed:', result.message)
    } else {
    }
  } catch (error) {
    console.error('Failed to resize terminal:', error)
  }
}
const terminalState = ref({
  content: '',
  cursorPosition: {
    row: 0,
    col: 0
  },
  beforeCursor: '',
  contentCrossRowStatus: false,
  contentCrossRowLines: 0,
  contentCrossStartLine: 0,
  contentCurrentCursorCrossRowLines: 0
})

const substrWidth = (str: string, startWidth: number, endWidth?: number): string => {
  let currentWidth = 0
  let startIndex = 0
  let endIndex = str.length
  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i) || 0
    const charWidth =
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0x20000 && code <= 0x2fa1f)
        ? 2
        : 1

    if (currentWidth < startWidth) {
      currentWidth += charWidth
      if (currentWidth > startWidth) {
        startIndex = i + 1
        break
      } else if (currentWidth === startWidth) {
        startIndex = i + 1
        break
      }
    } else {
      startIndex = i
      break
    }
    if (code > 0xffff) {
      i++
    }
  }
  if (endWidth === undefined) {
    return str.substring(startIndex)
  }

  currentWidth = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i) || 0
    const charWidth =
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0x20000 && code <= 0x2fa1f)
        ? 2
        : 1

    currentWidth += charWidth

    if (currentWidth > endWidth) {
      endIndex = i
      break
    }
    if (code > 0xffff) {
      i++
    }
  }

  return str.substring(startIndex, endIndex)
}

const cursorLastY = ref(0)
const cursorLastX = ref(0)
const cursorEndY = ref(0)
const cursorMaxY = ref(0)
const cursorMaxX = ref(0)
let updateTimeout: NodeJS.Timeout | null = null
const getLogicalInputStartLine = () => {
  const bufferService = (terminal as any).value._core._bufferService
  const buffer = bufferService.buffer
  let y = terminal.value?.buffer.active.baseY + buffer.y
  while (y > 0 && buffer.lines.get(y)?.isWrapped) {
    y--
  }
  return y
}
const getWrappedContentLastLineY = () => {
  const bufferService = (terminal as any).value._core._bufferService
  const buffer = bufferService.buffer
  let lastY = terminal.value?.buffer.active.baseY + buffer.y
  const maxLineIndex = buffer.lines.length - 1
  while (lastY < maxLineIndex) {
    const nextLine = buffer.lines.get(lastY + 1)
    if (!nextLine || !nextLine.isWrapped) {
      break
    }
    lastY++
  }
  return lastY
}

const updateTerminalState = (quickInit: boolean, enterPress, tagPress: boolean) => {
  if (!terminal.value) return

  try {
    const terminalCore = (terminal as any).value._core
    const buffer = terminalCore._bufferService.buffer
    const { x: cursorX, y: cursorY } = buffer
    const { cols: maxCols, rows: maxRows } = terminalCore
    const maxX = maxCols - 1
    const maxY = maxRows - 1
    let contentCursorX = cursorX
    let parseStrTag = true
    const isResizeTriggered = shouldSkipParseOnResize(maxX, maxY)
    if (isResizeTriggered) {
      parseStrTag = false
    }
    const currentCursorEndY = getWrappedContentLastLineY() - terminal.value?.buffer.active.baseY
    const refreshCrossRow = shouldRefreshCrossRow(currentCursorEndY, cursorX)
    cursorEndY.value = currentCursorEndY
    const currentLine = buffer.lines.get(terminal.value?.buffer.active.baseY + cursorY)
    let isCrossRow = determineCrossRowStatus(currentLine, cursorY, currentCursorEndY)
    if (!tagPress) {
      updateCursorStartPosition(cursorX, quickInit)
    }
    if (enterPress) {
      isCrossRow = false
    }
    const { lineContent, finalContentCursorX } = processLineContent(
      currentLine,
      isCrossRow,
      refreshCrossRow,
      parseStrTag,
      cursorX,
      cursorY,
      buffer,
      contentCursorX
    )
    updateCursorHistory(cursorX, cursorY, maxX, maxY)
    if (parseStrTag) {
      if (!tagPress) {
        updateContentStrings(lineContent, cursorX)
      }
      updateTerminalContent(lineContent, finalContentCursorX)
    }
    updateTerminalStateObject(cursorX, cursorY, isCrossRow)
    sendTerminalStateToServer()

    // Ensure terminal scrolls to bottom, keeping cursor in visible area
    if (!userInputFlag.value) {
      nextTick(() => {
        terminal.value?.scrollToBottom()
      })
    }
  } catch (error) {
    console.error('更新终端状态时出错:', error)
  }
}

const shouldSkipParseOnResize = (maxX: number, maxY: number): boolean => {
  return cursorMaxX.value !== 0 && cursorMaxY.value !== 0 && (cursorMaxX.value !== maxX || cursorMaxY.value !== maxY)
}

const shouldRefreshCrossRow = (currentCursorEndY: number, cursorX: number): boolean => {
  return currentCursorEndY < cursorEndY.value && currentCursorEndY !== 0 && cursorLastX.value === cursorX
}

const determineCrossRowStatus = (currentLine: any, cursorY: number, currentCursorEndY: number): boolean => {
  if (currentLine.isWrapped) return true
  if (!currentLine.isWrapped && cursorY !== currentCursorEndY) return true
  if (terminalState.value.contentCrossRowStatus && cursorY === currentCursorEndY) return true
  return false
}

const updateCursorStartPosition = (cursorX: number, quickInit: boolean): void => {
  if (cursorStartX.value === 0 || quickInit) {
    cursorStartX.value = cursorX
  } else {
    cursorStartX.value = Math.min(cursorStartX.value, cursorX)
  }
}

const processLineContent = (
  currentLine: any,
  isCrossRow: boolean,
  refreshCrossRow: boolean,
  parseStrTag: boolean,
  cursorX: number,
  cursorY: number,
  buffer: any,
  contentCursorX: number
) => {
  let lineContent = currentLine.translateToString(true)
  let finalContentCursorX = contentCursorX

  if (isCrossRow) {
    const crossRowData = processCrossRowContent(parseStrTag, refreshCrossRow, cursorX, cursorY, buffer)
    lineContent = crossRowData.fullContent
    finalContentCursorX = crossRowData.totalCharacterPosition
    terminalState.value.contentCrossRowLines = crossRowData.crossRowLines
    terminalState.value.contentCrossStartLine = crossRowData.crossStartLine
    terminalState.value.contentCurrentCursorCrossRowLines = crossRowData.currentCursorCrossRowLines
    cursorStartX.value = startStr.value.length
  }

  return { lineContent, finalContentCursorX }
}

const processCrossRowContent = (parseStrTag: boolean, refreshCrossRow: boolean, cursorX: number, cursorY: number, buffer: any) => {
  const currentBufferLine = terminal.value?.buffer.active.baseY || 0
  let { contentCrossRowLines: crossRowLines, contentCrossStartLine: crossStartLine } = terminalState.value
  let { contentCurrentCursorCrossRowLines: currentCursorCrossRowLines } = terminalState.value
  if ((crossStartLine === 0 && crossRowLines === 0) || (!parseStrTag && cursorY !== cursorLastY.value)) {
    crossStartLine = getLogicalInputStartLine() - currentBufferLine
  }
  if (refreshCrossRow) {
    crossStartLine = cursorY - currentCursorCrossRowLines + 1
  }
  if (crossRowLines === 0 || cursorY > cursorLastY.value || (!parseStrTag && cursorY !== cursorLastY.value)) {
    crossRowLines = cursorEndY.value - crossStartLine + 1
  }
  currentCursorCrossRowLines = cursorY - crossStartLine + 1
  let totalCharacterPosition = 0
  let fullContent = ''
  for (let i = 0; i < currentCursorCrossRowLines; i++) {
    const lineIndex = currentBufferLine + crossStartLine + i
    const lineContent = buffer.lines.get(lineIndex).translateToString(true)
    if (i === currentCursorCrossRowLines - 1) {
      totalCharacterPosition += cursorX
    } else {
      totalCharacterPosition += lineContent.length
    }
  }
  for (let i = 0; i < crossRowLines; i++) {
    const lineIndex = currentBufferLine + crossStartLine + i
    const lineContent = buffer.lines.get(lineIndex).translateToString(true)
    fullContent += lineContent
  }
  return {
    fullContent,
    totalCharacterPosition,
    crossRowLines,
    crossStartLine,
    currentCursorCrossRowLines
  }
}

const updateCursorHistory = (cursorX: number, cursorY: number, maxX: number, maxY: number): void => {
  cursorLastY.value = cursorY
  cursorLastX.value = cursorX
  cursorMaxX.value = maxX
  cursorMaxY.value = maxY
}

const updateContentStrings = (lineContent: string, cursorX: number): void => {
  if (startStr.value !== '') {
    const newStartStr = lineContent.substring(0, cursorStartX.value)
    if (newStartStr !== startStr.value) {
      cursorStartX.value = cursorX
      startStr.value = lineContent.substring(0, cursorX)
    }
  } else {
    beginStr.value = lineContent.substring(0, cursorStartX.value)
  }
}

const updateTerminalContent = (lineContent: string, contentCursorX: number): void => {
  terminalState.value.content = substrWidth(lineContent, cursorStartX.value)
  terminalState.value.beforeCursor = substrWidth(lineContent, cursorStartX.value, contentCursorX)
}

const updateTerminalStateObject = (cursorX: number, cursorY: number, isCrossRow: boolean): void => {
  terminalState.value.cursorPosition = { col: cursorX, row: cursorY }
  terminalState.value.contentCrossRowStatus = isCrossRow
}

const sendTerminalStateToServer = async (): Promise<void> => {
  try {
    await api.recordTerminalState({
      id: connectionId.value,
      state: {
        cursorPosition: {
          row: terminalState.value.cursorPosition.row,
          col: terminalState.value.cursorPosition.col
        },
        beforeCursor: terminalState.value.beforeCursor,
        content: terminalState.value.content
      }
    })
  } catch (err) {
    console.error('发送终端状态时出错:', err)
  }
}
function handleExternalInput(data) {
  handleInput && handleInput(data, false)
}

const setupTerminalInput = () => {
  if (!terminal.value) return

  if (termOndata) {
    termOndata.dispose()
    termOndata = null
  }

  handleInput = async (data, isInputManagerCall = true) => {
    if (isInputManagerCall && isSyncInput.value) {
      inputManager.sendToOthers(connectionId.value, data)
    }
    if (startStr.value == '') {
      startStr.value = beginStr.value
    }
    // Intercept Delete/Backspace when suggestions are visible: clear and forward once to actually delete char
    if (isDeleteKeyData(data) && suggestions.value.length > 0) {
      suggestions.value = []
      activeSuggestion.value = -1
      suggestionSelectionMode.value = false
      // Avoid immediate re-query; user will continue typing
      selectFlag.value = true
      // Forward the delete/backspace to remote to actually remove character
      sendData(data)
      return
    }
    if (data === '\t') {
      const cmd = JSON.parse(JSON.stringify(terminalState.value.content))
      selectFlag.value = true
      suggestions.value = []
      activeSuggestion.value = -1
      suggestionSelectionMode.value = false
      setTimeout(() => {
        queryCommand(cmd)
      }, 100)
    }
    if (data === '\x03') {
      if (suggestions.value.length) {
        suggestions.value = []
        activeSuggestion.value = -1
        suggestionSelectionMode.value = false
        nextTick(() => {})
      }
      selectFlag.value = true
      sendData(data)
    } else if (data === '\x0c') {
      if (suggestions.value.length) {
        suggestions.value = []
        activeSuggestion.value = -1
        suggestionSelectionMode.value = false
        nextTick(() => {})
      }
      selectFlag.value = true
      sendData(data)
    } else if (data === '\x1b') {
      if (contextmenu.value && typeof contextmenu.value.hide === 'function') {
        contextmenu.value.hide()
      }
      if (suggestions.value.length) {
        suggestions.value = []
        activeSuggestion.value = -1
        suggestionSelectionMode.value = false
        nextTick(() => {})
        return
      } else {
        sendData(data)
      }
    } else if (data === '\x16') {
      navigator.clipboard
        .readText()
        .then((text) => {
          sendData(text)
          // Ensure scroll to bottom after paste
          nextTick(() => {
            terminal.value?.scrollToBottom()
            terminal.value?.focus()
          })
        })
        .catch(() => {})
    } else if (data == '\r') {
      if (!isConnected.value) {
        cusWrite?.('\r\n' + t('ssh.reconnecting') + '\r\n', { isUserCall: true })
        connectSSH()
        return
      }

      const command = terminalState.value.content
      if (suggestions.value.length && activeSuggestion.value >= 0) {
        selectSuggestion(suggestions.value[activeSuggestion.value])
        selectFlag.value = true
        selectFlag.value = true
        suggestions.value = []
        activeSuggestion.value = -1
        suggestionSelectionMode.value = false
        // Ensure scroll to bottom
        nextTick(() => {
          terminal.value?.scrollToBottom()
          terminal.value?.focus()
        })
        return
      } else {
        const delData = String.fromCharCode(127)
        const aliasStore = aliasConfigStore()
        const newCommand = aliasStore.getCommand(command)
        if (dbConfigStash.aliasStatus === 1 && newCommand !== null) {
          sendData(delData.repeat(command.length) + newCommand + '\r')
        } else if (config.quickVimStatus === 1 && !isSyncInput.value) {
          connectionSftpAvailable.value = await api.checkSftpConnAvailable(connectionId.value)
          const vimMatch = command.match(/^\s*vim\s+(.+)$/i)
          if (vimMatch && connectionSftpAvailable.value) {
            let vimData = data
            if (vimMatch[1].startsWith('/')) {
              vimData = delData.repeat(command.length) + 'echo "' + vimMatch[1] + '"  #Chaterm:vim  \r'
            } else {
              vimData = delData.repeat(command.length) + 'echo "$(pwd)/' + vimMatch[1] + '"  #Chaterm:vim  \r'
            }
            sendMarkedData(vimData, 'Chaterm:vim')
          } else {
            sendData(data)
          }
        } else {
          sendData(data)
        }
      }
      if (command && command.trim()) {
        insertCommand(command)
      }
      suggestions.value = []
      activeSuggestion.value = -1
      suggestionSelectionMode.value = false

      // Ensure scroll to bottom and maintain focus
      nextTick(() => {
        terminal.value?.scrollToBottom()
        terminal.value?.focus()
      })
    } else if (JSON.stringify(data) === '"\\u001b[A"' && terminalMode.value === 'none') {
      if (suggestions.value.length && suggestionSelectionMode.value) {
        if (data == '\u001b[A') {
          // 上方向键：循环向上导航 - only when in selection mode
          if (activeSuggestion.value <= 0) {
            activeSuggestion.value = suggestions.value.length - 1
          } else {
            activeSuggestion.value -= 1
          }
        }
      } else {
        sendMarkedData(data, 'Chaterm:[A')
      }
    } else if (JSON.stringify(data) === '"\\u001b[B"' && terminalMode.value === 'none') {
      if (suggestions.value.length && suggestionSelectionMode.value) {
        if (data == '\u001b[B') {
          // 下方向键：循环向下导航 - only when in selection mode
          if (activeSuggestion.value >= suggestions.value.length - 1) {
            activeSuggestion.value = 0
          } else {
            activeSuggestion.value += 1
          }
        }
      } else {
        sendMarkedData(data, 'Chaterm:[B')
      }
    } else if (data == '\u001b[C') {
      // Right arrow key - enter selection mode or select suggestion
      if (suggestions.value.length) {
        if (!suggestionSelectionMode.value) {
          // Enter selection mode and select first item
          suggestionSelectionMode.value = true
          activeSuggestion.value = 0
          // Prevent immediate query refresh which would reset selection mode
          selectFlag.value = true
        } else {
          // Already in selection mode, select current suggestion
          selectSuggestion(suggestions.value[activeSuggestion.value])
          selectFlag.value = true
        }
      } else {
        sendData(data)
      }
    } else if (data == '\u001b[D') {
      // Left arrow key - exit selection mode or pass through
      if (suggestions.value.length && suggestionSelectionMode.value) {
        suggestionSelectionMode.value = false
      } else {
        sendData(data)
      }
    } else {
      sendData(data)
      selectFlag.value = false
    }
    if (!selectFlag.value) {
      queryCommand()
    }
  }
  termOndata = terminal.value?.onData(handleInput)
}

const sendData = (data) => {
  api.writeToShell({
    id: connectionId.value,
    data: data,
    lineCommand: terminalState.value.content
  })
}
const sendMarkedData = (data, marker) => {
  api.writeToShell({
    id: connectionId.value,
    data: data,
    marker: marker,
    lineCommand: terminalState.value.content
  })
}
export interface MarkedResponse {
  data: string
  marker?: string
}

const matchPattern = (data: number[], pattern: number[]): boolean => {
  if (data.length < pattern.length) return false
  for (let i = data.length - pattern.length; i >= Math.max(0, data.length - 500); i--) {
    let match = true
    for (let j = 0; j < pattern.length; j++) {
      if (data[i + j] !== pattern[j]) {
        match = false
        break
      }
    }
    if (match) return true
  }
  return false
}

type TerminalMode = 'none' | 'alternate' | 'ui'
const terminalMode = ref<TerminalMode>('none')

const checkFullScreenClear = (data: string) => {
  const isSimpleCtrlL = data.includes('\x1b[H\x1b[2J')
  if (isSimpleCtrlL) return false
  const clearScreenPatterns = [
    /\x1b\[H\x1b\[J/,
    /\x1b\[2J\x1b\[H/,
    /\x1b\[H.*?\x1b\[J/s,
    /\x1b\[J.*?\x1b\[H/s,
    /\x1b\[\d+;\d+H.*?\x1b\[J/s,
    /\x1b\[2J(?:\x1b\[H)?/
  ]
  return clearScreenPatterns.some((pattern) => pattern.test(data))
}

const checkHeavyUiStyle = (data: string) => {
  const moveCount = (data.match(/\x1b\[\d+;\d+H/g) || []).length
  const clearCount = (data.match(/\x1b\[\d*K/g) || []).length
  const hasTable = /NUM\s+NAME\s+IP:PORT/.test(data) || /=+/.test(data)

  return moveCount >= 5 && clearCount >= 5 && hasTable
}

const checkEditorMode = (response: MarkedResponse): void => {
  let bytes: number[] = []
  if (response.data) {
    if (typeof response.data === 'string') {
      const encoder = new TextEncoder()
      bytes = Array.from(encoder.encode(response.data))
    } else if (response.data && typeof response.data === 'object' && 'byteLength' in response.data) {
      bytes = Array.from(response.data as Uint8Array)
    } else if (Array.isArray(response.data)) {
      bytes = response.data
    }
  }

  if (bytes.length === 0) return
  dataBuffer.value.push(...bytes)
  if (dataBuffer.value.length > 4000) {
    dataBuffer.value = dataBuffer.value.slice(-2000)
  }

  const buffer = dataBuffer.value
  const text = new TextDecoder().decode(new Uint8Array(buffer))

  if (terminalMode.value === 'none') {
    for (const seq of EDITOR_SEQUENCES.enter) {
      if (matchPattern(dataBuffer.value, seq.pattern)) {
        terminalMode.value = 'alternate'
        nextTick(() => {
          handleResize()
        })
        return
      }
    }
  }
  if (terminalMode.value === 'alternate') {
    for (const seq of EDITOR_SEQUENCES.exit) {
      if (matchPattern(dataBuffer.value, seq.pattern)) {
        terminalMode.value = 'none'
        dataBuffer.value = []
        nextTick(() => {
          handleResize()
        })
        return
      }
    }
  }

  if (terminalMode.value === 'none') {
    if (checkFullScreenClear(text) || checkHeavyUiStyle(text)) {
      terminalMode.value = 'ui'
      nextTick(handleResize)
      return
    }
  }

  if (terminalMode.value === 'ui') {
    let score = 0
    if (text.includes('\x1b[?2004h')) score += 2
    if (text.includes('\x1b[?1034h')) score += 2
    if (text.includes('\x1b]0;') && text.includes('\x07')) score += 1
    const commonJumps = ['\x1b[23;1H', '\x1b[39;1H', '\x1b[11;1H']
    const cursorGone = !commonJumps.some((seq) => text.includes(seq))
    if (cursorGone) score += 1
    if (score >= 3) {
      terminalMode.value = 'none'
      dataBuffer.value = []
      nextTick(handleResize)
      return
    }
  }
}

const handleServerOutput = (response: MarkedResponse) => {
  let data = response.data

  if (response.marker === 'Chaterm:vim') {
    const { lastLine: lastLine, filePath: filePath, contentType: contentType } = parseVimLine(data)
    createEditor(filePath, contentType)
    sendMarkedData('history -s "vim ' + filePath + '"' + '\r', 'Chaterm:history')
    data = lastLine
    cusWrite?.(data)
  } else if (response.marker === 'Chaterm:save' || response.marker === 'Chaterm:history' || response.marker === 'Chaterm:pass') {
  } else if (response.marker === 'Chaterm:[A') {
    if (data.indexOf('Chaterm:vim') !== -1) {
      cusWrite?.(data)
      sendData(String.fromCharCode(21))
      sendMarkedData(String.fromCharCode(27, 91, 65), 'Chaterm:[A')
    } else {
      cusWrite?.(data)
    }
  } else if (response.marker === 'Chaterm:[B') {
    if (data.indexOf('Chaterm:vim') !== -1) {
      cusWrite?.(data)
      sendData(String.fromCharCode(21))
      sendMarkedData(String.fromCharCode(27, 91, 64), 'Chaterm:[B')
    } else {
      cusWrite?.(data)
    }
  } else if (response.marker === 'Chaterm:pwd') {
    let currentCwd = ''
    const temp = stripAnsi(data)

    const lines = temp.trim().split(/\r?\n/)

    if (lines.length >= 2 && lines[0].trim() === 'pwd') {
      currentCwd = lines[1].trim()
    }

    currentCwdStore.setKeyValue(props.connectData.ip, currentCwd)

    eventBus.emit('cwdUpdatedForHost', props.connectData.ip)
  } else if (response.marker === 'Chaterm:command') {
    isCollectingOutput.value = true
    const cleanOutput = stripAnsi(data).trim()
    commandOutput.value += cleanOutput + '\n'
    const promptRegex = /(?:\[([^@]+)@([^\]]+)\][#$]|([^@]+)@([^:]+):(?:[^$]*|\s*~)\s*[$#]|\[([^@]+)@([^\]]+)\s+[^\]]*\][#$])\s*$/
    if (promptRegex.test(cleanOutput)) {
      isCollectingOutput.value = false
      const lines = commandOutput.value
        .replace(/\r\n|\r/g, '\n')
        .split('\n')
        .filter((line) => line.trim())
      const outputLines = lines.slice(1, -1)
      const finalOutput = outputLines.join('\n').trim()
      if (finalOutput) {
        nextTick(() => {
          const formattedOutput = `Terminal output:\n\`\`\`\n${finalOutput}\n\`\`\``
          eventBus.emit('chatToAi', formattedOutput)
          setTimeout(() => {
            eventBus.emit('triggerAiSend')
          }, 100)
        })
      } else {
        const output = configStore.getUserConfig.language == 'en-US' ? 'Command executed successfully, no output returned' : '执行完成，没有输出返回'
        const formattedOutput = `Terminal output:\n\`\`\`\n${output}\n\`\`\``
        eventBus.emit('chatToAi', formattedOutput)
        setTimeout(() => {
          eventBus.emit('triggerAiSend')
        }, 100)
      }
      commandOutput.value = ''
    }
    cusWrite?.(data)
  } else if (isCollectingOutput.value) {
    const cleanOutput = stripAnsi(data).trim()
    commandOutput.value += cleanOutput + '\n'
    const promptRegex = /(?:\[([^@]+)@([^\]]+)\][#$]|([^@]+)@([^:]+):(?:[^$]*|\s*~)\s*[$#]|\[([^@]+)@([^\]]+)\s+[^\]]*\][#$])\s*$/
    if (promptRegex.test(cleanOutput)) {
      isCollectingOutput.value = false
      const lines = commandOutput.value
        .replace(/\r\n|\r/g, '\n')
        .split('\n')
        .filter((line) => line.trim())
      const outputLines = lines.slice(1, -1)
      const finalOutput = outputLines.join('\n').trim()
      if (finalOutput) {
        nextTick(() => {
          const formattedOutput = `Terminal output:\n\`\`\`\n${finalOutput}\n\`\`\``
          eventBus.emit('chatToAi', formattedOutput)
          setTimeout(() => {
            eventBus.emit('triggerAiSend')
          }, 100)
        })
      } else {
        const output = configStore.getUserConfig.language == 'en-US' ? 'Command executed successfully, no output returned' : '执行完成，没有输出返回'
        eventBus.emit('chatToAi', output)
        setTimeout(() => {
          eventBus.emit('triggerAiSend')
        }, 100)
      }
      commandOutput.value = ''
    }
    cusWrite?.(data)
  } else {
    cusWrite?.(data)
  }
}

const specialCode = ref(false)
const keyCode = ref('')
const currentLine = ref('')
const activeMarkers: any = ref([])
const commands = ref()
const cursorY = ref(0)
const cursorX = ref(0)
const enterPress = ref(false)
const tagPress = ref(false)
const beginStr = ref<string>('')
const startStr = ref<string>('')

// Helper function to calculate display width position
const calculateDisplayPosition = (str: string, charIndex: number): number => {
  let displayPos = 0
  for (let i = 0; i < charIndex && i < str.length; i++) {
    const code = str.codePointAt(i) || 0
    const charWidth =
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0x20000 && code <= 0x2fa1f)
        ? 2
        : 1
    displayPos += charWidth
    if (code > 0xffff) {
      i++
    }
  }
  return displayPos
}

const highlightSyntax = (allData) => {
  const { content, beforeCursor, cursorPosition } = allData
  let command = ''
  let arg = ''
  const currentCursorX = cursorStartX.value + beforeCursor.length
  const index = content.indexOf(' ')
  const i = content.indexOf(' ')
  if (i != -1) {
    command = content.slice(0, i)
    arg = content.slice(i)
  } else {
    command = content
    arg = ''
  }

  activeMarkers.value.forEach((marker) => marker.dispose())
  activeMarkers.value = []
  let startY = (terminal.value as any)?._core.buffer.y
  if (allData.contentCrossRowStatus) {
    startY = allData.contentCrossStartLine
  }
  const isValidCommand = commands.value?.includes(command)
  if (command) {
    const commandMarker = terminal.value?.registerMarker(startY)
    activeMarkers.value.push(commandMarker)
    cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + 1}H`, {
      isUserCall: true
    })
    const colorCode = isValidCommand ? '38;2;24;144;255' : '31'
    cusWrite?.(`\x1b[${colorCode}m${command}\x1b[0m`, {
      isUserCall: true
    })
    setTimeout(() => {
      cusWrite?.(`\x1b[${cursorPosition.row + 1};${cursorPosition.col + 1}H`, {
        isUserCall: true
      })
    })
  }
  if (!arg) return
  if (arg.includes("'") || arg.includes('"') || arg.includes('(') || arg.includes('{') || arg.includes('[')) {
    const afterCommandArr: any = processString(arg)
    let unMatchFlag = false
    for (let i = 0; i < afterCommandArr.length; i++) {
      if (afterCommandArr[i].type == 'unmatched') {
        cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + 1}H`, {
          isUserCall: true
        })

        cusWrite?.(`\x1b[31m${content}\x1b[0m`, {
          isUserCall: true
        })

        cusWrite?.(`\x1b[${cursorPosition.row + 1};${cursorPosition.col + 1}H`, {
          isUserCall: true
        })
        unMatchFlag = true
      }
    }
    if (!unMatchFlag) {
      for (let i = 0; i < afterCommandArr.length; i++) {
        if (afterCommandArr[i].content == ' ') {
          // Calculate correct display position for Chinese characters
          const displayPos = calculateDisplayPosition(arg, afterCommandArr[i].startIndex)
          const commandDisplayWidth = calculateDisplayPosition(command, command.length)
          cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + commandDisplayWidth + 1 + displayPos}H`, {
            isUserCall: true
          })
          cusWrite?.(`${afterCommandArr[i].content}\x1b[0m`, {
            isUserCall: true
          })
        } else {
          // Calculate correct display position for Chinese characters
          const displayPos = calculateDisplayPosition(arg, afterCommandArr[i].startIndex)
          const commandDisplayWidth = calculateDisplayPosition(command, command.length)
          cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + commandDisplayWidth + 1 + displayPos}H`, {
            isUserCall: true
          })
          const colorCode = afterCommandArr[i].type == 'matched' ? '38;2;250;173;20' : '38;2;126;193;255'
          cusWrite?.(`\x1b[${colorCode}m${afterCommandArr[i].content}\x1b[0m`, {
            isUserCall: true
          })
        }
      }
    }
  } else {
    const commandDisplayWidth = calculateDisplayPosition(command, command.length)
    if (index == -1 && currentCursorX >= cursorStartX.value + commandDisplayWidth) {
      cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + commandDisplayWidth + 1}H`, {
        isUserCall: true
      })
      cusWrite?.(`\x1b[38;2;126;193;255m${arg}\x1b[0m`, { isUserCall: true })
      cusWrite?.(`\x1b[${cursorPosition.row + 1};${cursorPosition.col + 1}H`, {
        isUserCall: true
      })
    } else if (currentCursorX < cursorStartX.value + commandDisplayWidth) {
      cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + commandDisplayWidth + 1}H`, {
        isUserCall: true
      })
      cusWrite?.(`\x1b[38;2;126;193;255m${arg}\x1b[0m`, { isUserCall: true })
      cusWrite?.(`\x1b[${cursorPosition.row + 1};${cursorPosition.col + 1}H`, {
        isUserCall: true
      })
    } else {
      cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + commandDisplayWidth + 1}H`, {
        isUserCall: true
      })
      cusWrite?.(`\x1b[38;2;126;193;255m${arg}\x1b[0m`, { isUserCall: true })
      cusWrite?.(`\x1b[${cursorPosition.row + 1};${cursorPosition.col + 1}H`, {
        isUserCall: true
      })
    }
  }
}

type ResultItem = { type: string; content: string; startIndex: number; endIndex?: number }
const processString = (str: string): ResultItem[] => {
  const result: ResultItem[] = []
  let i = 0

  while (i < str.length) {
    if (str[i] === '"' || str[i] === "'") {
      const quote = str[i]
      let j = i + 1
      while (j < str.length && str[j] !== quote) {
        if (str[j] === '\\' && str[j + 1] === quote) {
          j += 2
        } else {
          j++
        }
      }
      if (j < str.length) {
        result.push({
          type: 'matched',
          startIndex: i,
          endIndex: j,
          content: str.slice(i, j + 1)
        })
        i = j + 1
      } else {
        result.push({
          type: 'unmatched',
          content: str[i],
          startIndex: i
        })
        i++
      }
      continue
    }
    if (str[i] === '{' && str[i + 1] === '{') {
      let depth = 1
      let j = i + 2
      while (j < str.length) {
        if (str[j] === '{' && str[j + 1] === '{') {
          depth++
          j++
        } else if (str[j] === '}' && str[j + 1] === '}') {
          depth--
          if (depth === 0) break
          j++
        }
        j++
      }
      if (depth === 0 && j < str.length) {
        result.push({
          type: 'matched',
          startIndex: i,
          endIndex: j + 1,
          content: str.slice(i, j + 2)
        })
        i = j + 2
      } else {
        result.push({
          type: 'unmatched',
          content: str[i],
          startIndex: i
        })
        i++
      }
      continue
    }
    if (str[i] === '{' || str[i] === '[' || str[i] === '(') {
      const openChar = str[i]
      const closeChar = openChar === '{' ? '}' : openChar === '[' ? ']' : ')'
      let depth = 1
      let j = i + 1
      while (j < str.length) {
        if (str[j] === openChar) {
          depth++
        } else if (str[j] === closeChar) {
          depth--
          if (depth === 0) break
        }
        j++
      }
      if (depth === 0 && j < str.length) {
        result.push({
          type: 'matched',
          startIndex: i,
          endIndex: j,
          content: str.slice(i, j + 1)
        })
        i = j + 1
      } else {
        result.push({
          type: 'unmatched',
          content: str[i],
          startIndex: i
        })
        i++
      }
      continue
    }
    let start = i
    while (
      i < str.length &&
      str[i] !== '"' &&
      str[i] !== "'" &&
      !(str[i] === '{' && str[i + 1] === '{') &&
      str[i] !== '{' &&
      str[i] !== '[' &&
      str[i] !== '('
    ) {
      i++
    }

    if (start < i) {
      result.push({
        type: 'afterMatched',
        content: str.slice(start, i),
        startIndex: start
      })
    }
    if (i === start) {
      result.push({
        type: 'afterMatched',
        content: str[i],
        startIndex: i
      })
      i++
    }
  }
  return result
}

const selectSuggestion = (suggestion: CommandSuggestion) => {
  selectFlag.value = true
  const DELCODE = String.fromCharCode(127)
  const RIGHTCODE = String.fromCharCode(27, 91, 67)
  sendData(RIGHTCODE.repeat(terminalState.value.content.length - terminalState.value.beforeCursor.length))
  sendData(DELCODE.repeat(terminalState.value.content.length))
  sendData(suggestion.command)
  suggestions.value = []
  activeSuggestion.value = -1
  suggestionSelectionMode.value = false
}
const queryCommand = async (cmd = '') => {
  if (!queryCommandFlag.value || isSyncInput.value) return
  const isAtEndOfLine = terminalState.value.beforeCursor.length === terminalState.value.content.length
  if (!isAtEndOfLine) {
    suggestions.value = []
    suggestionSelectionMode.value = false
    return
  }

  try {
    if (suggestionSelectionMode.value) {
      return
    }
    const result = await (window.api as any).queryCommand({
      command: cmd ? cmd : terminalState.value.beforeCursor,
      ip: props.connectData.ip
    })
    if (result) {
      suggestions.value = result as CommandSuggestion[]
      setTimeout(() => {
        const componentInstance = componentRefs.value[connectionId.value]
        componentInstance?.updateSuggestionsPosition(terminal.value)
      }, 1)
    }
  } catch (error) {
    console.log('查询失败' + error)
  }
}
const insertCommand = async (cmd) => {
  try {
    await window.api.insertCommand({
      command: cmd,
      ip: props.connectData.ip
    })
  } catch (error) {}
}

const handleKeyInput = (e) => {
  enterPress.value = false
  tagPress.value = false
  specialCode.value = false
  const ev = e.domEvent
  const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey
  const buffer: any = terminal.value?.buffer.active
  cursorX.value = buffer.cursorX
  cursorY.value = buffer.cursorY
  keyCode.value = ev.keyCode
  let index = 0
  if (cursorStartX.value == 0) {
    cursorStartX.value = cursorX.value
  } else {
    cursorX.value !== 0 && cursorX.value < cursorStartX.value && (cursorStartX.value = cursorX.value)
  }

  if (ev.keyCode === 13 || e.key === '\u0003') {
    if (suggestions.value.length && activeSuggestion.value >= 0) {
      return
    }

    enterPress.value = true
    selectFlag.value = true
    currentLine.value = ''
    cursorStartX.value = 0
    terminalState.value.contentCrossRowStatus = false
    terminalState.value.contentCrossStartLine = 0
    terminalState.value.contentCrossRowLines = 0

    // 确保滚动到底部并保持焦点
    nextTick(() => {
      terminal.value?.scrollToBottom()
      terminal.value?.focus()
    })
  } else if (ev.keyCode === 8) {
    index = cursorX.value - 1 - cursorStartX.value
    currentLine.value = currentLine.value.slice(0, index) + currentLine.value.slice(index + 1)
  } else if (ev.keyCode == 38 || ev.keyCode == 40) {
    specialCode.value = true
  } else if (ev.keyCode == 37 || ev.keyCode == 39) {
    specialCode.value = true
    if (suggestions.value.length) {
      specialCode.value = false
    }
  } else if (ev.keyCode == 9) {
    tagPress.value = true
  } else if (printable) {
    selectFlag.value = false
  } else {
    selectFlag.value = false
  }
}

const disconnectSSH = async () => {
  try {
    const result = await api.disconnect({ id: connectionId.value })
    if (result.status === 'success') {
      cleanupListeners.value.forEach((cleanup) => cleanup())
      cleanupListeners.value = []
      isConnected.value = false
      cusWrite?.('\r\n' + t('ssh.disconnected'), { isUserCall: true })
      cusWrite?.('\r\n' + t('ssh.pressEnterToReconnect') + '\r\n', { isUserCall: true })
    } else {
      cusWrite?.('\r\n' + t('ssh.disconnectError', { message: result.message }), { isUserCall: true })
    }
  } catch (error: any) {
    cusWrite?.('\r\n' + t('ssh.disconnectError', { message: error.message || t('ssh.unknownError') }), {
      isUserCall: true
    })
  }
  emit('disconnectSSH', { isConnected: isConnected })
}
const contextAct = (action) => {
  switch (action) {
    case 'paste':
      if (startStr.value == '') {
        startStr.value = beginStr.value
      }
      pasteFlag.value = true
      navigator.clipboard.readText().then((text) => {
        sendData(text)
        terminal.value?.focus()
      })
      break
    case 'disconnect':
      disconnectSSH()
      termOndata?.dispose()
      termOndata = null
      break
    case 'reconnect':
      connectSSH()
      break
    case 'newTerminal':
      emit('createNewTerm', props.serverInfo)
      break
    case 'close':
      emit('closeTabInTerm', props.serverInfo.id)
      break
    case 'clearTerm':
      terminal.value?.clear()
      break
    case 'shrotenName':
      sendData('export PS1="[\\u@\\W]\\$"')
      sendData('\r')
      break
    case 'fontsizeLargen':
      if (terminal.value?.options) {
        terminal.value.options.fontSize = (terminal.value.options.fontSize ?? 12) + 1
      }
      break
    case 'fontsizeSmaller':
      if (terminal.value?.options) {
        terminal.value.options.fontSize = (terminal.value.options.fontSize ?? 12) - 1
      }
      break
    case 'registerSyncInput':
      if (isSyncInput.value) {
        inputManager.unregisterSyncInput(connectionId.value)
        isSyncInput.value = false
      } else {
        inputManager.registerSyncInput(connectionId.value)
        isSyncInput.value = true
      }
      break
    case 'fileManager':
      eventBus.emit('openUserTab', 'files')
      break
    default:
      break
  }
}

const focus = () => {
  if (terminal.value) {
    // Ensure terminal scrolls to bottom, keeping cursor in visible area
    terminal.value.scrollToBottom()
    terminal.value.focus()
    inputManager.setActiveTerm(connectionId.value)
  }
}

const hideSelectionButton = () => {
  showAiButton.value = false
}

const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if (contextmenu.value && typeof contextmenu.value.hide === 'function') {
    contextmenu.value.hide()
  }
  if (props.activeTabId !== props.currentConnectionId) return

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

  // Check if we're in vim mode to avoid shortcut conflicts
  if (terminalMode.value === 'alternate') {
    // In vim mode, block most shortcuts that could conflict with vim operations
    const blockedInVim = [
      // Block Ctrl+V (vim visual block mode) - this is the main issue
      { ctrlKey: true, key: 'v' },
      // Block other common vim conflicts
      { ctrlKey: true, key: 'c' }, // vim visual mode
      { ctrlKey: true, key: 'z' }, // vim undo
      { ctrlKey: true, key: 'a' }, // vim increment
      { ctrlKey: true, key: 'e' }, // vim scroll down
      { ctrlKey: true, key: 'y' }, // vim scroll up
      { ctrlKey: true, key: 'd' }, // vim half page down
      { ctrlKey: true, key: 'u' }, // vim half page up
      { ctrlKey: true, key: 'f' }, // vim page down
      { ctrlKey: true, key: 'b' }, // vim page up
      { ctrlKey: true, key: 'g' }, // vim status
      { ctrlKey: true, key: 'o' }, // vim open line
      { ctrlKey: true, key: 'p' }, // vim previous
      { ctrlKey: true, key: 'n' }, // vim next
      { ctrlKey: true, key: 'x' }, // vim cut
      { ctrlKey: true, key: 's' }, // vim save
      { ctrlKey: true, key: 'w' }, // vim window
      { ctrlKey: true, key: 'h' }, // vim backspace
      { ctrlKey: true, key: 'j' }, // vim join
      { ctrlKey: true, key: 'k' }, // vim kill
      { ctrlKey: true, key: 'l' }, // vim redraw
      { ctrlKey: true, key: 'm' }, // vim newline
      { ctrlKey: true, key: 'q' }, // vim quit
      { ctrlKey: true, key: 'r' }, // vim redo
      { ctrlKey: true, key: 't' } // vim tag
    ]

    // Check if current key combination should be blocked in vim mode
    const shouldBlock = blockedInVim.some((blocked) => blocked.key === e.key && blocked.ctrlKey === e.ctrlKey)

    if (shouldBlock) {
      // Block the shortcut in vim mode to avoid conflicts
      e.preventDefault()
      e.stopPropagation()
      return
    }
  }

  // Search functionality
  if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'f') {
    e.preventDefault()
    e.stopPropagation()
    openSearch()
  }

  // Close tab functionality
  if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'u') {
    e.preventDefault()
    e.stopPropagation()
    contextAct('close')
  }

  // Font size increase (Ctrl+)
  if (e.ctrlKey && e.key === '=') {
    e.preventDefault()
    e.stopPropagation()
    contextAct('fontsizeLargen')
  }

  // Font size decrease (Ctrl-)
  if (e.ctrlKey && e.key === '-') {
    e.preventDefault()
    e.stopPropagation()
    contextAct('fontsizeSmaller')
  }

  if (e.key === 'Escape' && showSearch.value) {
    e.preventDefault()
    e.stopPropagation()
    closeSearch()
  }
}
// Open command dialog only for the active tab and focused terminal
const tryOpenLocalCommandDialog = () => {
  if (props.activeTabId !== props.currentConnectionId) return
  const activeElement = document.activeElement
  const container = terminalElement.value?.closest('.terminal-container')
  const isTerminalFocused =
    activeElement === terminal.value?.textarea ||
    container?.contains(activeElement as Node) ||
    (activeElement as HTMLElement)?.classList?.contains('xterm-helper-textarea')

  if (!isTerminalFocused) return
  // Ensure terminal is focused for accurate positioning
  terminal.value?.focus()
  isCommandDialogVisible.value = true
}
const handleOpenCommandDialog = () => {
  tryOpenLocalCommandDialog()
}

// Listen to global openCommandDialog and restrict to this terminal/tab
eventBus.on('openCommandDialog', handleOpenCommandDialog)

cleanupListeners.value.push(() => {
  eventBus.off('openCommandDialog', handleOpenCommandDialog)
})

// Hide dialog when tab deactivates; restore when re-activates
watch(
  () => props.activeTabId,
  (newActive) => {
    if (newActive !== props.currentConnectionId) {
      wasDialogVisibleBeforeDeactivation.value = isCommandDialogVisible.value
      isCommandDialogVisible.value = false
    } else {
      if (wasDialogVisibleBeforeDeactivation.value) {
        // Restore visibility and reposition
        nextTick(() => {
          terminal.value?.focus()
          isCommandDialogVisible.value = true
        })
      }
    }
  }
)

const openSearch = () => {
  showSearch.value = true
}

const closeSearch = () => {
  showSearch.value = false
  searchAddon.value?.clearDecorations()
  terminal.value?.focus()
}

watch(
  () => commandBarHeight.value,
  () => {
    terminalContainerResize()
  }
)

const terminalContainerResize = () => {
  const currentHeight = commandBarHeight.value
  if (currentHeight > 0) {
    terminalContainer.value?.style.setProperty('height', `calc(100% - ${currentHeight}px)`)
  } else {
    terminalContainer.value?.style.setProperty('height', '100%')
    if (terminal.value) {
      terminal.value.scrollToBottom()
      terminal.value.focus()
    }
  }
}

const onChatToAiClick = () => {
  if (terminal.value && terminal.value.hasSelection()) {
    const text = terminal.value.getSelection()
    eventBus.emit('openAiRight')
    nextTick(() => {
      const formattedText = `Terminal output:\n\`\`\`\n${text.trim()}\n\`\`\``
      eventBus.emit('chatToAi', formattedText)
    })
    terminal.value.clearSelection()
  }
}

const getCursorLinePosition = () => {
  if (!terminal.value) {
    console.warn('Terminal not available')
    return null
  }

  try {
    const termInstance = terminal.value
    const terminalCore = (termInstance as any)._core
    const buffer = terminalCore._bufferService.buffer
    const renderService = terminalCore._renderService

    const { x: cursorX, y: cursorY } = buffer
    const baseY = termInstance.buffer.active.baseY

    const cellHeight = renderService.dimensions.css.cell.height || 16
    const cellWidth = renderService.dimensions.css.cell.width || 8

    const terminalRect = terminalElement.value?.getBoundingClientRect()

    const cursorPixelX = cursorX * cellWidth
    const cursorPixelY = cursorY * cellHeight

    const screenPosition = terminalRect
      ? {
          x: terminalRect.left + cursorPixelX,
          y: terminalRect.top + cursorPixelY
        }
      : null

    return {
      logicalX: cursorX,
      logicalY: baseY + cursorY,

      screenX: cursorX,
      screenY: cursorY,

      pixelX: cursorPixelX,
      pixelY: cursorPixelY,

      absoluteX: screenPosition?.x || null,
      absoluteY: screenPosition?.y || null,

      cellHeight,
      cellWidth,

      terminalRect: terminalRect
        ? {
            left: terminalRect.left,
            top: terminalRect.top,
            width: terminalRect.width,
            height: terminalRect.height
          }
        : null,

      currentLineContent: buffer.lines.get(baseY + cursorY)?.translateToString(true) || '',

      isCrossRow: cursorEndY.value !== cursorY
    }
  } catch (error) {
    console.error('获取光标位置失败:', error)
    return null
  }
}
defineExpose({
  handleResize,
  autoExecuteCode,
  terminal,
  focus,
  getCursorLinePosition,
  triggerResize: () => {
    handleResize()
  }
})

const commandOutput = ref('')
const isCollectingOutput = ref(false)

function updateSelectionButtonPosition() {
  if (!terminal.value) return
  const termInstance = terminal.value
  if (!termInstance.hasSelection()) {
    showAiButton.value = false
    return
  }
  const position = termInstance.getSelectionPosition()
  if (position && termInstance.getSelection().trim()) {
    const button = document.getElementById(`${connectionId.value}Button`) as HTMLElement
    if (!button) return
    const viewportY = termInstance.buffer.active.viewportY
    const viewportRows = termInstance.rows
    const visibleStart = viewportY
    const visibleEnd = viewportY + viewportRows - 1
    const { y: startY } = position.start
    const { y: endY } = position.end
    if ((startY < visibleStart || startY > visibleEnd) && (endY < visibleStart || endY > visibleEnd)) {
      showAiButton.value = false
      return
    }
    const visibleRow = startY - viewportY
    const cellHeight = (termInstance as any)._core._renderService.dimensions.css.cell.height
    const top = visibleRow - 2 > 0 ? (visibleRow - 2) * cellHeight : 0
    button.style.right = `26px`
    button.style.top = `${top}px`
    showAiButton.value = true
  } else {
    showAiButton.value = false
  }
}

// Helpers for suggestion handling
const isDeleteKeyData = (d: string) => d === '\x7f' || d === '\b' || d === '\x1b[3~'
</script>

<style lang="less">
.ant-form-item .ant-form-item-label > label {
  color: var(--text-color);
}

.ant-radio-wrapper {
  color: var(--text-color);
}

.terminal-container {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  overflow: hidden;
  padding: 4px 4px 0px 12px;
  position: relative;
}

.terminal {
  width: 100%;
  height: 100%;
}

.xterm-screen {
  -webkit-font-smoothing: subpixel-antialiased;
  transform: translateZ(0);
}

.terminal .xterm-viewport {
  background-color: transparent;
}
.terminal ::-webkit-scrollbar {
  width: 0px !important;
}
.select-button {
  position: absolute;
  z-index: 10;
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--text-color);
  font-size: 12px;
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color-light);

  .main-text {
    color: var(--text-color);
    font-size: 12px;
    font-weight: 500;
  }

  .shortcut-text {
    color: var(--text-color-secondary);
    font-size: 10px;
    margin-left: 4px;
    font-weight: 400;
  }

  &:hover {
    color: var(--text-color) !important;
    border: 1px solid var(--border-color-light) !important;

    .main-text {
      color: var(--text-color) !important;
    }

    .shortcut-text {
      color: var(--text-color-secondary) !important;
    }
  }
}
</style>
