<template>
  <div
    ref="terminalContainer"
    class="terminal-container"
  >
    <div
      ref="terminalElement"
      v-contextmenu:contextmenu
      class="terminal"
    ></div>
    <SuggComp
      v-bind="{ ref: (el) => setRef(el, connectionId) }"
      :unique-key="connectionId"
      :suggestions="suggestions"
      :active-suggestion="activeSuggestion"
    />
    <v-contextmenu ref="contextmenu">
      <Context
        :is-connect="isConnected"
        :term-instance="terminal as any"
        :copy-text="copyText"
        :terminal-id="connectionId"
        @context-act="contextAct"
      />
    </v-contextmenu>
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

  <a-modal
    v-model:visible="showOtpDialog"
    title="二次验证"
    width="30%"
    :mask-closable="false"
    :keyboard="false"
  >
    <div>
      <p>{{ otpPrompt || '请输入验证码' }}</p>
      <a-input-password
        v-model:value="otpCode"
        placeholder="验证码"
        :visibility-toggle="false"
        @press-enter="submitOtpCode"
      />
      <span
        v-show="showOtpDialogErr"
        style="color: red"
        >验证码错误</span
      >
      <span
        v-show="showOtpDialogCheckErr"
        style="color: red"
        >请输入验证码</span
      >
    </div>
    <template #footer>
      <a-button
        key="submit"
        @click="cancelOtp"
        >取消</a-button
      >
      <a-button
        type="primary"
        @click="submitOtpCode"
        >确认
      </a-button>
    </template>
  </a-modal>
  <a-button
    :id="`${connectionId}Button`"
    class="select-button"
    style="display: none"
    >Chat to AI</a-button
  >
</template>

<script lang="ts" setup>
interface ApiType {
  queryCommand: (data: { command: string; ip: string }) => Promise<any>
  insertCommand: (data: { command: string; ip: string }) => Promise<any>
  getLocalAssetRoute: (data: { searchType: string; params?: any[] }) => Promise<any>
  updateLocalAssetLabel: (data: { uuid: string; label: string }) => Promise<any>
  updateLocalAsseFavorite: (data: { uuid: string; status: number }) => Promise<any>
}
declare global {
  interface Window {
    api: ApiType
  }
}
const copyText = ref('')
import Context from '../Term/contextComp.vue'
import SuggComp from '../Term/suggestion.vue'
import eventBus from '@/utils/eventBus'
import { useCurrentCwdStore } from '@/store/currentCwdStore'
import { markRaw, onBeforeUnmount, onMounted, onUnmounted, PropType, nextTick, reactive, ref } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { IDisposable } from 'xterm'
import 'xterm/css/xterm.css'
import { defineEmits } from 'vue'
import type { editorData } from '@/views/components/Term/Editor/dragEditor.vue'
import { LanguageMap } from '@/views/components/Term/Editor/languageMap'
import EditorCode from '@/views/components//Term/Editor/dragEditor.vue'
import { message, Modal } from 'ant-design-vue'
import { aliasConfigStore } from '@/store/aliasConfigStore'
import { userConfigStore } from '../../../store/userConfigStore'
import { userConfigStore as serviceUserConfig } from '@/services/userConfigStoreService'
import { v4 as uuidv4 } from 'uuid'
import { userInfoStore } from '@/store/index'
import stripAnsi from 'strip-ansi'

const selectFlag = ref(false)
const configStore = userConfigStore()
interface CommandSuggestion {
  command: string
  source: 'base' | 'history'
}
const suggestions = ref<CommandSuggestion[]>([])
const activeSuggestion = ref(0) //高亮的补全项
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
}
const componentRefs = ref({})
// 设置动态引用的函数
const setRef = (el, key) => {
  if (el) {
    componentRefs.value[key] = el
  }
}
const isConnected = ref(false)
const terminal = ref<Terminal | null>(null)
const fitAddon = ref<FitAddon | null>(null)
const connectionId = ref('')
let removeOtpRequestListener = (): void => {}
let removeOtpTimeoutListener = (): void => {}
let removeOtpResultListener = (): void => {}
const connectionHasSudo = ref(false)
const connectionSftpAvailable = ref(false)
const cleanupListeners = ref<Array<() => void>>([])
const terminalElement = ref(null)
const terminalContainer = ref<HTMLDivElement | null>(null)
const cursorStartX = ref(0)
const api = window.api as any
const encoder = new TextEncoder()
let cusWrite: ((data: string, options?: { isUserCall?: boolean }) => void) | null = null
let resizeObserver: ResizeObserver | null = null
// const userConfig = ref({
//   aliasStatus: 2,
//   quickVimStatus: 2
// })

// const loadUserConfig = async () => {
//   try {
//     const config = await userConfigStore.getConfig()
//     if (config) {
//       userConfig.value = config
//     }
//   } catch (error) {
//     console.error('Failed to load user config:', error)
//   }
// }
// 编辑序列

const isEditorMode = ref(false)
const dataBuffer = ref<number[]>([])
const EDITOR_SEQUENCES = {
  // 进入编辑器模式的序列
  enter: [
    { pattern: [0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x68], editor: 'vim' }, // \033[?1049h
    { pattern: [0x1b, 0x5b, 0x3f, 0x34, 0x37, 0x68], editor: 'vim' }, // \033[?47h
    { pattern: [0x1b, 0x5b, 0x3f, 0x31, 0x68, 0x1b, 0x3d], editor: 'nano' } // \033[?1h\033=
  ],
  // 退出编辑器模式的序列
  exit: [
    { pattern: [0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x6c], editor: 'vim' }, // \033[?1049l
    { pattern: [0x1b, 0x5b, 0x3f, 0x34, 0x37, 0x6c], editor: 'vim' }, // \033[?47l
    { pattern: [0x1b, 0x5b, 0x3f, 0x31, 0x6c, 0x1b, 0x3e], editor: 'nano' } // \033[?1l\033>
  ]
}
const userInputFlag = ref(false)
const currentCwdStore = useCurrentCwdStore()
let termOndata: IDisposable | null = null
const pasteFlag = ref(false)
let dbConfigStash: {
  aliasStatus?: number
  autoCompleteStatus?: number
  scrollBack?: number
  highlightStatus?: number
  [key: string]: any
} = {}
let config
onMounted(async () => {
  config = await serviceUserConfig.getConfig()
  console.log(config, 'config')
  dbConfigStash = config
  queryCommandFlag.value = config.autoCompleteStatus == 1
  const termInstance = markRaw(
    new Terminal({
      scrollback: config.scrollBack,
      cursorBlink: true,
      cursorStyle: config.cursorStyle,
      fontSize: config.fontSize || 12,
      fontFamily: 'Menlo, Monaco, "Courier New", Courier, monospace',
      theme: {
        background: '#141414',
        foreground: '#f0f0f0'
      }
    })
  )
  terminal.value = termInstance
  termInstance?.onKey(handleKeyInput)
  termInstance?.onSelectionChange(function () {
    if (termInstance.hasSelection()) {
      copyText.value = termInstance.getSelection()
    }
  })
  if (terminalContainer.value) {
    terminalContainer.value.addEventListener('mouseup', (e) => {
      setTimeout(() => {
        if (termInstance.hasSelection()) {
          const text = termInstance.getSelection()
          const button = document.getElementById(`${connectionId.value}Button`) as HTMLElement

          // 定位按钮到鼠标抬起位置
          button.style.left = `${e.clientX + 10}px`
          button.style.top = `${e.clientY + 10}px`
          if (text.trim()) button.style.display = 'block'

          button.onclick = () => {
            eventBus.emit('openAiRight')
            nextTick(() => {
              eventBus.emit('chatToAi', text.trim())
            })
            termInstance.clearSelection()
          }
        }
      }, 10)
    })
    document.addEventListener('mouseup', hideSelectionButton)
  }

  fitAddon.value = new FitAddon()
  termInstance.loadAddon(fitAddon.value)
  if (terminalElement.value) {
    termInstance.open(terminalElement!.value)
  }
  fitAddon?.value.fit()

  termInstance.focus()

  termInstance.onResize((size) => {
    resizeSSH(size.cols, size.rows)
  })
  //onKey监听不到输入法，补充监听
  const textarea = termInstance?.element?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
  if (textarea) {
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
  }
  // removeOtpSuccessListener = window.api.onKeyboardInteractiveSuccess(handleOtpSuccess)
  removeOtpRequestListener = api.onKeyboardInteractiveRequest(handleOtpRequest)
  removeOtpTimeoutListener = api.onKeyboardInteractiveTimeout(handleOtpTimeout)
  removeOtpResultListener = api.onKeyboardInteractiveResult(handleOtpError)
  const core = (termInstance as any)._core
  const renderService = core._renderService
  const originalWrite = termInstance.write.bind(termInstance)
  // termInstance.write
  cusWrite = function (data: string, options?: { isUserCall?: boolean }): void {
    console.log(JSON.stringify(data), 'data')
    userInputFlag.value = options?.isUserCall ?? false
    const originalRequestRefresh = renderService.refreshRows.bind(renderService)
    const originalTriggerRedraw = renderService._renderDebouncer.refresh.bind(renderService._renderDebouncer)
    // 临时禁用渲染
    renderService.refreshRows = () => {}
    renderService._renderDebouncer.refresh = () => {}
    const core = (terminal as any).value._core
    const inputHandler = core._inputHandler
    // 确保 parse 方法仅绑定一次
    if (!inputHandler._isWrapped) {
      inputHandler._originalParse = inputHandler.parse
      inputHandler.parse = function (data: string) {
        inputHandler._originalParse.call(this, data)
        if (!userInputFlag.value && !isEditorMode.value) {
          if (JSON.stringify(data).endsWith(startStr.value)) {
            updateTerminalState(true)
          } else {
            updateTerminalState(false)
          }
        }

        // 走高亮的条件
        let highLightFlag: boolean = true
        // 条件1, 如果beforeCursor为空 content有内容 则代表enter键，不能走highlight
        if (!terminalState.value.beforeCursor.length && terminalState.value.content.length && enterPress.value) {
          highLightFlag = false
        }
        // 条件2, 进入编辑模式下，不走highlight
        if (isEditorMode.value) {
          highLightFlag = false
        }
        // 条件3, 高亮触发的写入，不走highlight
        if (userInputFlag.value) {
          highLightFlag = false
        }
        // 条件4, 服务器返回包含命令提示符，不走highlight，避免渲染异常
        // TODO: 条件5, 进入子交互模式 不开启高亮
        //TODO: 服务器返回  xxx\r\n,   \r\n{startStr.value}xxx 时特殊处理
        // if (data.indexOf(startStr.value) !== -1 && startStr.value != '') {
        //   highLightFlag = false
        // }
        if (
          stripAnsi(data)
            .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .endsWith(startStr.value) &&
          startStr.value != ''
        ) {
          highLightFlag = false
        }
        if (highLightFlag) {
          if (config.highlightStatus == 1) {
            setTimeout(() => {
              highlightSyntax(terminalState.value)
            }, 20)
          }
          if (!selectFlag.value) {
            queryCommand()
          }
        }
      }
      inputHandler._isWrapped = true
    }

    originalWrite(data)

    // 恢复渲染
    renderService.refreshRows = originalRequestRefresh
    renderService._renderDebouncer.refresh = originalTriggerRedraw
    renderService.refreshRows(0, core._bufferService.rows - 1)
  }

  termInstance.write = cusWrite as any
  // const boxId = `${props.currentConnectionId}-box`
  // const box = document.getElementById(boxId)

  // 使用 ResizeObserver 监听 box 元素的尺寸变化
  // if (box) {
  //   resizeObserver = new ResizeObserver(
  //     debounce(() => {
  //       handleResize()
  //     }, 50)
  //   )
  //   resizeObserver.observe(box)
  // }

  // 保留 window resize 监听作为备用
  window.addEventListener('resize', handleResize)
  connectSSH()

  const handleExecuteCommand = (command) => {
    if (props.activeTabId !== props.currentConnectionId) return
    autoExecuteCode(command)
    termInstance.focus()
  }

  eventBus.on('executeTerminalCommand', handleExecuteCommand)

  // 将清理逻辑移到 onBeforeUnmount
  cleanupListeners.value.push(() => {
    eventBus.off('executeTerminalCommand', handleExecuteCommand)
  })
})
const getCmdList = async (terminalId) => {
  const data = await api.sshConnExec({
    cmd: `ls /usr/bin/ /usr/local/bin/ /usr/sbin/ /usr/local/sbin/ /bin/ | sort | uniq`,
    id: terminalId
  })
  if (data.stdout == '' || data.stderr !== '') {
    commands.value = ['cd', 'ls']
  } else {
    commands.value = data.stdout.split('\n').filter(Boolean)
  }
}
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)

  // 清理 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  // 清理IPC监听器和事件总线监听器
  cleanupListeners.value.forEach((cleanup) => cleanup())
  cleanupListeners.value = [] // 清空数组

  if (typeof removeOtpRequestListener === 'function') removeOtpRequestListener()
  if (typeof removeOtpTimeoutListener === 'function') removeOtpTimeoutListener()
  if (typeof removeOtpResultListener === 'function') removeOtpResultListener()
  if (isConnected.value) {
    disconnectSSH()
  }
  // eventBus.off('executeTerminalCommand') // 此行已通过 cleanupListeners 处理
})
const getFileExt = (filePath: string) => {
  const idx = filePath.lastIndexOf('.')
  if (idx === -1) return '' // 没有扩展名
  return filePath.slice(idx).toLowerCase()
}
const parseVimLine = (str) => {
  // 过滤ANSI 转义序列
  let cleanedStr = stripAnsi(str)
  cleanedStr = cleanedStr.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')
  cleanedStr = cleanedStr.trim()
  const lines = cleanedStr.split(/\r?\n/) // 同时处理 \n 和 \r\n 换行符
  if (lines.length > 0) {
    // 处理文件名里无意义符号
    const fileName = lines[1].replace(/[\x00-\x1F\x7F]/g, '').trimEnd()
    const contentType = getFileExt(fileName) ? getFileExt(fileName) : '.python'
    if (cleanedStr.indexOf('No such file or directory') !== -1) {
      return {
        checkStatus: lines[0].trim().endsWith('#Chaterm:vim'),
        lastLine: '\r\n' + lines[lines.length - 1],
        filePath: fileName,
        contentType: LanguageMap[contentType]
      }
    } else {
      return {
        checkStatus: lines[0].trim().endsWith('#Chaterm:vim'),
        lastLine: '\r\n' + lines[lines.length - 1],
        filePath: fileName,
        contentType: LanguageMap[contentType]
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
  let errMsg = ''
  const editor = openEditors.find((editor) => editor?.filePath === filePath)
  if (editor?.fileChange) {
    const newContent = editor.vimText.replace(/\r\n/g, '\n')
    let cmd = `cat <<'EOFChaterm:save' > ${filePath}\n${newContent}\nEOFChaterm:save\n`
    if (connectionHasSudo.value) {
      cmd = `cat <<'EOFChaterm:save' | sudo tee  ${filePath} > /dev/null \n${newContent}\nEOFChaterm:save\n`
    }
    const { stderr } = await api.sshConnExec({
      cmd: cmd,
      id: connectionId.value
    })
    errMsg = stderr
  }
  if (errMsg !== '') {
    message.error(`保存失败: ${errMsg}`)
  } else {
    message.success('保存成功')
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
      // const rect = terminalElement.value.getBoundingClientRect()
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
        key: filePath
      } as editorData)
    } else {
      existingEditor.visible = true
      existingEditor.vimText = stdout
    }
  }
}

// 防抖
const debounce = (func, wait) => {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}
const autoExecuteCode = (command) => {
  sendData(command)
}
const handleResize = debounce(() => {
  if (fitAddon.value && terminal.value) {
    fitAddon.value.fit()
    const { cols, rows } = terminal.value
    // 发送新尺寸到服务器
    resizeSSH(cols, rows)
  }
}, 100)

const emit = defineEmits(['connectSSH', 'disconnectSSH', 'closeTabInTerm', 'createNewTerm'])

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
      privateKey.value = props.connectData.authType === 'privateKey' ? props.connectData.privateKey : ''
      passphrase.value = props.connectData.passphrase || ''
    }

    // terminal.value?.writeln(`尝试连接 ${props.connectData.ip}:${props.connectData.port}...`)
    const email = userInfoStore().userInfo.email
    connectionId.value = `${props.connectData.username}@${props.connectData.ip}:local:${uuidv4()}`
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
      // terminal.value?.writeln(`已成功连接到 ${props.connectData.ip}`)
      let welcome = '\x1b[38;2;22;119;255m' + name + ', 欢迎您使用智能堡垒机Chaterm \x1b[m\r\n'
      if (configStore.getUserConfig.language == 'en-US') {
        welcome = '\x1b[38;2;22;119;255m' + email.split('@')[0] + ', Welcome to use Chaterm \x1b[m\r\n'
      }
      terminal.value?.writeln(welcome)
      terminal.value?.writeln(`Connecting to ${props.connectData.ip}`)
      // 启动shell会话
      await startShell()

      // 设置输入处理
      setupTerminalInput()
      getCmdList(connectionId.value)
      handleResize()
    } else {
      terminal.value?.writeln(
        JSON.stringify({
          cmd: `错误: ${result.message}`,
          isUserCall: true
        })
      )
    }
  } catch (error: any) {
    terminal.value?.writeln(
      JSON.stringify({
        cmd: `连接失败: ${error.message || '未知错误'}`,
        isUserCall: true
      })
    )
  }
  // emit('connectSSH', { isConnected: isConnected })
}

const startShell = async () => {
  try {
    // 请求启动shell会话
    const result = await api.shell({ id: connectionId.value })
    if (result.status === 'success') {
      isConnected.value = true
      const removeDataListener = api.onShellData(connectionId.value, (response: MarkedResponse) => {
        // 验证编辑模式
        detectEditorMode(response)
        handleServerOutput(response)
      })
      const removeErrorListener = api.onShellError(connectionId.value, (data) => {
        cusWrite?.(data)
      })
      const removeCloseListener = api.onShellClose(connectionId.value, () => {
        isConnected.value = false
      })
      cleanupListeners.value = [removeDataListener, removeErrorListener, removeCloseListener]
    } else {
      terminal.value?.writeln(
        JSON.stringify({
          cmd: `启动Shell失败: ${result.message}`,
          isUserCall: true
        })
      )
    }
  } catch (error: any) {
    terminal.value?.writeln(
      JSON.stringify({
        cmd: `Shell错误: ${error.message || '未知错误'}`,
        isUserCall: true
      })
    )
  }
  emit('connectSSH', { isConnected: isConnected })
}

// 发送尺寸变化
const resizeSSH = async (cols, rows) => {
  try {
    const result = await api.resizeShell(connectionId.value, cols, rows)
    if (result.status === 'error') {
      console.error('Resize failed:', result.message)
    } else {
      console.log('terminal resized:', result.message)
    }
  } catch (error) {
    console.error('Failed to resize terminal:', error)
  }
}

// OTP相关状态
const showOtpDialog = ref(false)
const showOtpDialogErr = ref(false)
const showOtpDialogCheckErr = ref(false)
const otpPrompt = ref('')
const otpCode = ref('')
const currentOtpId = ref(null)
const otpTimeRemaining = ref(0)
const otpAttempts = ref(0)
const OTP_TIMEOUT = 300000 // 5分钟超时
const MAX_OTP_ATTEMPTS = 5 // 最大OTP尝试次数
let otpTimerInterval: NodeJS.Timeout | null = null

const startOtpTimer = (durationMs = OTP_TIMEOUT) => {
  // 默认5分钟
  // 清除现有计时器
  if (otpTimerInterval) {
    clearInterval(otpTimerInterval)
  }

  const endTime = Date.now() + durationMs

  // 每秒更新剩余时间
  otpTimeRemaining.value = durationMs
  otpTimerInterval = setInterval(() => {
    const remaining = endTime - Date.now()
    if (remaining <= 0) {
      if (otpTimerInterval !== null) {
        clearInterval(otpTimerInterval)
      }
      otpTimeRemaining.value = 0
      showOtpDialog.value = false
      cancelOtp()
    } else {
      otpTimeRemaining.value = remaining
    }
  }, 1000)
}
// 处理OTP请求
const handleOtpRequest = (data) => {
  currentOtpId.value = data.id
  otpPrompt.value = data.prompts.join('\n')
  showOtpDialog.value = true
  startOtpTimer()
}
const handleOtpError = (data) => {
  if (data.id === currentOtpId.value) {
    if (data.status == 'success') {
      closeOtp()
    } else {
      showOtpDialogErr.value = true
      otpAttempts.value += 1
      otpCode.value = ''
      if (otpAttempts.value >= MAX_OTP_ATTEMPTS) {
        showOtpDialog.value = false
        cancelOtp()
      }
    }
  }
}

const submitOtpCode = () => {
  showOtpDialogCheckErr.value = false
  showOtpDialogErr.value = false
  if (otpCode.value && currentOtpId.value) {
    api.submitKeyboardInteractiveResponse(currentOtpId.value, otpCode.value)
  } else {
    showOtpDialogCheckErr.value = true
  }
}

// 取消KeyboardInteractive
const cancelOtp = () => {
  if (currentOtpId.value) {
    api.cancelKeyboardInteractive(currentOtpId.value)
    if (typeof removeOtpRequestListener === 'function') removeOtpRequestListener()
    if (typeof removeOtpTimeoutListener === 'function') removeOtpTimeoutListener()
    if (typeof removeOtpResultListener === 'function') removeOtpResultListener()
    resetOtpDialog()
  }
}
const closeOtp = () => {
  if (currentOtpId.value) {
    if (typeof removeOtpRequestListener === 'function') removeOtpRequestListener()
    if (typeof removeOtpTimeoutListener === 'function') removeOtpTimeoutListener()
    if (typeof removeOtpResultListener === 'function') removeOtpResultListener()
    resetOtpDialog()
  }
}

// 重置KeyboardInteractive对话框
const resetOtpDialog = () => {
  showOtpDialog.value = false
  showOtpDialogErr.value = false
  otpPrompt.value = ''
  otpCode.value = ''
  currentOtpId.value = null
}

const handleOtpTimeout = (data) => {
  if (data.id === currentOtpId.value && showOtpDialog.value) {
    resetOtpDialog()
  }
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
  // if (str.length < startWidth) {
  //   return ""
  // }

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
  console.log(startStr.value, 'substrWidthFNstartStr.value')
  if (startStr.value != '') {
    startStr.value = str.substring(0, startIndex)
  } else {
    beginStr.value = str.substring(0, startIndex)
  }

  return str.substring(startIndex, endIndex)
}

const setupTerminalStateTracking = () => {
  if (!terminal.value) return

  // terminal.value.onData(() => {
  //   // 短暂延迟确保渲染完成
  //   setTimeout(updateTerminalState, 10)
  // })

  // // 在输入和输出后更新状态
  // terminal.value.onData(() => {
  //   // 短暂延迟确保渲染完成
  //   setTimeout(updateTerminalState, 10)
  // })

  // // 监听终端渲染事件
  // terminal.value.onRender(() => {
  //   updateTerminalState()
  // })

  // // 监听光标移动
  // terminal.value.onCursorMove(() => {
  //   updateTerminalState()
  // })
}
// 更新终端状态
const updateTerminalState = (quickInit: boolean) => {
  if (!terminal.value) return
  try {
    const buffer = (terminal as any).value._core._bufferService.buffer
    const cursorX = buffer.x
    const cursorY = buffer.y

    // 当前行开始输入时的光标的位置
    if (cursorStartX.value === 0 || quickInit) {
      cursorStartX.value = cursorX
    } else {
      cursorStartX.value = Math.min(cursorStartX.value, cursorX)
    }
    const lineContent = buffer.lines.get(terminal.value?.buffer.active.baseY + buffer.y).translateToString(true)
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
const setupTerminalInput = () => {
  if (!terminal.value) return

  termOndata = terminal.value.onData(async (data) => {
    // 快捷键
    // 发送数据到SSH会话
    // alias替换
    if (startStr.value == '') {
      startStr.value = beginStr.value
    }
    if (data === '\t') {
      // console.log(JSON.stringify(data), 'datttt')
      // sendData(data)
      const cmd = JSON.parse(JSON.stringify(terminalState.value.content))
      selectFlag.value = true
      // Tab键
      // if (suggestions.value.length) {
      //   selectSuggestion(suggestions.value[activeSuggestion.value])
      //   selectFlag.value = true
      // }
      suggestions.value = []
      activeSuggestion.value = 0
      setTimeout(() => {
        queryCommand(cmd)
      }, 100)
    }
    if (data === '\x03') {
      // Ctrl+C
      if (suggestions.value.length) {
        suggestions.value = []
        activeSuggestion.value = 0
        nextTick(() => {
          console.log('Ctrl+C: 推荐界面已清除')
        })
        return // 如果有推荐界面，只清除推荐界面，不发送Ctrl+C
      }
      sendData(data)
    } else if (data === '\x1b') {
      // ESC键 - 取消推荐界面
      if (suggestions.value.length) {
        suggestions.value = []
        activeSuggestion.value = 0
        nextTick(() => {
          console.log('ESC: 推荐界面已清除')
        })
        return // 如果有推荐界面，只清除推荐界面，不发送ESC
      } else {
        sendData(data)
      }
    } else if (data === '\x16') {
      // Ctrl+V
      navigator.clipboard
        .readText()
        .then((text) => {
          sendData(text)
        })
        .catch(() => {
          // 如果剪贴板访问失败，静默处理
        })
    } else if (data == '\r') {
      selectFlag.value = true
      const delData = String.fromCharCode(127)
      const command = terminalState.value.content
      const aliasStore = aliasConfigStore()
      // configStore.getUserConfig.quickVimStatus = 1
      const newCommand = aliasStore.getCommand(command) // 全局alias
      if (dbConfigStash.aliasStatus === 1 && newCommand !== null) {
        sendData(delData.repeat(command.length) + newCommand + '\r')
      } else if (config.quickVimStatus === 1) {
        connectionSftpAvailable.value = await api.checkSftpConnAvailable(connectionId.value)
        const vimMatch = command.match(/^\s*vim\s+(.+)$/i)
        if (vimMatch && connectionSftpAvailable.value) {
          if (vimMatch[1].startsWith('/')) {
            data = delData.repeat(command.length) + 'echo "' + vimMatch[1] + '"  #Chaterm:vim  \r'
          } else {
            data = delData.repeat(command.length) + 'echo "$(pwd)/' + vimMatch[1] + '"  #Chaterm:vim  \r'
          }
          sendMarkedData(data, 'Chaterm:vim')
        } else {
          sendData(data)
        }
      } else {
        sendData(data)
      }
      // detect cd command
      if (/\bcd\b/.test(command)) {
        setTimeout(() => {
          sendMarkedData('pwd\r', 'Chaterm:pwd')
        }, 100)
      }
    } else if (JSON.stringify(data) === '"\\u001b[A"') {
      if (suggestions.value.length) {
        data == '\u001b[A' && activeSuggestion.value > 0 ? (activeSuggestion.value -= 1) : ''
      } else {
        sendMarkedData(data, 'Chaterm:[A')
      }
    } else if (JSON.stringify(data) === '"\\u001b[B"') {
      if (suggestions.value.length) {
        data == '\u001b[B' && activeSuggestion.value < suggestions.value.length - 1 ? (activeSuggestion.value += 1) : ''
      } else {
        sendMarkedData(data, 'Chaterm:[B')
      }
    } else if (data == '\u001b[C') {
      if (suggestions.value.length) {
        selectSuggestion(suggestions.value[activeSuggestion.value])
        selectFlag.value = true
      } else {
        sendData(data)
      }
    } else {
      sendData(data)
    }

    if (!selectFlag.value) {
      queryCommand()
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

const matchPattern = (data: number[], pattern: number[]): boolean => {
  if (data.length < pattern.length) return false

  // 在数据中滑动窗口查找模式
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

// 判断是否进入编辑模式
const detectEditorMode = (response: MarkedResponse): void => {
  let bytes: number[] = []
  if (response.data) {
    if (typeof response.data === 'string') {
      // 如果是字符串，转换为字节数组
      const encoder = new TextEncoder()
      bytes = Array.from(encoder.encode(response.data))
    } else if (response.data && typeof response.data === 'object' && 'byteLength' in response.data) {
      // 如果是Uint8Array，直接转换
      bytes = Array.from(response.data as Uint8Array)
    } else if (Array.isArray(response.data)) {
      // 如果已经是数组
      bytes = response.data
    }
  }

  if (bytes.length === 0) return
  // 将字节添加到缓冲区
  dataBuffer.value.push(...bytes)

  // 限制缓冲区大小
  if (dataBuffer.value.length > 2000) {
    dataBuffer.value = dataBuffer.value.slice(-1000)
  }
  // 检测进入编辑器模式
  if (!isEditorMode.value) {
    for (const seq of EDITOR_SEQUENCES.enter) {
      if (matchPattern(dataBuffer.value, seq.pattern)) {
        isEditorMode.value = true
        handleResize()
        return
      }
    }
  }
  // 检测退出编辑器模式
  if (isEditorMode.value) {
    for (const seq of EDITOR_SEQUENCES.exit) {
      if (matchPattern(dataBuffer.value, seq.pattern)) {
        isEditorMode.value = false
        dataBuffer.value = []
        handleResize()
        return
      }
    }
  }
}

// 处理服务器返回
const handleServerOutput = (response: MarkedResponse) => {
  let data = response.data

  if (response.marker === 'Chaterm:vim') {
    const { lastLine: lastLine, filePath: filePath, contentType: contentType } = parseVimLine(data)
    createEditor(filePath, contentType)
    sendMarkedData('history -s "vim ' + filePath + '"' + '\r', 'Chaterm:history')
    data = lastLine
    cusWrite?.(data)
  } else if (response.marker === 'Chaterm:save' || response.marker === 'Chaterm:history' || response.marker === 'Chaterm:pass') {
    console.log('跳过：', response.marker)
  } else if (response.marker === 'Chaterm:[A') {
    // 跳过命令
    if (data.indexOf('Chaterm:vim') !== -1) {
      cusWrite?.(data)
      sendData(String.fromCharCode(21))
      sendMarkedData(String.fromCharCode(27, 91, 65), 'Chaterm:[A')
    } else {
      cusWrite?.(data)
    }
  } else if (response.marker === 'Chaterm:[B') {
    // 跳过命令
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
    console.log(`${props.connectData.ip} current working directory:`, currentCwd)
  } else {
    cusWrite?.(data)
  }
}

// 高亮相关变量
// const enc = new TextDecoder('utf-8')
const specialCode = ref(false)
// const keyCodeArr = [8, 38, 40]
const keyCode = ref('')
const currentLine = ref('')
const stashLine = ref('')
const currentLineStartY = ref(0)
const activeMarkers: any = ref([])
const commands = ref()
const cursorY = ref(0)
const cursorX = ref(0)
const enterPress = ref(false)
const beginStr = ref<string>('')
const startStr = ref<string>('')
// 高亮

const highlightSyntax = (allData) => {
  // 所有内容 光标前内容
  const { content, beforeCursor } = allData
  //命令
  let command = ''
  //参数
  let arg = ''
  //当前光标位置
  const currentCursorX = cursorStartX.value + beforeCursor.length
  // const currentCursorX = (terminal.value as any)?._core.buffer.x
  //首个空格位置 用来分割命令和参数
  const index = content.indexOf(' ')
  // 大前提 命令以第一个空格切割 前为命令 后为参数
  // 如果光标前有内容 且有空格，表示光标前内容有命令
  // 光标前没有命令，需要在整段内容中找命令
  const i = content.indexOf(' ')
  if (i != -1) {
    // 有空格 代表有命令 切割
    command = content.slice(0, i)
    arg = content.slice(i)
  } else {
    // 无空格 代表全是命令
    command = content
    arg = ''
    // }
  }

  // 获取当前光标所在的行号
  // 清除之前的标记
  activeMarkers.value.forEach((marker) => marker.dispose())

  activeMarkers.value = []
  // const startY = currentLineStartY.value
  const startY = (terminal.value as any)?._core.buffer.y
  const isValidCommand = commands.value?.includes(command)
  // 高亮命令
  // console.log('000',content,allData,'==')
  if (command) {
    const commandMarker = terminal.value?.registerMarker(startY)
    activeMarkers.value.push(commandMarker)
    // console.log(11,activeMarkers.value,startY)
    // cusWrite?.('\u001b[H\u001b[J[root@VM-12-6-centos ~]# s', {
    //   isUserCall: true
    // })
    cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + 1}H`, {
      isUserCall: true
    })

    const colorCode = isValidCommand ? '38;2;24;144;255' : '31'
    // console.log(22)
    cusWrite?.(`\x1b[${colorCode}m${command}\x1b[0m`, {
      isUserCall: true
    })

    setTimeout(() => {
      cusWrite?.(`\x1b[${startY + 1};${currentCursorX + 1}H`, {
        isUserCall: true
      })
    })
  }
  if (!arg) return
  // 高亮参数
  if (arg.includes("'") || arg.includes('"') || arg.includes('(')) {
    // 带闭合符号的输入
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

        cusWrite?.(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`, {
          isUserCall: true
        })
        unMatchFlag = true
      }
    }
    if (!unMatchFlag) {
      for (let i = 0; i < afterCommandArr.length; i++) {
        if (afterCommandArr[i].content == ' ') {
          cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1 + afterCommandArr[i].startIndex}H`, {
            isUserCall: true
          })
          cusWrite?.(`${afterCommandArr[i].content}\x1b[0m`, {
            isUserCall: true
          })
        } else {
          cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1 + afterCommandArr[i].startIndex}H`, {
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
    if (index == -1 && currentCursorX >= cursorStartX.value + command.length) {
      // 没有空格 且 光标在命令末尾
      cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`, {
        isUserCall: true
      })

      cusWrite?.(`\x1b[38;2;126;193;255m${arg}\x1b[0m`, { isUserCall: true })

      cusWrite?.(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`, {
        isUserCall: true
      })
    } else if (currentCursorX < cursorStartX.value + command.length) {
      // 光标在命令中间

      cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`, {
        isUserCall: true
      })

      cusWrite?.(`\x1b[38;2;126;193;255m${arg}\x1b[0m`, { isUserCall: true })

      cusWrite?.(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`, {
        isUserCall: true
      })
    } else {
      // 光标不在命令范围内

      cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`, {
        isUserCall: true
      })

      cusWrite?.(`\x1b[38;2;126;193;255m${arg}\x1b[0m`, { isUserCall: true })

      cusWrite?.(`\x1b[${cursorY.value + 1};${currentCursorX}H`, { isUserCall: true })
    }
  }
}
type ResultItem = {
  type: string
  content: string
  endIndex?: number
  index?: number
  startIndex?: number
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
  const stack = [] as Array<{
    symbol: any
    index?: number
  }>
  const result: ResultItem[] = [] // 明确
  let lastIndex = -1 // 上一个处理的字符位置
  // let lastType = ''
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (asymmetricClosing.includes(c)) {
      if (stack.length > 0 && stack[stack.length - 1].symbol === pairs[c]) {
        const item: any = stack.pop()
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
        const item: any = stack.pop()
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
    const item: any = stack.pop()
    result.push({
      type: 'unmatched',
      index: item.index,
      content: item.symbol
    })
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
  setTimeout(() => {
    suggestions.value = []
    activeSuggestion.value = 0
  }, 10)
}
const queryCommand = async (cmd = '') => {
  if (!queryCommandFlag.value) return

  // Check if the cursor is at the end of a line. Auto-completion is triggered only at the end of a line
  const isAtEndOfLine = terminalState.value.beforeCursor.length === terminalState.value.content.length
  if (!isAtEndOfLine) {
    suggestions.value = []
    return
  }

  try {
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
    // message.success('命令插入成功')
  } catch (error) {
    // message.error('命令插入失败')
  }
}

// 输入内容
const handleKeyInput = (e) => {
  console.log('keyInput-----')
  enterPress.value = false
  specialCode.value = false
  currentLineStartY.value = (terminal.value as any)?._core.buffer.y
  const ev = e.domEvent
  const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey
  const buffer: any = terminal.value?.buffer.active
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
    enterPress.value = true
    selectFlag.value = true
    // Enter
    currentLine.value = ''
    currentLineStartY.value = (terminal.value as any)?._core.buffer.y + 1
    cursorStartX.value = 0

    suggestions.value = []
    activeSuggestion.value = 0
    insertCommand(terminalState.value.content)
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
  } else if (ev.keyCode == 9) {
    // selectFlag.value = true
    // console.log(JSON.stringify(data), 'datttt')
    // sendData('\t')
  } else if (printable) {
    selectFlag.value = false

    // selectFlag.value = false
    // index = cursorX.value - cursorStartX.value
    // currentLine.value = `${currentLine.value.slice(0, index)}${e.key}${currentLine.value.slice(index)}`
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

      // 更新状态
      isConnected.value = false

      cusWrite?.('\r\n已断开连接。', { isUserCall: true })
    } else {
      cusWrite?.(`\r\n断开连接错误: ${result.message}`, { isUserCall: true })
    }
  } catch (error: any) {
    cusWrite?.(`\r\n断开连接错误: ${error.message || '未知错误'}`, {
      isUserCall: true
    })
  }
  emit('disconnectSSH', { isConnected: isConnected })
}
// 右键菜单方法
const contextAct = (action) => {
  switch (action) {
    case 'paste':
      // 粘贴
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
      // terminal.value?.onData().dispose()
      break
    case 'reconnect':
      // 重新连接
      connectSSH()
      break
    case 'newTerminal':
      emit('createNewTerm', props.serverInfo)
      // 新终端
      break
    case 'close':
      // 关闭
      // socket.value.close()
      emit('closeTabInTerm', props.serverInfo.id)
      break
    default:
      // 未知操作
      break
  }
}

// 添加focus方法
const focus = () => {
  if (terminal.value) {
    terminal.value.focus()
  }
}

const hideSelectionButton = () => {
  const button = document.getElementById(`${connectionId.value}Button`) as HTMLElement
  if (button) button.style.display = 'none'
}

defineExpose({
  handleResize,
  autoExecuteCode,
  terminal,
  focus
})

onUnmounted(() => {
  document.removeEventListener('mouseup', hideSelectionButton)
})
</script>

<style lang="less">
.ant-form-item .ant-form-item-label > label {
  color: white;
}
.ant-radio-wrapper {
  color: white;
}
.terminal-container {
  width: 100%;
  height: 100%;
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
  &:hover {
    color: white !important;
    border: 1px solid #4d4d4d !important;
  }
}
</style>
