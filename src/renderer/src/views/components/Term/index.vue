<template>
  <div ref="terminalContainer" class="terminal-container">
    <div ref="terminalElement" class="terminal"></div>
    <!-- 考虑到后期分屏等操作，同一个机器会打开多次，这个ref需要独一无二 -->
    <SuggComp
      v-bind="{ ref: (el) => setRef(el, infos.uniqueKey) }"
      :uniqueKey="infos.uniqueKey"
      :suggestions="suggestions"
      :activeSuggestion="activeSuggestion"
    />
  </div>
</template>

<script setup>
import SuggComp from './suggestion.vue'
import { ref, onMounted, nextTick, onBeforeUnmount, defineProps } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { v4 as uuidv4 } from 'uuid'
import { encrypt } from '@/utils/util'
import 'xterm/css/xterm.css'
import { userInfoStore } from '@/store'
import { userConfigStore } from '@/store/userConfigStore'
import { getListCmd } from '@/api/asset/asset'
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
const pingInterval = ref(null) //ping定时器
const email = userInfoStore().userInfo.email
const name = userInfoStore().userInfo.name
const terminalElement = ref(null)
const terminalContainer = ref(null)
const terminalId = `${email.split('@')[0]}@${props.serverInfo.id}:${uuidv4()}`
console.log(terminalId, 'terminalIdterminalId')
// const terminalId = ``
const suggestions = ref([]) //返回的补全列表
const activeSuggestion = ref(0) //高亮的补全项
const socket = ref(null) //ws实例
let term = null //term实例
let fitAddon = null //
// 语法高亮相关
const enc = new TextDecoder('utf-8')
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

const authData = {
  email: email,
  // ip: '172.31.64.249',
  ip: props.serverInfo.id,
  uid: userInfoStore().userInfo.uid,
  organizationId: props.serverInfo.organizationId,
  terminalId: terminalId
}

onMounted(() => {
  initTerminal()
  connectWebsocket()
  window.addEventListener('resize', handleResize)
  terminalContainer.value.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  if (socket.value && socket.value.readyState === WebSocket.OPEN) {
    socket.value.close()
  }
  if (term) {
    term.dispose()
  }
  clearInterval(pingInterval.value)
  pingInterval.value = null
  window.removeEventListener('resize', handleResize)
})
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
const initTerminal = () => {
  term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontSize: 12,
    fontFamily: 'Menlo, Monaco, "Courier New", Courier, monospace',
    theme: {
      background: '#1a1a1a',
      foreground: '#f0f0f0'
    }
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())

  term.open(terminalElement.value)
  fitAddon.fit()
  const selectSuggestion = (suggestion) => {
    const msgType = 'TERMINAL_SUGGEST_DATA'
    socket.value.send(JSON.stringify({ id: terminalId, msgType, data: suggestion }))
    suggestions.value = []
    activeSuggestion.value = 0
  }
  // 处理用户输入
  term.onData((data) => {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      //   socket.value.send(data)
      if (data === '\t') {
        // Tab键
        selectSuggestion(suggestions.value[activeSuggestion.value])
      } else {
        const msgType = 'TERMINAL_DATA'
        // socket.value.send(JSON.stringify({ terminalId, msgType, data }))
        if (suggestions.value.length && (data == '\u001b[A' || data == '\u001b[B')) {
          data == '\u001b[A' && activeSuggestion.value > 0 ? (activeSuggestion.value -= 1) : ''
          data == '\u001b[B' && activeSuggestion.value < suggestions.value.length - 1
            ? (activeSuggestion.value += 1)
            : ''
        } else {
          socket.value.send(JSON.stringify({ terminalId, msgType, data }))
        }
      }
    }
  })
  term.onKey(handleKeyInput)
}

// 连接WebSocket服务
const connectWebsocket = () => {
  if (socket.value) return
  const auth = encrypt(authData)
  const wsUrl = 'ws://47.83.241.209:8088/ws?&uuid=' + auth // 后端WebSocket地址
  socket.value = new WebSocket(wsUrl)
  socket.value.onopen = () => {
    let welcome = '\x1b[1;32m' + name + ', 欢迎您使用CTM \x1b[m\r\n'
    if (configStore.getUserConfig.language == 'en-US') {
      welcome = '\x1b[1;32m' + email.split('@')[0] + ', Welcome to use CTM \x1b[m\r\n'
    }
    term.writeln(welcome)
    pingInterval.value = setInterval(() => {
      const msgType = 'PING'
      const data = ''
      socket.value.send(JSON.stringify({ terminalId, msgType, data }))
    }, 5000)
    setTimeout(() => {
      getALlCmdList()
    },1000)
  }
  socket.value.binaryType = 'arraybuffer'
  socket.value.onmessage = (event) => {
    if (typeof event.data !== 'object') {
      // dispatch(term, event.data, socket.value)
      const o = JSON.parse(event.data)
      const componentInstance = componentRefs.value[infos.value.uniqueKey]
      if (o.msgType == 'TERMINAL_AUTO_COMPLEMENT') {
        o.autoComplement
          ? ((suggestions.value = o.autoComplement),
            nextTick(() => {
              componentInstance?.updateSuggestionsPosition(term)
            }))
          : (suggestions.value = [])
      }
      dispatch(term, event.data, socket.value)
    }
    if (term) {
      // term.write(enc.decode(event.data))
      //初始输入光标为0时||特殊按键
      if (!cursorStartX.value || specialCode.value) {
        if (typeof event.data == 'object') {
          term.write(enc.decode(event.data))
        } else {
          const data = JSON.parse(event.data)
          if (data.highLightData && keyCodeArr.indexOf(keyCode.value) != -1) {
            highlightSyntax(data.highLightData)
          }
          // if (data.highLightData ) {
          //   that.highlightSyntax(data.highLightData)
          // }
        }
      } else {
        //非初始输入且非特殊按键
        if (typeof event.data !== 'object') {
          const data = JSON.parse(event.data)
          console.log(data, '22222')

          if (data.highLightData) {
            highlightSyntax(data.highLightData)
          }
        }
      }
    }
  }
  socket.value.onclose = () => {
    clearInterval(pingInterval.value)
    pingInterval.value = null
    term.writeln('\r\n连接已关闭。')
    // setTimeout(connectWebsocket, 3000)
    socket.value = null
  }

  socket.value.onerror = () => {
    term.writeln('\r\n连接错误。请检查终端服务器是否运行。')
  }
}

// 处理窗口大小变化
const handleResize = () => {
  fitAddon.fit()
  // 向服务器发送新的终端大小
  // if (socket.value && socket.value.readyState === WebSocket.OPEN) {
  //   socket.value.send(
  //     JSON.stringify({
  //       type: 'resize',
  //       cols: term.cols,
  //       rows: term.rows
  //     })
  //   )
  // }
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
      clearInterval(pingInterval.value)
      pingInterval.value = null
      break
    case 'PING':
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
    const commandMarker = term.registerMarker(startY)
    activeMarkers.value.push(commandMarker)
    term.write(`\x1b[${startY + 1};${cursorStartX.value + 1}H`)
    const colorCode = isValidCommand ? '38;2;24;144;255' : '31'
    console.log(command, 'command')
    term.write(`\x1b[${colorCode}m${command}\x1b[0m`)
    setTimeout(() => {
      term.write(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`)
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
        console.log('unmatchedunmatched')
        term.write(`\x1b[${startY + 1};${cursorStartX.value + 1}H`)
        // term.write(`\x1b[31m${currentLine.value}\x1b[0m`)
        term.write(`\x1b[31m${allContent}\x1b[0m`)
        term.write(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`)
        unMatchFlag = true
      }
    }
    if (!unMatchFlag) {
      console.log('matchedmatched')
      console.log(afterCommandArr, 'afterCommandArr')
      for (let i = 0; i < afterCommandArr.length; i++) {
        if (afterCommandArr[i].content == ' ') {
          term.write(
            `\x1b[${startY + 1};${cursorStartX.value + command.length + 1 + afterCommandArr[i].startIndex}H`
          )
          term.write(`${afterCommandArr[i].content}\x1b[0m`)
        } else {
          term.write(
            `\x1b[${startY + 1};${cursorStartX.value + command.length + 1 + afterCommandArr[i].startIndex}H`
          )
          const colorCode =
            afterCommandArr[i].type == 'matched' ? '38;2;250;173;20' : '38;2;126;193;255'
          term.write(`\x1b[${colorCode}m${afterCommandArr[i].content}\x1b[0m`)
        }
      }
    }
  } else {
    console.log('普通输入')
    if (index == -1 && currentCursorX >= cursorStartX.value + command.length) {
      // 没有空格 且 光标在命令末尾
      console.log(arg, 'arg111')
      term.write(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`)
      term.write(`\x1b[38;2;126;193;255m${arg}\x1b[0m`)
      term.write(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`)
    } else if (currentCursorX < cursorStartX.value + command.length) {
      // 光标在命令中间
      console.log(arg, 'arg222')
      term.write(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`)
      term.write(`\x1b[38;2;126;193;255m${arg}\x1b[0m`)
      term.write(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`)
    } else {
      // 光标不在命令范围内
      console.log(arg, 'arg333')
      term.write(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`)
      term.write(`\x1b[38;2;126;193;255m${arg}\x1b[0m`)
      term.write(`\x1b[${cursorY.value + 1};${currentCursorX}H`)
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
  let lastType = null
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
        lastType = 'matched'
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
        lastType = 'unmatched'
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
        lastType = 'matched'
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
  currentLineStartY.value = term._core.buffer.y
  const ev = e.domEvent
  const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey
  const buffer = term.buffer.active
  cursorX.value = buffer.cursorX
  cursorY.value = buffer.cursorY
  keyCode.value = ev.keyCode
  let index = 0
  // 当前行开始输入时的光标ddd位置，0是初始状态，需要跟当前光标一样，非0时需要小于当前光标位置
  if (cursorStartX.value == 0) {
    cursorStartX.value = cursorX.value
  } else {
    cursorX.value < cursorStartX.value ? (cursorStartX.value = cursorX.value) : ''
  }
  if (ev.keyCode === 13) {
    stashCursorX.value = 0
    // Enter
    currentLine.value = ''
    currentLineStartY.value = term._core.buffer.y + 1
    cursorStartX.value = 0
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
    console.log(currentLine.value, 'currentLine.value')
    stashLine.value = JSON.parse(JSON.stringify(currentLine.value))
    console.log(stashLine.value, 'stashLine.value')
    specialCode.value = true
    // this.initList()
  } else if (printable) {
    // index = cursorX.value - cursorStartX.value
    // currentLine.value = `${currentLine.value.slice(0, index)}${e.key}${currentLine.value.slice(index)}`
  }
}
defineExpose({
  handleResize
})
</script>

<style scoped>
.terminal-container {
  width: 100%;
  height: 100%;
  background-color: #1a1a1a;
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
</style>
