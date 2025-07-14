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
const emit = defineEmits(['closeTabInTerm', 'createNewTerm'])
import eventBus from '@/utils/eventBus'
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
// 用于存储引用的对象
const componentRefs = ref({})
// 设置动态引用的函数
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
const suggestions = ref([]) //返回的补全列表
const activeSuggestion = ref(0) //高亮的补全项
let isCommandExecuting = false // 命令执行锁，防止回车后补全窗口又弹出
const socket = ref(null) //ws实例
const term = ref(null) //term实例
let fitAddon = null //
const api = window.api
let heartbeatId = null // 心跳ID
const copyText = ref('')
// 搜索相关
const showSearch = ref(false)
const searchAddon = ref(null)
// 语法高亮相关
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
// 优化的防抖函数，支持立即执行、动态延迟和拖拽模式
const debounce = (func, wait, immediate = false) => {
  let timeout
  let isFirstCall = true
  let isDragging = false
  let lastCallTime = 0

  return function executedFunction(...args) {
    const now = Date.now()
    const timeSinceLastCall = now - lastCallTime
    lastCallTime = now

    // 检测是否在拖拽过程中（连续快速调用）
    isDragging = timeSinceLastCall < 50

    const later = () => {
      clearTimeout(timeout)
      timeout = null
      if (!immediate) func(...args)
      isDragging = false
    }

    const callNow = immediate && !timeout
    clearTimeout(timeout)

    // 拖拽时使用更短的延迟，首次调用立即执行
    let dynamicWait
    if (isDragging) {
      dynamicWait = 5 // 拖拽时极短延迟
    } else if (isFirstCall) {
      dynamicWait = 0 // 首次立即执行
    } else {
      dynamicWait = wait // 正常延迟
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
  // 如果没有配置，返回默认值
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  return isMac ? '⌘L' : 'Ctrl+L'
})

onMounted(() => {
  initTerminal()
  connectWebsocket()

  // 使用 ResizeObserver 监听终端容器的尺寸变化
  if (terminalContainer.value) {
    resizeObserver = new ResizeObserver(
      debounce(
        () => {
          handleResize()
        },
        30,
        true
      ) // 立即执行首次调用，后续30ms防抖
    )
    resizeObserver.observe(terminalContainer.value)
  }

  // 保留 window resize 监听作为备用
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleGlobalKeyDown)

  // 初始化完成后进行一次自适应调整
  nextTick(() => {
    setTimeout(() => {
      handleResize()
    }, 100)
  })

  // 监听 executeTerminalCommand 事件
  eventBus.on('executeTerminalCommand', (command) => {
    autoExecuteCode(command)
  })

  // 监听 getActiveTerminalSelection 事件
  eventBus.on('sendOrToggleAiFromTerminal', () => {
    // 检查焦点是否在终端或者终端容器内
    const activeElement = document.activeElement
    const terminalContainer = terminalElement.value?.closest('.terminal-container')
    const isTerminalFocused =
      activeElement === term.value?.textarea ||
      terminalContainer?.contains(activeElement) ||
      activeElement?.classList.contains('xterm-helper-textarea')

    // 优先检查是否有选中文本，但只有在终端有焦点时才发送
    if (term.value && term.value.hasSelection() && isTerminalFocused) {
      const selectedText = term.value.getSelection().trim()
      if (selectedText) {
        // 如果终端有选中文本且终端有焦点，总是发送到AI并确保侧边栏打开
        eventBus.emit('openAiRight')
        nextTick(() => {
          const formattedText = `Terminal output:\n\`\`\`\n${selectedText}\n\`\`\``
          eventBus.emit('chatToAi', formattedText)
        })
        return
      }
    }

    // 如果没有选中文本或焦点不在终端，则切换侧边栏状态
    eventBus.emit('toggleSideBar', 'right')
  })
})

onBeforeUnmount(() => {
  // 清理 ResizeObserver
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
  // 移除事件监听
  eventBus.off('executeTerminalCommand')
  eventBus.off('sendOrToggleAiFromTerminal')
  document.removeEventListener('mouseup', hideSelectionButton)
})
// 获取当前机器所有命令
const getALlCmdList = () => {
  const authData2 = {
    uuid: terminalId
  }
  const auth2 = encrypt(authData2)
  getListCmd(auth2).then((res) => {
    commands.value = res.data
  })
}
// 初始化xterm终端
const initTerminal = async () => {
  try {
    const config = await serviceUserConfig.getConfig()
    stashConfig = config
    term.value = new Terminal({
      cursorBlink: true,
      scrollback: config.scrollBack,
      cursorStyle: config.cursorStyle || 'bar',
      fontSize: config.fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", Courier, monospace',
      theme: {
        background: '#141414',
        foreground: '#f0f0f0'
      }
    })

    fitAddon = new FitAddon()
    term.value.loadAddon(fitAddon)
    term.value.loadAddon(new WebLinksAddon())

    // 添加搜索插件
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
  }
  // 处理用户输入
  term.value.onData((data) => {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      //   socket.value.send(data)
      // 快捷键
      if (data === '\t') {
        // Tab键
        selectSuggestion(suggestions.value[activeSuggestion.value])
      } else if (data == '\x0b') {
        specialCode.value = true
        // Ctrl+K 清屏
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
        // 新增：回车后清空推荐并加锁
        suggestions.value = []
        activeSuggestion.value = 0
        isCommandExecuting = true
        setTimeout(() => {
          isCommandExecuting = false
        }, 300)
      } else if (data == '\x0c' || data == '\x04') {
        specialCode.value = true
        const msgType = 'TERMINAL_DATA'
        socket.value.send(JSON.stringify({ terminalId, msgType, data }))
      } else if (data == '\x03') {
        // Ctrl+C 发送中断信号
        specialCode.value = true
        const msgType = 'TERMINAL_DATA'
        socket.value.send(JSON.stringify({ terminalId, msgType, data }))
      } else if (data == '\x16') {
        // Ctrl+V 执行粘贴
        navigator.clipboard
          .readText()
          .then((text) => {
            // 将剪贴板的内容写入到终端
            socket.value.send(JSON.stringify({ terminalId, msgType: 'TERMINAL_DATA', data: text }))
            term.value.focus()
          })
          .catch(() => {})
      } else {
        const msgType = 'TERMINAL_DATA'
        if (suggestions.value.length && (data == '\u001b[A' || data == '\u001b[B')) {
          // 键盘上下选中提示项目
          data == '\u001b[A' && activeSuggestion.value > 0 ? (activeSuggestion.value -= 1) : ''
          data == '\u001b[B' && activeSuggestion.value < suggestions.value.length - 1 ? (activeSuggestion.value += 1) : ''
          data == '\u001b[B' && activeSuggestion.value < suggestions.value.length - 1 ? (activeSuggestion.value += 1) : ''
        } else if (suggestions.value.length && data == '\u001b[C') {
          selectSuggestion(suggestions.value[activeSuggestion.value])
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
  //onKey监听不到输入法，补充监听
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
        console.log('select')

        if (term.value.hasSelection()) {
          const text = term.value.getSelection()
          const button = document.getElementById(`${infos.value.id}Button`)

          // 定位按钮到鼠标抬起位置
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

// 连接WebSocket服务
const connectWebsocket = () => {
  if (socket.value) return
  const auth = encrypt(authData)
  const wsUrl = 'ws://demo.chaterm.ai/v1/term-api/ws?&uuid=' + auth // 后端WebSocket地址
  socket.value = new WebSocket(wsUrl)
  heartbeatId = `ws-${Date.now()}`
  socket.value.onopen = () => {
    let welcome = '\x1b[38;2;22;119;255m' + name + ', 欢迎您使用智能堡垒机Chaterm \x1b[m\r\n'
    if (configStore.getUserConfig.language == 'en-US') {
      welcome = '\x1b[38;2;22;119;255m' + email.split('@')[0] + ', Welcome to use Chaterm \x1b[m\r\n'
    }
    term.value.writeln(welcome)
    api.openHeartbeatWindow(heartbeatId, 5000)
    api.heartBeatTick(listenerHeartbeat)
    isConnect.value = true

    // 连接建立后进行自适应调整
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
          o.autoComplement
            ? ((suggestions.value = o.autoComplement),
              nextTick(() => {
                componentInstance?.updateSuggestionsPosition(term.value)
              }))
            : (suggestions.value = [])
        } else {
          // 命令执行期间不显示补全
          suggestions.value = []
        }
      }
      dispatch(term.value, event.data, socket.value)
    }
    if (term.value) {
      // term.write(enc.decode(event.data))
      //初始输入光标为0时||特殊按键
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
        //非初始输入且非特殊按键
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
    term.value.writeln('\r\n连接错误。请检查终端服务器是否运行。')
  }
}
const listenerHeartbeat = (tackId) => {
  if (tackId === heartbeatId) {
    const msgType = 'PING'
    const data = ''
    socket.value.send(JSON.stringify({ terminalId, msgType, data }))
  }
}
// 处理窗口大小变化
const handleResize = debounce(() => {
  if (fitAddon && term.value && terminalElement.value) {
    try {
      // 确保终端元素可见
      const rect = terminalElement.value.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        fitAddon.fit()
        const { cols, rows } = term.value

        // 向服务器发送新的终端大小
        if (socket.value && socket.value.readyState === WebSocket.OPEN) {
          socket.value.send(
            JSON.stringify({
              terminalId,
              msgType: 'TERMINAL_RESIZE',
              data: JSON.stringify({ cols, rows })
            })
          )
        }
        console.log(`Terminal resized to: ${cols}x${rows}`)
      }
    } catch (error) {
      console.error('Failed to resize terminal:', error)
    }
  }
}, 100)
// 别的组件通过按钮执行命令
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
  // 所有内容 光标前内容
  const { allContent, beforeCursor } = allData
  //命令
  let command = ''
  //参数
  let arg = ''
  //当前光标位置
  const currentCursorX = cursorStartX.value + beforeCursor.length
  //首个空格位置 用来分割命令和参数
  const index = allContent.indexOf(' ')
  // 大前提 命令以第一个空格切割 前为命令 后为参数
  // 如果光标前有内容 且有空格，表示光标前内容有命令
  // 光标前没有命令，需要在整段内容中找命令
  const i = allContent.indexOf(' ')
  if (i != -1) {
    // 有空格 代表有命令 切割
    command = allContent.slice(0, i)
    arg = allContent.slice(i)
  } else {
    // 无空格 代表全是命令
    command = allContent
    arg = ''
    // }
  }
  currentLine.value = allContent
  // 获取当前光标所在的行号
  // 清除之前的标记
  activeMarkers.value.forEach((marker) => marker.dispose())
  activeMarkers.value = []
  const startY = currentLineStartY.value
  // 检查命令是否匹配
  const isValidCommand = commands.value.includes(command)
  // 高亮命令
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
  // 高亮参数
  if (arg.includes("'") || arg.includes('"') || arg.includes('(')) {
    // 带闭合符号的输入
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
      // 没有空格 且 光标在命令末尾
      term.value.write(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`)
      term.value.write(`\x1b[38;2;126;193;255m${arg}\x1b[0m`)
      term.value.write(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`)
    } else if (currentCursorX < cursorStartX.value + command.length) {
      // 光标在命令中间
      term.value.write(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`)
      term.value.write(`\x1b[38;2;126;193;255m${arg}\x1b[0m`)
      term.value.write(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`)
    } else {
      // 光标不在命令范围内
      term.value.write(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`)
      term.value.write(`\x1b[38;2;126;193;255m${arg}\x1b[0m`)
      term.value.write(`\x1b[${cursorY.value + 1};${currentCursorX}H`)
    }
  }
}

// 对 非命令字符串进行处理
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
  let lastIndex = -1 // 上一个处理的字符位置
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
            startIndex: i + 1
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
            startIndex: i + 1
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
        lastIndex = i // 更新 lastIndex，即使是未匹配的符号
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
      lastIndex = i // 更新 lastIndex
    }
  }
  // 处理末尾文本
  if (lastIndex < str.length - 1) {
    result.push({
      type: 'afterMatched',
      content: str.slice(lastIndex + 1),
      startIndex: lastIndex + 1
    })
  }

  // 处理未匹配的开符号
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

  // 当前行开始输入时的光标的位置，0是初始状态，需要跟当前光标一样，非0时需要小于当前光标位置
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
    // 新增：回车后清空推荐
    suggestions.value = []
    activeSuggestion.value = 0
  } else if (ev.keyCode === 8) {
    // 删除
    specialCode.value = true
    index = cursorX.value - 1 - cursorStartX.value
    currentLine.value = currentLine.value.slice(0, index) + currentLine.value.slice(index + 1)
  } else if (ev.keyCode == 38 || ev.keyCode == 40) {
    //上下按键
    specialCode.value = true
  } else if (ev.keyCode == 37 || ev.keyCode == 39) {
    // 左箭头
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
        content: `您想将更改保存到 ${editor.filePath} 吗？`,
        okText: '确定',
        cancelText: '取消',
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
          message: '保存失败！',
          class: 'notification-common'
        })
      } else {
        notification.success({
          message: '保存成功'
        })
        // 关闭
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
        message: '保存成功'
      })
    }
  } catch (error) {
    // 处理异常
    notification.error({
      message: '保存失败！'
    })
  }
}

// // 处理消息的函数
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
      // 直接调用函数，不需要 that
      submitData(filePath)
    }
  } else {
    console.log('Pwd No match found.')
  }
}

// 右键菜单方法
const contextAct = (action) => {
  switch (action) {
    case 'paste':
      // 粘贴
      navigator.clipboard
        .readText()
        .then((text) => {
          // 将剪贴板的内容写入到终端
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
      // 重新连接
      connectWebsocket()
      break
    case 'newTerminal':
      emit('createNewTerm', props.serverInfo)
      // 新终端
      break
    case 'close':
      // 关闭
      socket.value.close()
      emit('closeTabInTerm', props.serverInfo.id)
      break
    default:
    case 'clearTerm':
      // 关闭
      // socket.value.close()
      term.value?.clear()
      break
    case 'shrotenName':
      // 关闭
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
    // 未知操作
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
  if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'f') {
    e.preventDefault()
    e.stopPropagation()
    openSearch()
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
  // 手动触发自适应调整
  triggerResize: () => {
    handleResize()
  }
})
</script>

<style lang="less" scoped>
.terminal-container {
  width: 100%;
  height: 100%;
  background-color: #141414;
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
