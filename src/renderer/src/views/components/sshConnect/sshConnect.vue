<template>
  <div
    ref="terminalContainer"
    class="terminal-container"
  >
    <div
      ref="terminalElement"
      class="terminal"
    ></div>
  </div>

  <div
    v-for="editor in openEditors"
    v-show="editor?.visible"
    :key="editor?.filePath"
  >
    <EditorCode
      :editor="editor"
      @close-vim-editor="closeVimEditor"
      @handle-save="handleSave"
    />
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, PropType, reactive } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { defineEmits, defineExpose } from 'vue/dist/vue'
import type { editorData } from '@/views/components/Term/Editor/dragEditor.vue'
import { LanguageMap } from '@/views/components/Term/Editor/languageMap'
import EditorCode from '@/views/components//Term/Editor/dragEditor.vue'
import { Modal, notification } from 'ant-design-vue'
import { aliasConfigStore } from '@/store/aliasConfigStore'
import { userConfigStore } from '@/services/userConfigStoreService'
import { v4 as uuidv4 } from 'uuid'
import { userInfoStore } from '@/store/index'
import eventBus from '@/utils/eventBus'
import { useCurrentCwdStore } from '@/store/currentCwdStore'

const props = defineProps({
  connectData: {
    type: Object as PropType<sshConnectData>,
    default: () => ({})
  }
})

export interface sshConnectData {
  uuid: string
  ip: string
  port: number
  username: string
  password: string
  privateKey: string
  authType: string
  passphrase: string
}

const isConnected = ref(false)
const terminal = ref<Terminal | null>(null)
const fitAddon = ref<FitAddon | null>(null)
const connectionId = ref('')
const connectionHasSudo = ref(false)
const cleanupListeners = ref<Array<() => void>>([])
const terminalElement = ref(null)
const terminalContainer = ref(null)
const cursorStartX = ref(0)
const currentCwd = ref('')
const api = window.api as any

const userConfig = ref({
  aliasStatus: 2,
  quickVimStatus: 2
})

const currentCwdStore = useCurrentCwdStore()

const loadUserConfig = async () => {
  try {
    const config = await userConfigStore.getConfig()
    if (config) {
      userConfig.value = config
    }
  } catch (error) {
    console.error('Failed to load user config:', error)
  }
}

onMounted(async () => {
  await loadUserConfig()
  terminal.value = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: 12,
    fontFamily: 'Menlo, Monaco, "Courier New", Courier, monospace',
    theme: {
      background: '#141414',
      foreground: '#f0f0f0'
    }
  })

  fitAddon.value = new FitAddon()
  terminal.value.loadAddon(fitAddon.value)
  if (terminalElement.value) {
    terminal.value.open(terminalElement!.value)
  }
  fitAddon?.value.fit()

  const core = (terminal.value as any)._core
  const renderService = core._renderService
  const originalWrite = terminal.value.write.bind(terminal.value)
  terminal.value.write = function (data: string | Uint8Array): void {
    // 保存当前渲染状态
    const originalRequestRefresh = renderService.refreshRows.bind(renderService)
    const originalTriggerRedraw = renderService._renderDebouncer.refresh.bind(
      renderService._renderDebouncer
    )
    // 替换渲染
    renderService.refreshRows = () => {}
    renderService._renderDebouncer.refresh = () => {}
    // 解析
    originalWrite(data)

    updateTerminalState()

    // console.log(
    //   '完整命令:',
    //   terminalState.value.content,
    //   '，指针前命令:',
    //   terminalState.value.beforeCursor
    // )
    // 恢复渲染
    renderService.refreshRows = originalRequestRefresh
    renderService._renderDebouncer.refresh = originalTriggerRedraw
    renderService.refreshRows(0, core._bufferService.rows - 1)
  }

  window.addEventListener('resize', handleResize)
  connectSSH()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)

  // 清理IPC监听器
  cleanupListeners.value.forEach((cleanup) => cleanup())

  if (isConnected.value) {
    disconnectSSH()
  }
})
const getFileExt = (filePath: string) => {
  const idx = filePath.lastIndexOf('.')
  if (idx === -1) return '' // 没有扩展名
  return filePath.slice(idx).toLowerCase()
}
const parseVimLine = (str) => {
  const lines = str.split(/\r?\n/) // 同时处理 \n 和 \r\n 换行符
  if (lines.length > 0) {
    const fileName = lines[0].split('cat')[1].split('#Chaterm:vim')[0].trim()
    const contentType = getFileExt(fileName) ? getFileExt(fileName) : '.python'
    if (str.indexOf('No such file or directory') !== -1) {
      return {
        checkStatus: lines[0].trim().endsWith('#Chaterm:vim'),
        lastLine: '\r\n' + lines[lines.length - 1],
        content: [''],
        filePath: fileName,
        contentType: LanguageMap[contentType],
        action: 'create'
      }
    } else {
      return {
        checkStatus: lines[0].trim().endsWith('#Chaterm:vim'),
        lastLine: '\r\n' + lines[lines.length - 1],
        content: lines.length >= 3 ? lines.slice(1, -1) : [''],
        filePath: fileName,
        contentType: LanguageMap[contentType],
        action: 'editor'
      }
    }
  }

  return {
    checkStatus: false,
    lastLine: '',
    content: '',
    filePath: '',
    contentType: '',
    action: ''
  }
}

const openEditors = reactive<editorData[]>([])
const closeVimEditor = (data) => {
  const { filePath } = data
  const editor = openEditors.find((editor) => editor?.filePath === filePath)
  if (editor?.fileChange) {
    if (!editor?.saved) {
      Modal.confirm({
        content: `您想将更改保存到 ${editor?.filePath} 吗？`,
        okText: '确定',
        cancelText: '取消',
        onOk() {
          handleSave({ filePath: editor?.filePath, needClose: true })
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
  const { filePath, needClose } = data
  const editor = openEditors.find((editor) => editor?.filePath === filePath)
  if (editor?.fileChange) {
    const newContent = editor.vimText.replace(/\r\n/g, '\n')
    let cmd = `cat <<'EOFChaterm:save' > ${filePath}\n${newContent}\nEOFChaterm:save\n`
    if (connectionHasSudo.value) {
      cmd = `sudo bash -c '${cmd}'`
    }
    sendMarkedData(cmd, 'Chaterm:save')
  }
  // 关闭
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

  notification.success({
    message: '保存成功'
  })
}

const createEditor = (filePath, content, action, contentType) => {
  const existingEditor = openEditors.find((editor) => editor.filePath === filePath)
  if (!existingEditor) {
    // const rect = terminalElement.value.getBoundingClientRect()
    openEditors.push({
      filePath: filePath,
      visible: true,
      vimText: content,
      originVimText: content,
      action: action,
      vimEditorX: Math.round(window.innerWidth * 0.5) - Math.round(window.innerWidth * 0.7 * 0.5),
      vimEditorY: Math.round(window.innerHeight * 0.5) - Math.round(window.innerHeight * 0.7 * 0.5),
      contentType: contentType,
      vimEditorHeight: Math.round(window.innerHeight * 0.7),
      vimEditorWidth: Math.round(window.innerWidth * 0.7),
      loading: false,
      fileChange: false,
      saved: false,
      key: filePath
    } as editorData)
  } else {
    existingEditor.visible = true
    existingEditor.vimText = content
  }
}

const handleResize = () => {
  if (fitAddon.value) {
    fitAddon.value.fit()
  }
}

const emit = defineEmits(['connectSSH', 'disconnectSSH'])

const connectSSH = async () => {
  // 连接
  try {
    // 获取私钥或密码
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
      privateKey.value =
        props.connectData.authType === 'privateKey' ? props.connectData.privateKey : ''
      passphrase.value = props.connectData.passphrase || ''
    }

    const email = userInfoStore().userInfo.email
    const name = userInfoStore().userInfo.name
    let welcome = '\x1b[38;2;22;119;255m' + name + ', 欢迎您使用智能堡垒机Chaterm \x1b[m\r\n'
    if (userConfig.value.language === 'en-US') {
      welcome =
        '\x1b[38;2;22;119;255m' + email.split('@')[0] + ', Welcome to use Chaterm \x1b[m\r\n'
    }
    terminal.value?.writeln(welcome)
    // terminal.value?.writeln(`尝试连接 ${props.connectData.ip}:${props.connectData.port}...`)
    connectionId.value = `${email.split('@')[0]}@${props.connectData.ip}:local:${uuidv4()}`

    const result = await api.connect({
      id: connectionId.value,
      host: props.connectData.ip,
      port: props.connectData.port,
      username: props.connectData.username,
      password: password.value,
      privateKey: privateKey.value,
      passphrase: passphrase.value
    })
    const connectReadyData = await api.connectReadyData(connectionId.value)
    connectionHasSudo.value = connectReadyData?.hasSudo
    if (result.status === 'connected') {
      terminal.value?.writeln(`Connecting to ${props.connectData.ip}`)

      // 启动shell会话
      await startShell()

      // 设置输入处理
      setupTerminalInput()
    } else {
      terminal.value?.writeln(`错误: ${result.message}`)
    }
  } catch (error: any) {
    terminal.value?.writeln(`连接失败: ${error.message || '未知错误'}`)
  }
  // emit('connectSSH', { isConnected: isConnected })
}

const terminalState = ref({
  content: '',
  cursorPosition: {
    row: 0,
    col: 0
  },
  beforeCursor: ''
})

const substrWidth = (str: string, startWidth: number, endWidth?: number): string => {
  let currentWidth = 0
  let startIndex = 0
  let endIndex = str.length

  // 开始
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
        // 避免切割中文字符
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

  // 结束
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
    // 特殊符号跳过
    if (code > 0xffff) {
      i++
    }
  }

  return str.substring(startIndex, endIndex)
}

const setupTerminalStateTracking = () => {
  if (!terminal.value) return

  // 在输入和输出后更新状态
  terminal.value.onData(() => {
    // 短暂延迟确保渲染完成
    setTimeout(updateTerminalState, 10)
  })

  // 监听终端渲染事件
  terminal.value.onRender(() => {
    updateTerminalState()
  })

  // 监听光标移动
  terminal.value.onCursorMove(() => {
    updateTerminalState()
  })
}

// 更新终端状态
const updateTerminalState = () => {
  const term = terminal.value
  if (!term) return
  try {
    const buffer = (terminal as any).value._core._bufferService.buffer
    const cursorX = buffer.x
    const cursorY = buffer.y

    // 当前行开始输入时的光标的位置
    if (cursorStartX.value === 0) {
      cursorStartX.value = cursorX
    } else {
      cursorStartX.value = Math.min(cursorStartX.value, cursorX)
    }
    const lineContent = buffer.lines
      .get(terminal.value?.buffer.active.baseY + buffer.y)
      .translateToString()
    terminalState.value.content = substrWidth(lineContent, cursorStartX.value)
    terminalState.value.beforeCursor = substrWidth(lineContent, cursorStartX.value, cursorX)

    terminalState.value.cursorPosition = { col: cursorX, row: cursorY }
    api
      .recordTerminalState({
        id: connectionId.value,
        state: {
          cursorPosition: {
            row: terminalState.value.cursorPosition.row,
            col: terminalState.value.cursorPosition.col
          },
          beforeCursor: terminalState.value.beforeCursor,
          const: terminalState.value.content
        }
      })
      .catch((err) => {
        console.error('发送终端状态时出错:', err)
      })
  } catch (error) {
    console.error('更新终端状态时出错:', error)
  }
}
// const stringToBytes2 = (str) => {
//   const bytes = new Uint8Array(str.length)
//   for (let i = 0; i < str.length; i++) {
//     bytes[i] = str.charCodeAt(i) & 0xff
//   }
//   return bytes
// }
const setupTerminalInput = () => {
  if (!terminal.value) return

  terminal.value.onData((data) => {
    // 发送数据到SSH会话
    // alias替换
    if (data == '\r') {
      const originalData = String.fromCharCode(127)
      const command = terminalState.value.content.trim()
      const aliasStore = aliasConfigStore()
      console.log(aliasStore.aliasMap)
      const newCommand = aliasStore.getCommand(command) // 全局alias
      if (userConfig.value.aliasStatus === 1 && newCommand !== null) {
        sendData(originalData.repeat(command.length) + newCommand + '\r')
      } else if (userConfig.value.quickVimStatus === 1) {
        const vimMatch = command.match(/vim\s+(.+)$/i)
        if (vimMatch) {
          data =
            originalData.repeat(command.length) +
            'cat ' +
            vimMatch[1] +
            ' #Chaterm:vim \r history -s "' +
            command.trim() +
            '"' +
            '\r'
          sendMarkedData(data, 'Chaterm:vim')
        } else {
          sendData(data)
        }
      } else {
        // detect cd command
        // support following cd command: cd, cd /path, command1 & cd /path
        if (/\bcd\b/.test(command)) {
          sendData(data)
          // 在cd命令执行后获取新的cwd
          setTimeout(() => {
            sendMarkedData('pwd\r', 'Chaterm:pwd')
          }, 100)
        } else {
          sendData(data)
        }
      }
    } else if (JSON.stringify(data) === '"\\u001b[A"') {
      sendMarkedData(data, 'Chaterm:[A')
    } else if (JSON.stringify(data) === '"\\u001b[B"') {
      sendMarkedData(data, 'Chaterm:[B')
    } else {
      sendData(data)
    }
  })
  setupTerminalStateTracking()
}

const sendData = (data) => {
  api.writeToShell({
    id: connectionId.value,
    data: data
  })
}
const sendMarkedData = (data, marker) => {
  api.writeToShell({
    id: connectionId.value,
    data: data,
    marker: marker
  })
}

export interface MarkedResponse {
  data: string // 服务器返回的原始数据
  marker?: string // 关联的命令标记（如果有）
}

const startShell = async () => {
  try {
    // 请求启动shell会话
    const result = await api.shell({ id: connectionId.value })
    if (result.status === 'success') {
      isConnected.value = true
      const removeDataListener = api.onShellData(connectionId.value, (response: MarkedResponse) => {
        // 处理返回
        let data = response.data
        console.log('原始返回数据', JSON.stringify(data))
        if (response.marker === 'Chaterm:vim') {
          const {
            lastLine: lastLine,
            content: content,
            filePath: filePath,
            action: action,
            contentType: contentType
          } = parseVimLine(data)
          createEditor(filePath, content.join('\r\n'), action, contentType)
          data = lastLine
          terminal.value?.write(data)
        } else if (response.marker === 'Chaterm:save' || data.indexOf('Chaterm:save') !== -1) {
          console.log(response.marker)
        } else if (response.marker === 'Chaterm:pwd') {
          // 处理pwd命令的响应
          currentCwd.value = data.trim()
          currentCwdStore.setCurrentCwd(currentCwd.value)
          console.log('current working directory:', currentCwd.value)
        } else {
          terminal.value?.write(data)
        }
      })
      const removeErrorListener = api.onShellError(connectionId.value, (data) => {
        terminal.value?.write(data)
      })
      const removeCloseListener = api.onShellClose(connectionId.value, () => {
        terminal.value?.writeln('\r\n远程主机关闭了连接。')
        isConnected.value = false
      })
      cleanupListeners.value = [removeDataListener, removeErrorListener, removeCloseListener]

      // 获取初始cwd
      setTimeout(() => {
        sendMarkedData('pwd\r', 'Chaterm:pwd')
      }, 500)
    } else {
      terminal.value?.writeln(`启动Shell失败: ${result.message}`)
    }
  } catch (error: any) {
    terminal.value?.writeln(`Shell错误: ${error.message || '未知错误'}`)
  }
  emit('connectSSH', { isConnected: isConnected })
}

const disconnectSSH = async () => {
  try {
    const result = await api.disconnect({ id: connectionId.value })

    if (result.status === 'success') {
      cleanupListeners.value.forEach((cleanup) => cleanup())
      cleanupListeners.value = []

      // 更新状态
      isConnected.value = false
      terminal.value?.writeln('\r\n已断开连接。')
    } else {
      terminal.value?.writeln(`\r\n断开连接错误: ${result.message}`)
    }
  } catch (error: any) {
    terminal.value?.writeln(`\r\n断开连接错误: ${error.message || '未知错误'}`)
  }
  emit('disconnectSSH', { isConnected: isConnected })
}

const getTerminalBufferContent = (): string | null => {
  if (terminal.value) {
    const buffer = terminal.value.buffer.active
    let content = ''
    for (let i = 0; i < buffer.length; i++) {
      if (i < 2) {
        continue
      }
      const line = buffer.getLine(i)
      if (line) {
        content += line.translateToString(true) // true to include wide characters
        if (i < buffer.length - 1) {
          content += '\n' // Add newline character between lines, except for the last one
        }
      }
    }
    return content
  }
  return null
}

defineExpose({
  getTerminalBufferContent // Expose the new method
})
</script>

<style>
.ant-form-item .ant-form-item-label > label {
  color: white;
}

.ant-radio-wrapper {
  color: white;
}

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
</style>
