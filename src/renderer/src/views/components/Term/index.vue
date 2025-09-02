<template>
  <div
    ref="terminalContainer"
    class="terminal-container"
  >
    <SearchComp
      v-if="showSearch"
      :search-addon="searchAddon"
      :terminal="term"
      @close-search="closeSearch"
    />
    <div
      ref="terminalElement"
      v-contextmenu:contextmenu
      class="terminal"
    ></div>
    <!-- 考虑到后期分屏等操作，同一个机器会打开多次，这个ref需要独一无二 -->
    <SuggComp
      v-bind="{ ref: (el) => setRef(el, infos.id) }"
      :unique-key="infos.id"
      :suggestions="suggestions"
      :active-suggestion="activeSuggestion"
      :selection-mode="suggestionSelectionMode"
    />
    <v-contextmenu ref="contextmenu">
      <Context
        :is-connect="isConnect"
        :ws-instance="socket"
        :term-instance="term"
        :copy-text="copyText"
        :terminal-id="terminalId"
        @context-act="contextAct"
      />
    </v-contextmenu>
  </div>
  <div
    v-for="editor in openEditors"
    v-show="editor.visible"
    :key="editor.filePath"
  >
    <EditorCode
      :editor="editor"
      @close-vim-editor="closeVimEditor"
      @handle-save="handleSave"
    />
  </div>
  <a-button
    :id="`${infos.id}Button`"
    class="select-button"
    style="display: none"
  >
    <span class="main-text">Chat to AI</span>
    <span class="shortcut-text">{{ shortcutKey }}</span>
  </a-button>
</template>

<script setup>
const contextmenu = ref()
import Context from './contextComp.vue'
import SuggComp from './suggestion.vue'
import SearchComp from './searchComp.vue'
import { ref, onMounted, nextTick, onBeforeUnmount, defineProps, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { SearchAddon } from 'xterm-addon-search'
import { v4 as uuidv4 } from 'uuid'
import { encrypt } from '@/utils/util'
import 'xterm/css/xterm.css'
import { userInfoStore } from '@/store'
import { userConfigStore } from '@/store/userConfigStore'
import { userConfigStore as serviceUserConfig } from '@/services/userConfigStoreService'
import { termFileContent, termFileContentSave } from '@/api/term/term'
import { notification } from 'ant-design-vue'
import EditorCode from './Editor/dragEditor.vue'
import { Modal } from 'ant-design-vue'
import { getListCmd } from '@/api/asset/asset'
import { aliasConfigStore } from '@/store/aliasConfigStore'
const { t } = useI18n()
const emit = defineEmits(['closeTabInTerm', 'createNewTerm'])
import eventBus from '@/utils/eventBus'
import { getActualTheme } from '@/utils/themeUtils'
import { shortcutService } from '@/services/shortcutService'
const isConnect = ref(true)
const props = defineProps({
  serverInfo: {
    type: Object,
    default: () => {
      return {}
    }
  }
})
const configStore = userConfigStore()
const infos = ref(props.serverInfo)
// Store reference objects
const componentRefs = ref({})
// Function to set dynamic references
const setRef = (el, key) => {
  if (el) {
    componentRefs.value[key] = el
  }
}
const email = userInfoStore().userInfo.email
const name = userInfoStore().userInfo.name
const terminalElement = ref(null)
const terminalContainer = ref(null)
const terminalId = `${email.split('@')[0]}@${props.serverInfo.ip}:remote:${uuidv4()}`
const suggestions = ref([]) // Returned completion list
const activeSuggestion = ref(0) // Highlighted completion item
const suggestionSelectionMode = ref(false) // Whether suggestion box is in selection mode
let isCommandExecuting = false // Command execution lock, prevent completion window from popping up after Enter
const socket = ref(null) // WebSocket instance
const term = ref(null) // Terminal instance
let fitAddon = null //
const api = window.api
let heartbeatId = null // Heartbeat ID
const copyText = ref('')
// Search related
const showSearch = ref(false)
const searchAddon = ref(null)
// Syntax highlighting related
const enc = new TextDecoder('utf-8')
const encoder = new TextEncoder()
const cursorStartX = ref(0)
const specialCode = ref(false)
const keyCodeArr = [8, 38, 40]
const keyCode = ref('')
const currentLine = ref('')
const stashLine = ref('')
const currentLineStartY = ref(0)
const activeMarkers = ref([])
const commands = ref([])
const cursorY = ref(0)
const cursorX = ref(0)
const stashCursorX = ref(0)
let stashConfig = null
let allDatas = ref({})
let resizeObserver = null
const authData = {
  email: email,
  ip: props.serverInfo.ip,
  uid: userInfoStore().userInfo.uid,
  organizationId: props.serverInfo.organizationId,
  terminalId: terminalId
}
// Optimized debounce function, supports immediate execution, dynamic delay and drag mode
const debounce = (func, wait, immediate = false) => {
  let timeout
  let isFirstCall = true
  let isDragging = false
  let lastCallTime = 0

  return function executedFunction(...args) {
    const now = Date.now()
    const timeSinceLastCall = now - lastCallTime
    lastCallTime = now

    // Detect if in drag process (continuous rapid calls)
    isDragging = timeSinceLastCall < 50

    const later = () => {
      clearTimeout(timeout)
      timeout = null
      if (!immediate) func(...args)
      isDragging = false
    }

    const callNow = immediate && !timeout
    clearTimeout(timeout)

    // Use shorter delay when dragging, immediate execution for first call
    let dynamicWait
    if (isDragging) {
      dynamicWait = 5 // Very short delay when dragging
    } else if (isFirstCall) {
      dynamicWait = 0 // Immediate execution for first call
    } else {
      dynamicWait = wait // Normal delay
    }

    timeout = setTimeout(later, dynamicWait)

    if (callNow) {
      func(...args)
      isFirstCall = false
    }
  }
}

const shortcutKey = computed(() => {
  const shortcuts = shortcutService.getShortcuts()
  if (shortcuts && shortcuts['sendOrToggleAi']) {
    return shortcutService.formatShortcut(shortcuts['sendOrToggleAi'])
  }
  // If not configured, return default value
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  return isMac ? '⌘L' : 'Ctrl+L'
})

onMounted(() => {
  initTerminal()
  connectWebsocket()

  // Use ResizeObserver to monitor terminal container size changes
  if (terminalContainer.value) {
    resizeObserver = new ResizeObserver(
      debounce(
        () => {
          handleResize()
        },
        30,
        true
      ) // Execute first call immediately, then 30ms debounce
    )
    resizeObserver.observe(terminalContainer.value)
  }

  // Keep window resize listener as backup
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleGlobalKeyDown)

  // Perform adaptive adjustment after initialization
  nextTick(() => {
    setTimeout(() => {
      handleResize()
    }, 100)
  })

  // Listen for executeTerminalCommand event
  eventBus.on('executeTerminalCommand', (command) => {
    autoExecuteCode(command)
  })

  // Listen for specific tab events
  eventBus.on('sendOrToggleAiFromTerminalForTab', (targetTabId) => {
    // Only process when target tabId matches current terminalId
    if (targetTabId !== terminalId) {
      return
    }

    // Check if focus is in terminal or terminal container
    const activeElement = document.activeElement
    const terminalContainer = terminalElement.value?.closest('.terminal-container')
    const isTerminalFocused =
      activeElement === term.value?.textarea ||
      terminalContainer?.contains(activeElement) ||
      activeElement?.classList.contains('xterm-helper-textarea')

    // Prioritize checking for selected text, but only send when terminal has focus
    if (term.value && term.value.hasSelection() && isTerminalFocused) {
      const selectedText = term.value.getSelection().trim()
      if (selectedText) {
        // If terminal has selected text and terminal has focus, always send to AI and ensure sidebar opens
        eventBus.emit('openAiRight')
        nextTick(() => {
          const formattedText = `Terminal output:\n\`\`\`\n${selectedText}\n\`\`\``
          eventBus.emit('chatToAi', formattedText)
        })
        return
      }
    }

    // If no selected text or focus is not in terminal, toggle sidebar state
    eventBus.emit('toggleSideBar', 'right')
  })

  // Listen for font update events
  eventBus.on('updateTerminalFont', (newFontFamily) => {
    if (term.value) {
      term.value.options.fontFamily = newFontFamily
    }
  })

  // Listen for openSearch event
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

  // Listen for theme update events
  eventBus.on('updateTheme', (theme) => {
    if (term.value) {
      const actualTheme = getActualTheme(theme)
      term.value.options.theme =
        actualTheme === 'light'
          ? {
              background: '#ffffff',
              foreground: '#000000',
              cursor: '#000000',
              cursorAccent: '#000000',
              selectionBackground: 'rgba(0, 0, 0, 0.3)'
            }
          : {
              background: 'var(--bg-color-secondary)',
              foreground: '#f0f0f0',
              cursor: '#f0f0f0',
              cursorAccent: '#f0f0f0',
              selectionBackground: 'rgba(255, 255, 255, 0.3)'
            }
    }
  })
})

onBeforeUnmount(() => {
  // Clean up ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (socket.value && socket.value.readyState === WebSocket.OPEN) {
    socket.value.close()
  }
  term.value = null
  api.closeHeartbeatWindow(heartbeatId)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleGlobalKeyDown)
  // Remove event listeners
  eventBus.off('executeTerminalCommand')
  eventBus.off('sendOrToggleAiFromTerminalForTab')
  eventBus.off('updateTerminalFont')
  eventBus.off('openSearch')
  eventBus.off('clearCurrentTerminal')
  eventBus.off('fontSizeIncrease')
  eventBus.off('fontSizeDecrease')
  document.removeEventListener('mouseup', hideSelectionButton)
})
// Get all commands for current machine
const getALlCmdList = () => {
  const authData2 = {
    uuid: terminalId
  }
  const auth2 = encrypt(authData2)
  getListCmd(auth2).then((res) => {
    commands.value = res.data
  })
}
// Initialize xterm terminal
const initTerminal = async () => {
  try {
    const config = await serviceUserConfig.getConfig()
    stashConfig = config
    const actualTheme = getActualTheme(config.theme)
    term.value = new Terminal({
      cursorBlink: true,
      scrollback: config.scrollBack,
      cursorStyle: config.cursorStyle || 'bar',
      fontSize: config.fontSize,
      fontFamily: config.fontFamily || 'Menlo, Monaco, "Courier New", Courier, monospace',
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
              background: 'var(--bg-color-secondary)',
              foreground: '#f0f0f0',
              cursor: '#f0f0f0',
              cursorAccent: '#f0f0f0',
              selectionBackground: 'rgba(255, 255, 255, 0.3)'
            }
    })

    fitAddon = new FitAddon()
    term.value.loadAddon(fitAddon)
    term.value.loadAddon(new WebLinksAddon())

    // Add search addon
    searchAddon.value = new SearchAddon()
    term.value.loadAddon(searchAddon.value)

    term.value.open(terminalElement.value)
    fitAddon.fit()
    term.value.focus()
  } catch (error) {
    console.error('终端初始化失败:', error)
  }
  const selectSuggestion = (suggestion) => {
    const msgType = 'TERMINAL_SUGGEST_DATA'
    socket.value.send(JSON.stringify({ id: terminalId, msgType, data: suggestion }))
    suggestions.value = []
    activeSuggestion.value = 0
    suggestionSelectionMode.value = false
  }
  // Handle user input
  term.value.onData((data) => {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      //   socket.value.send(data)
      // Shortcuts
      if (data === '\t') {
        // Tab key
        /* log removed */
        selectSuggestion(suggestions.value[activeSuggestion.value])
      } else if (data == '\x0b') {
        specialCode.value = true
        // Ctrl+K clear screen
        const msgType = 'TERMINAL_DATA'
        const data = 'clear\r'
        socket.value.send(JSON.stringify({ terminalId, msgType, data }))
      } else if (data == '\r') {
        const msgType = 'TERMINAL_DATA'
        const delData = String.fromCharCode(127)
        const aliasStore = aliasConfigStore()
        configStore.getUserConfig.quickVimStatus = 1
        let command = allDatas.value.highLightData.allContent
        const newCommand = aliasStore.getCommand(command) //
        if (stashConfig.aliasStatus === 1 && newCommand !== null) {
          data = delData.repeat(command.length) + newCommand + '\r'
          socket.value.send(JSON.stringify({ terminalId, msgType, data }))
        } else {
          socket.value.send(JSON.stringify({ terminalId, msgType, data }))
        }
        // New: Clear recommendations and lock after Enter
        suggestions.value = []
        activeSuggestion.value = 0
        suggestionSelectionMode.value = false
        isCommandExecuting = true
        setTimeout(() => {
          isCommandExecuting = false
        }, 300)
      } else if (data == '\x0c' || data == '\x04') {
        specialCode.value = true
        const msgType = 'TERMINAL_DATA'
        socket.value.send(JSON.stringify({ terminalId, msgType, data }))
      } else if (data == '\x03') {
        // Ctrl+C send interrupt signal
        specialCode.value = true
        const msgType = 'TERMINAL_DATA'
        socket.value.send(JSON.stringify({ terminalId, msgType, data }))
      } else if (data == '\x16') {
        // Ctrl+V execute paste
        navigator.clipboard
          .readText()
          .then((text) => {
            // Write clipboard content to terminal
            socket.value.send(JSON.stringify({ terminalId, msgType: 'TERMINAL_DATA', data: text }))
            term.value.focus()
          })
          .catch(() => {})
      } else {
        const msgType = 'TERMINAL_DATA'
        if (suggestions.value.length && suggestionSelectionMode.value && (data == '\u001b[A' || data == '\u001b[B')) {
          // Keyboard up/down to select suggestion items - only when in selection mode
          /* log removed */
          if (data == '\u001b[A') {
            // 上方向键：循环向上导航
            if (activeSuggestion.value <= 0) {
              activeSuggestion.value = suggestions.value.length - 1
            } else {
              activeSuggestion.value -= 1
            }
          } else if (data == '\u001b[B') {
            // 下方向键：循环向下导航
            if (activeSuggestion.value >= suggestions.value.length - 1) {
              activeSuggestion.value = 0
            } else {
              activeSuggestion.value += 1
            }
          }
          /* log removed */
        } else if (suggestions.value.length && (data == '\u001b[A' || data == '\u001b[B')) {
          // Up/Down keys when not in selection mode - pass through to system
          /* log removed */
          socket.value.send(JSON.stringify({ terminalId, msgType, data }))
        } else if (suggestions.value.length && data == '\u001b[C') {
          // Right arrow key - enter selection mode or select suggestion
          /* log removed */
          if (!suggestionSelectionMode.value) {
            // Enter selection mode and select first item
            /* log removed */
            suggestionSelectionMode.value = true
            activeSuggestion.value = 0
          } else {
            // Already in selection mode, select current suggestion
            /* log removed */
            selectSuggestion(suggestions.value[activeSuggestion.value])
          }
        } else if (suggestions.value.length && data == '\u001b[D') {
          // Left arrow key - exit selection mode
          /* log removed */
          suggestionSelectionMode.value = false
        } else if (suggestions.value.length && (data == '\u001b\[27~' || data == '\u001b')) {
          // Escape key - exit selection mode and clear suggestions
          /* log removed */
          suggestionSelectionMode.value = false
          suggestions.value = []
          activeSuggestion.value = 0
        } else {
          socket.value.send(JSON.stringify({ terminalId, msgType, data }))
        }
      }
    }
  })
  term.value.onKey(handleKeyInput)
  term.value.onSelectionChange(function () {
    if (term.value.hasSelection()) {
      copyText.value = term.value.getSelection()
    }
  })
  // onKey cannot listen to input method, add supplementary listener
  const textarea = term.value.element.querySelector('.xterm-helper-textarea')
  textarea.addEventListener('compositionend', (e) => {
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
  })
  if (terminalElement.value) {
    terminalElement.value.addEventListener('mouseup', (e) => {
      setTimeout(() => {
        /* log removed */

        if (term.value.hasSelection()) {
          const text = term.value.getSelection()
          const button = document.getElementById(`${infos.value.id}Button`)

          // Position button to mouse up position
          button.style.left = `${e.clientX + 10}px`
          button.style.top = `${e.clientY + 10}px`
          if (text.trim()) button.style.display = 'block'

          button.onclick = () => {
            eventBus.emit('openAiRight')
            nextTick(() => {
              eventBus.emit('chatToAi', text.trim())
            })
            term.value.clearSelection()
          }
        }
      }, 10)
    })
    document.addEventListener('mouseup', hideSelectionButton)
  }
}

// Connect WebSocket service
const connectWebsocket = () => {
  if (socket.value) return
  const auth = encrypt(authData)
  const wsUrl = 'ws://demo.chaterm.ai/v1/term-api/ws?&uuid=' + auth // Backend WebSocket address
  socket.value = new WebSocket(wsUrl)
  heartbeatId = `ws-${Date.now()}`
  socket.value.onopen = () => {
    const welcomeName = email.split('@')[0]
    const welcome = '\x1b[38;2;22;119;255m' + t('ssh.welcomeMessage', { username: welcomeName }) + ' \x1b[m\r\n'
    term.value.writeln(welcome)
    api.openHeartbeatWindow(heartbeatId, 5000)
    api.heartBeatTick(listenerHeartbeat)
    isConnect.value = true

    // Perform adaptive adjustment after connection is established
    setTimeout(() => {
      handleResize()
      getALlCmdList()
    }, 1000)
  }
  socket.value.binaryType = 'arraybuffer'
  socket.value.onmessage = (event) => {
    if (typeof event.data !== 'object') {
      // dispatch(term, event.data, socket.value)
      const o = JSON.parse(event.data)
      const componentInstance = componentRefs.value[infos.value.id]
      if (o.msgType == 'TERMINAL_AUTO_COMPLEMENT' && stashConfig.autoCompleteStatus == 1) {
        if (!isCommandExecuting) {
          if (o.autoComplement) {
            suggestions.value = o.autoComplement
            suggestionSelectionMode.value = false
            nextTick(() => {
              componentInstance?.updateSuggestionsPosition(term.value)
            })
          } else {
            suggestions.value = []
            suggestionSelectionMode.value = false
          }
        } else {
          // Do not show completion during command execution
          suggestions.value = []
          suggestionSelectionMode.value = false
        }
      }
      dispatch(term.value, event.data, socket.value)
    }
    if (term.value) {
      // term.write(enc.decode(event.data))
      // Initial input cursor at 0 or special keys
      if (!cursorStartX.value || specialCode.value) {
        if (typeof event.data == 'object') {
          term.value.write(enc.decode(event.data))
        } else {
          const data = JSON.parse(event.data)
          console.log(data, 'data')
          if (data && data.highLightData) {
            allDatas.value = data
          }
          if (data.highLightData && keyCodeArr.indexOf(keyCode.value) != -1) {
            if (stashConfig.highlightStatus == 1) {
              highlightSyntax(data.highLightData)
            } else {
              term.value.write(data)
            }
          }
        }
      } else {
        // Non-initial input and non-special keys
        if (typeof event.data !== 'object') {
          const data = JSON.parse(event.data)
          console.log(data, 'data2')
          allDatas.value = data
          if (data.highLightData) {
            if (stashConfig.highlightStatus == 1) {
              highlightSyntax(data.highLightData)
            } else {
              term.value.write(data.data)
            }
          }
        }
      }
    }
  }
  socket.value.onclose = () => {
    term.value?.writeln('\r\n连接已关闭。')
    api.closeHeartbeatWindow(heartbeatId)
    // setTimeout(connectWebsocket, 3000)
    socket.value = null
    isConnect.value = false
  }

  socket.value.onerror = () => {
    term.value.writeln('\r\n' + t('ssh.terminalConnectionError'))
  }
}
const listenerHeartbeat = (tackId) => {
  if (tackId === heartbeatId) {
    const msgType = 'PING'
    const data = ''
    socket.value.send(JSON.stringify({ terminalId, msgType, data }))
  }
}
// Handle window size changes
const handleResize = debounce(() => {
  if (fitAddon && term.value && terminalElement.value) {
    try {
      // Ensure terminal element is visible
      const rect = terminalElement.value.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        fitAddon.fit()
        const { cols, rows } = term.value

        // Send new terminal size to server
        if (socket.value && socket.value.readyState === WebSocket.OPEN) {
          socket.value.send(
            JSON.stringify({
              terminalId,
              msgType: 'TERMINAL_RESIZE',
              data: JSON.stringify({ cols, rows })
            })
          )
        }
      }
    } catch (error) {
      console.error('Failed to resize terminal:', error)
    }
  }
}, 100)
// Other components execute commands through buttons
const autoExecuteCode = (cmd) => {
  const msgType = 'TERMINAL_DATA'
  socket.value.send(JSON.stringify({ terminalId, msgType, data: cmd }))
}
const dispatch = (term, msgData, ws) => {
  if (msgData === undefined) {
    return
  }
  const msg = JSON.parse(msgData)
  const cols = term.cols
  const rows = term.rows
  const data = JSON.stringify({ cols, rows })
  const msgType = 'TERMINAL_INIT'
  switch (msg.msgType) {
    case 'CONNECT':
      ws.send(JSON.stringify({ terminalId, msgType, data }))
      break
    case 'CLOSE':
      ws.close()
      api.closeHeartbeatWindow(heartbeatId)
      break
    case 'PING':
      break
    case 'TERMINAL_ACTION_VIM':
      handleMessage(msg, terminalId)
      break
  }
}
const highlightSyntax = (allData) => {
  // All content, content before cursor
  const { allContent, beforeCursor } = allData
  // Command
  let command = ''
  // Parameters
  let arg = ''
  // Current cursor position
  const currentCursorX = cursorStartX.value + beforeCursor.length
  // First space position to split command and parameters
  const index = allContent.indexOf(' ')
  // Basic premise: command is split by first space, before is command, after is parameters
  // If there is content before cursor and has space, it means there is a command before cursor
  // If there is no command before cursor, need to find command in the entire content
  const i = allContent.indexOf(' ')
  if (i != -1) {
    // Has space, means there is a command, split
    command = allContent.slice(0, i)
    arg = allContent.slice(i)
  } else {
    // No space, means all is command
    command = allContent
    arg = ''
    // }
  }
  currentLine.value = allContent
  // Get current cursor line number
  // Clear previous markers
  activeMarkers.value.forEach((marker) => marker.dispose())
  activeMarkers.value = []
  const startY = currentLineStartY.value
  // Check if command matches
  const isValidCommand = commands.value.includes(command)
  // Highlight command
  if (command) {
    const commandMarker = term.value.registerMarker(startY)
    activeMarkers.value.push(commandMarker)
    term.value.write(`\x1b[${startY + 1};${cursorStartX.value + 1}H`)
    const colorCode = isValidCommand ? '38;2;24;144;255' : '31'
    term.value.write(`\x1b[${colorCode}m${command}\x1b[0m`)
    setTimeout(() => {
      term.value.write(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`)
    })
  }
  if (!arg) return
  // Highlight parameters
  if (arg.includes("'") || arg.includes('"') || arg.includes('(')) {
    // Input with closing symbols
    const afterCommandArr = processString(arg)
    let unMatchFlag = false
    for (let i = 0; i < afterCommandArr.length; i++) {
      if (afterCommandArr[i].type == 'unmatched') {
        term.value.write(`\x1b[${startY + 1};${cursorStartX.value + 1}H`)
        term.value.write(`\x1b[31m${allContent}\x1b[0m`)
        term.value.write(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`)
        unMatchFlag = true
      }
    }
    if (!unMatchFlag) {
      for (let i = 0; i < afterCommandArr.length; i++) {
        if (afterCommandArr[i].content == ' ') {
          term.value.write(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1 + afterCommandArr[i].startIndex}H`)
          term.value.write(`${afterCommandArr[i].content}\x1b[0m`)
        } else {
          term.value.write(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1 + afterCommandArr[i].startIndex}H`)
          const colorCode = afterCommandArr[i].type == 'matched' ? '38;2;250;173;20' : '38;2;126;193;255'
          term.value.write(`\x1b[${colorCode}m${afterCommandArr[i].content}\x1b[0m`)
        }
      }
    }
  } else {
    if (index == -1 && currentCursorX >= cursorStartX.value + command.length) {
      // No space and cursor at command end
      term.value.write(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`)
      term.value.write(`\x1b[38;2;126;193;255m${arg}\x1b[0m`)
      term.value.write(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`)
    } else if (currentCursorX < cursorStartX.value + command.length) {
      // Cursor in command middle
      term.value.write(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`)
      term.value.write(`\x1b[38;2;126;193;255m${arg}\x1b[0m`)
      term.value.write(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`)
    } else {
      // Cursor not in command range
      term.value.write(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`)
      term.value.write(`\x1b[38;2;126;193;255m${arg}\x1b[0m`)
      term.value.write(`\x1b[${cursorY.value + 1};${currentCursorX}H`)
    }
  }
}

// Process non-command strings
const processString = (str) => {
  const asymmetricClosing = [')', '}', ']']
  const symmetric = ['"', "'"]
  const opening = ['(', '{', '[']
  const pairs = {
    ')': '(',
    '}': '{',
    ']': '[',
    '"': '"',
    "'": "'"
  }
  const stack = []
  const result = []
  let lastIndex = -1 // Last processed character position
  // let lastType = null
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (asymmetricClosing.includes(c)) {
      if (stack.length > 0 && stack[stack.length - 1].symbol === pairs[c]) {
        const item = stack.pop()
        const startIndex = item.index
        if (lastIndex < startIndex - 1) {
          result.push({
            type: 'afterMatched',
            content: str.slice(lastIndex + 1, startIndex),
            startIndex: lastIndex + 1
          })
        }
        result.push({
          type: 'matched',
          startIndex,
          endIndex: i,
          content: pairs[c] + str.slice(startIndex + 1, i) + c
        })
        lastIndex = i
        // lastType = 'matched'
      } else {
        if (lastIndex < i - 1) {
          result.push({
            type: 'afterMatched',
            content: str.slice(lastIndex + 1, i),
            startIndex: lastIndex + 1
          })
        }
        result.push({ type: 'unmatched', index: i, content: c })
        lastIndex = i
        // lastType = 'unmatched'
      }
    } else if (symmetric.includes(c)) {
      if (stack.length > 0 && stack[stack.length - 1].symbol === c) {
        const item = stack.pop()
        const startIndex = item.index
        if (lastIndex < startIndex - 1) {
          result.push({
            type: 'afterMatched',
            content: str.slice(lastIndex + 1, startIndex),
            startIndex: lastIndex + 1
          })
        }
        result.push({
          type: 'matched',
          startIndex,
          endIndex: i,
          content: pairs[c] + str.slice(startIndex + 1, i) + c
        })
        lastIndex = i
        // lastType = 'matched'
      } else {
        if (lastIndex < i - 1) {
          result.push({
            type: 'afterMatched',
            content: str.slice(lastIndex + 1, i),
            startIndex: lastIndex + 1
          })
        }
        stack.push({ symbol: c, index: i })
        lastIndex = i // Update lastIndex, even for unmatched symbols
      }
    } else if (opening.includes(c)) {
      if (lastIndex < i - 1) {
        result.push({
          type: 'afterMatched',
          content: str.slice(lastIndex + 1, i),
          startIndex: lastIndex + 1
        })
      }
      stack.push({ symbol: c, index: i })
      lastIndex = i // Update lastIndex
    }
  }
  // Process ending text
  if (lastIndex < str.length - 1) {
    result.push({
      type: 'afterMatched',
      content: str.slice(lastIndex + 1),
      startIndex: lastIndex + 1
    })
  }

  // Process unmatched opening symbols
  while (stack.length > 0) {
    const item = stack.pop()
    result.push({
      type: 'unmatched',
      index: item.index,
      content: item.symbol
    })
  }
  return result
}
const handleKeyInput = (e) => {
  specialCode.value = false
  currentLineStartY.value = term.value._core.buffer.y
  const ev = e.domEvent
  const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey
  const buffer = term.value.buffer.active
  cursorX.value = buffer.cursorX
  cursorY.value = buffer.cursorY
  keyCode.value = ev.keyCode
  let index = 0

  // Cursor position when starting input on current line, 0 is initial state, should be same as current cursor, non-0 should be less than current cursor position
  if (cursorStartX.value == 0) {
    cursorStartX.value = cursorX.value
  } else {
    cursorX.value < cursorStartX.value ? (cursorStartX.value = cursorX.value) : ''
  }
  if (ev.keyCode === 13) {
    stashCursorX.value = 0
    // Enter
    currentLine.value = ''
    currentLineStartY.value = term.value._core.buffer.y + 1
    cursorStartX.value = 0
    // New: Clear recommendations after Enter
    suggestions.value = []
    activeSuggestion.value = 0
    suggestionSelectionMode.value = false
  } else if (ev.keyCode === 8) {
    // Delete
    specialCode.value = true
    index = cursorX.value - 1 - cursorStartX.value
    currentLine.value = currentLine.value.slice(0, index) + currentLine.value.slice(index + 1)
  } else if (ev.keyCode == 38 || ev.keyCode == 40) {
    // Up/down keys
    specialCode.value = true
  } else if (ev.keyCode == 37 || ev.keyCode == 39) {
    // Left arrow
    stashLine.value = JSON.parse(JSON.stringify(currentLine.value))
    specialCode.value = true
    // this.initList()
  } else if (printable) {
    // index = cursorX.value - cursorStartX.value
    // currentLine.value = `${currentLine.value.slice(0, index)}${e.key}${currentLine.value.slice(index)}`
  }
}

const openEditors = reactive([])
const submitData = async (filePath) => {
  const authData = {
    uuid: terminalId,
    filePath: filePath
  }
  const auth = decodeURIComponent(encrypt(authData))
  try {
    const response = await termFileContent({ uuid: auth })
    if (response.error && response.error !== '') {
      console.log('!ERR', response.error)
    } else {
      const existingEditor = openEditors.find((editor) => editor.filePath === filePath)
      if (!existingEditor) {
        // const rect = terminalElement.value.getBoundingClientRect()
        console.log(window.innerHeight, window.innerWidth, window.screenX, window.screenY)
        openEditors.push({
          filePath: filePath,
          visible: true,
          vimText: response.content,
          originVimText: response.content,
          action: response.action,
          vimEditorX: Math.round(window.innerWidth * 0.5) - Math.round(window.innerWidth * 0.7 * 0.5),
          vimEditorY: Math.round(window.innerHeight * 0.5) - Math.round(window.innerHeight * 0.7 * 0.5),
          contentType: response.contentType,
          vimEditorHeight: Math.round(window.innerHeight * 0.7),
          vimEditorWidth: Math.round(window.innerWidth * 0.7),
          loading: false,
          fileChange: false,
          saved: false,
          key: terminalId
        })
      } else {
        existingEditor.visible = true
        existingEditor.vimText = response.content
      }
    }
  } catch (error) {
    console.error('打开文件失败', error)
  }
}
//

const closeVimEditor = (data) => {
  const { filePath } = data
  const editor = openEditors.find((editor) => editor.filePath === filePath)
  if (editor.fileChange) {
    if (!editor.saved) {
      Modal.confirm({
        title: t('common.saveConfirmTitle'),
        content: t('common.saveConfirmContent', { filePath: editor.filePath }),
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        onOk() {
          handleSave({ filePath: editor.filePath, needClose: true })
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
    const index = openEditors.indexOf(editor)
    if (index !== -1) {
      openEditors.splice(index, 1)
    }
  }
}

const handleSave = async (data) => {
  const { filePath, needClose } = data
  const editor = openEditors.find((editor) => editor.filePath === filePath)
  const authData = {
    uuid: terminalId,
    filePath: filePath,
    content: editor.vimText
  }
  const auth = decodeURIComponent(encrypt(authData))
  try {
    if (editor.fileChange) {
      editor.loading = true
      const response = await termFileContentSave({ data: auth })
      if (response.error !== '') {
        notification.error({
          message: t('common.saveFailed'),
          class: 'notification-common'
        })
      } else {
        notification.success({
          message: t('common.saveSuccess')
        })
        // Close
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
    } else {
      notification.success({
        message: t('common.saveSuccess')
      })
    }
  } catch (error) {
    // Handle exception
    notification.error({
      message: t('common.saveFailed')
    })
  }
}

// // Function to handle messages
const handleMessage = (msg, terminalId) => {
  const regexPath = /^\s*\/[\w\-./&\u4E00-\u9FFF]+/g
  const matchPath = msg.data.match(regexPath)
  let filePath = ''
  const msgType = 'TERMINAL_DATA'
  if (matchPath) {
    filePath = matchPath[0]
    console.log(msgType, filePath)
    submitData(filePath)
    if (!openEditors.find((editor) => editor.filePath === filePath)) {
      const data = '\r'
      socket.value.send(
        JSON.stringify({
          terminalId,
          msgType,
          data
        })
      )
      // Call function directly, no need for that
      submitData(filePath)
    }
  } else {
    console.log('Pwd No match found.')
  }
}

// Right-click menu methods
const contextAct = (action) => {
  switch (action) {
    case 'paste':
      // Paste
      navigator.clipboard
        .readText()
        .then((text) => {
          // Write clipboard content to terminal
          socket.value.send(JSON.stringify({ terminalId, msgType: 'TERMINAL_DATA', data: text }))
          term.value.focus()
        })
        .catch(() => {})
      break
    case 'disconnect':
      socket.value.close()
      isConnect.value = false
      break
    case 'reconnect':
      // Reconnect
      connectWebsocket()
      break
    case 'newTerminal':
      emit('createNewTerm', props.serverInfo)
      // New terminal
      break
    case 'close':
      // Close
      socket.value.close()
      emit('closeTabInTerm', props.serverInfo.id)
      break
    default:
    case 'clearTerm':
      // Close
      // socket.value.close()
      term.value?.clear()
      break
    case 'shrotenName':
      // Close
      // socket.value.close()
      socket.value.send(JSON.stringify({ terminalId, msgType: 'TERMINAL_DATA', data: 'export PS1="[\\u@\\W]\\$"' }))
      socket.value.send(JSON.stringify({ terminalId, msgType: 'TERMINAL_DATA', data: '\r' }))
      term.value.focus()
      // sendData('export PS1="[\\u@\\W]\\$"')
      // sendData('\r')
      break
    case 'fontsizeLargen':
      if (term.value?.options) {
        term.value.options.fontSize = (term.value.options.fontSize ?? 12) + 1
      }
      break
    case 'fontsizeSmaller':
      if (term.value?.options) {
        term.value.options.fontSize = (term.value.options.fontSize ?? 12) - 1
      }
      break
    case 'fileManager':
      eventBus.emit('openUserTab', 'files')
      break
    // Unknown operation
  }
}
const hideSelectionButton = () => {
  const button = document.getElementById(`${infos.value.id}Button`)
  if (button) button.style.display = 'none'
}

const focus = () => {
  if (term.value) {
    term.value.focus()
  }
}

const handleGlobalKeyDown = (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

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

const openSearch = () => {
  showSearch.value = true
}

const closeSearch = () => {
  showSearch.value = false
  searchAddon.value?.clearDecorations()
  term.value?.focus()
}

defineExpose({
  handleResize,
  autoExecuteCode,
  term,
  focus,
  // Manually trigger adaptive adjustment
  triggerResize: () => {
    handleResize()
  }
})
</script>

<style lang="less" scoped>
.terminal-container {
  width: 100%;
  height: 100%;
  background-color: var(--bg-color-secondary);
  border-radius: 6px;
  overflow: hidden;
  padding: 4px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
  position: relative;
}

.terminal {
  width: 100%;
  height: 100%;
}

.terminal ::-webkit-scrollbar {
  width: 0px !important;
}

.select-button {
  position: fixed;
  display: none;
  z-index: 999;
  padding: 4px 8px;
  border-radius: 4px;
  color: white;
  border: none;
  font-size: 12px;
  cursor: pointer;
  background-color: #272727;
  border: 1px solid #4d4d4d;

  .main-text {
    color: white;
    font-size: 12px;
    font-weight: 500;
  }

  .shortcut-text {
    color: #888;
    font-size: 10px;
    margin-left: 4px;
    font-weight: 400;
  }

  &:hover {
    color: white !important;
    border: 1px solid #4d4d4d !important;

    .main-text {
      color: white !important;
    }

    .shortcut-text {
      color: #aaa !important;
    }
  }
}
</style>
