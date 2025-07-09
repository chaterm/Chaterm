<template>
  <div
    ref="terminalContainer"
    class="terminal-container"
  >
    <SearchComp
      v-if="showSearch"
      :search-addon="searchAddon"
      :terminal="terminal"
      @close-search="closeSearch"
    />
    <div
      ref="terminalElement"
      v-contextmenu:contextmenu
      class="terminal"
    >
    </div>
    <a-button
      :id="`${connectionId}Button`"
      class="select-button"
      style="display: none"
      >Chat to AI</a-button
    >
    <SuggComp
      v-bind="{ ref: (el) => setRef(el, connectionId) }"
      :unique-key="connectionId"
      :suggestions="suggestions"
      :active-suggestion="activeSuggestion"
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
</template>

<script lang="ts" setup>
const copyText = ref('')
import SearchComp from '../Term/searchComp.vue'
import Context from '../Term/contextComp.vue'
import SuggComp from '../Term/suggestion.vue'
import eventBus from '@/utils/eventBus'
import { useCurrentCwdStore } from '@/store/currentCwdStore'
import { markRaw, onBeforeUnmount, onMounted, onUnmounted, PropType, nextTick, reactive, ref, watch } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { SearchAddon } from 'xterm-addon-search'
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
import { isGlobalInput, inputManager } from './termInputManager'

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
const isSyncInput = ref(false)
const terminal = ref<Terminal | null>(null)
const fitAddon = ref<FitAddon | null>(null)
const connectionId = ref('')
let removeOtpRequestListener = (): void => {}
let removeOtpTimeoutListener = (): void => {}
let removeOtpResultListener = (): void => {}
const connectionHasSudo = ref(false)
const connectionSftpAvailable = ref(false)
const cleanupListeners = ref<Array<() => void>>([])
const terminalElement = ref<HTMLDivElement | null>(null)
const terminalContainer = ref<HTMLDivElement | null>(null)
const cursorStartX = ref(0)
const api = window.api as any
const encoder = new TextEncoder()
let cusWrite: ((data: string, options?: { isUserCall?: boolean }) => void) | null = null
let resizeObserver: ResizeObserver | null = null
const showSearch = ref(false)
const searchAddon = ref<SearchAddon | null>(null)

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
let handleInput
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
  dbConfigStash = config
  queryCommandFlag.value = config.autoCompleteStatus == 1
  const termInstance = markRaw(
    new Terminal({
      scrollback: config.scrollBack,
      cursorBlink: true,
      cursorStyle: config.cursorStyle,
      fontSize: config.fontSize || 12,
      fontFamily: 'Menlo, Monaco, "Courier New", Courier, monospace',
      theme:
        config.theme === 'light'
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
  termInstance?.onSelectionChange(function () {
    if (termInstance.hasSelection()) {
      copyText.value = termInstance.getSelection()
    }
  })

  // Add theme change listener
  eventBus.on('updateTheme', (theme) => {
    if (terminal.value) {
      terminal.value.options.theme =
        theme === 'light'
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
  })

  if (terminalContainer.value) {
    terminalContainer.value.addEventListener('mouseup', () => {
      setTimeout(() => {
        const text = termInstance.getSelection()
        const position = termInstance.getSelectionPosition()
        if (position && text.trim()) {
          const button = document.getElementById(`${connectionId.value}Button`) as HTMLElement
          const { y } = position.start
          const viewportY = termInstance.buffer.active.viewportY
          const visibleRow = y - viewportY

          // 获取字符单元尺寸
          const cellHeight = (termInstance as any)._core._renderService.dimensions.css.cell.height

          // 将字符坐标转换为像素坐标
          const top = visibleRow - 2 > 0 ? (visibleRow - 2) * cellHeight : 0

          button.style.right = `26px`
          button.style.top = `${top}px`
          button.style.display = 'block'

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
  searchAddon.value = new SearchAddon()
  termInstance.loadAddon(searchAddon.value)
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
    // 监听复制粘贴, 标记此行为, 稍后高亮处理
    textarea.addEventListener('paste', () => {
      pasteFlag.value = true
    })
  }
  // removeOtpSuccessListener = window.api.onKeyboardInteractiveSuccess(handleOtpSuccess)
  removeOtpRequestListener = api.onKeyboardInteractiveRequest(handleOtpRequest)
  removeOtpTimeoutListener = api.onKeyboardInteractiveTimeout(handleOtpTimeout)
  removeOtpResultListener = api.onKeyboardInteractiveResult(handleOtpError)
  const core = (termInstance as any)._core
  const renderService = core._renderService
  const originalWrite = termInstance.write.bind(termInstance)

  // 更新TerminalState
  const debouncedUpdateTerminalState = (data) => {
    if (updateTimeout) {
      clearTimeout(updateTimeout)
    }
    updateTimeout = setTimeout(() => {
      if (!userInputFlag.value || !isEditorMode.value) {
        if (JSON.stringify(data).endsWith(startStr.value)) {
          updateTerminalState(true)
        } else {
          updateTerminalState(false)
        }
      }

      // 走高亮的条件
      let highLightFlag: boolean = true
      // 条件1, 如果beforeCursor为空 content有内容 则代表enter键，不能走highlight
      if ((!terminalState.value.beforeCursor.length && terminalState.value.content.length) || enterPress.value || specialCode.value) {
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
      // 条件5, 粘贴行为，走highlight
      if (pasteFlag.value) {
        highLightFlag = true
      }
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
          console.log('触发高亮:', terminalState.value)
          highlightSyntax(terminalState.value)
          pasteFlag.value = false
        }
        if (!selectFlag.value) {
          queryCommand()
        }
      }
      updateTimeout = null
    }, 10) // 100ms 延迟，可根据需要调整

    terminalContainerResize()
  }

  // termInstance.write
  cusWrite = function (data: string, options?: { isUserCall?: boolean }): void {
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
        debouncedUpdateTerminalState(data)
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
  // 使用 ResizeObserver 监听终端容器的尺寸变化
  if (terminalContainer.value) {
    resizeObserver = new ResizeObserver(
      debounce(() => {
        handleResize()
      }, 50)
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
      //  注册全局输入实例
      inputManager.registerInstances(
        {
          termOndata: handleExternalInput,
          syncInput: false
        },
        connectionId.value
      )
    }, 100)
  })

  connectSSH()

  const handleExecuteCommand = (command) => {
    if (props.activeTabId !== props.currentConnectionId) return
    sendMarkedData(command, 'Chaterm:command')
    termInstance.focus()
  }

  eventBus.on('executeTerminalCommand', handleExecuteCommand)

  // 将清理逻辑移到 onBeforeUnmount
  cleanupListeners.value.push(() => {
    eventBus.off('executeTerminalCommand', handleExecuteCommand)
    window.removeEventListener('keydown', handleGlobalKeyDown)
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

  // Remove theme change listener
  eventBus.off('updateTheme')

  if (typeof removeOtpRequestListener === 'function') removeOtpRequestListener()
  if (typeof removeOtpTimeoutListener === 'function') removeOtpTimeoutListener()
  if (typeof removeOtpResultListener === 'function') removeOtpResultListener()
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
  if (fitAddon.value && terminal.value && terminalElement.value) {
    try {
      // 确保终端元素可见
      const rect = terminalElement.value.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        fitAddon.value.fit()
        const { cols, rows } = terminal.value
        // 发送新尺寸到服务器
        if (isConnected.value) {
          resizeSSH(cols, rows)
        }
        console.log(`Terminal resized to: ${cols}x${rows}`)
      }
    } catch (error) {
      console.error('Failed to resize terminal:', error)
    }
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
    const name = userInfoStore().userInfo.name
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

      // 连接建立后再次进行自适应调整，确保尺寸正确
      setTimeout(() => {
        handleResize()
      }, 200)
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
const cursorLastY = ref(0)
const cursorLastX = ref(0)
let cursorEndY = ref(0)
const cursorMaxY = ref(0)
const cursorMaxX = ref(0)
let updateTimeout: NodeJS.Timeout | null = null

// 寻找输入行
const getLogicalInputStartLine = () => {
  const bufferService = (terminal as any).value._core._bufferService
  const buffer = bufferService.buffer
  let y = terminal.value?.buffer.active.baseY + buffer.y

  // 向上查找，直到找到第一行非 wrapped 的行
  while (y > 0 && buffer.lines.get(y)?.isWrapped) {
    y--
  }
  return y
}

// 寻找最大显示内容行(Wrapped）
const getWrappedContentLastLineY = () => {
  const bufferService = (terminal as any).value._core._bufferService
  const buffer = bufferService.buffer
  // 获取绝对位置
  let lastY = terminal.value?.buffer.active.baseY + buffer.y
  // 确保不会超出缓冲区范围
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

// 更新终端状态
const updateTerminalState = (quickInit: boolean) => {
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

    // 检查是否由窗口调整触发，如果是则跳过解析
    const isResizeTriggered = shouldSkipParseOnResize(maxX, maxY)
    if (isResizeTriggered) {
      parseStrTag = false
    }

    // 处理跨行刷新逻辑
    const currentCursorEndY = getWrappedContentLastLineY() - terminal.value?.buffer.active.baseY
    const refreshCrossRow = shouldRefreshCrossRow(currentCursorEndY, cursorX)
    cursorEndY.value = currentCursorEndY

    // 获取当前行信息
    const currentLine = buffer.lines.get(terminal.value?.buffer.active.baseY + cursorY)
    const isCrossRow = determineCrossRowStatus(currentLine, cursorY, currentCursorEndY)

    // 更新光标起始位置
    updateCursorStartPosition(cursorX, quickInit)

    // 处理行内容
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

    // 更新历史记录
    updateCursorHistory(cursorX, cursorY, maxX, maxY)

    // 解析和更新内容
    if (parseStrTag) {
      updateContentStrings(lineContent, cursorX)
      updateTerminalContent(lineContent, finalContentCursorX)
    }

    // 更新终端状态
    updateTerminalStateObject(cursorX, cursorY, isCrossRow)

    // 发送状态到服务器
    sendTerminalStateToServer()
  } catch (error) {
    console.error('更新终端状态时出错:', error)
  }
}

// 检查是否应该跳过解析（由窗口调整触发）
const shouldSkipParseOnResize = (maxX: number, maxY: number): boolean => {
  return cursorMaxX.value !== 0 && cursorMaxY.value !== 0 && (cursorMaxX.value !== maxX || cursorMaxY.value !== maxY)
}

// 检查是否需要刷新跨行
const shouldRefreshCrossRow = (currentCursorEndY: number, cursorX: number): boolean => {
  return currentCursorEndY < cursorEndY.value && currentCursorEndY !== 0 && cursorLastX.value === cursorX
}

// 确定跨行状态
const determineCrossRowStatus = (currentLine: any, cursorY: number, currentCursorEndY: number): boolean => {
  // 基本跨行判断
  if (currentLine.isWrapped) return true

  // 光标调整导致的跨行
  if (!currentLine.isWrapped && cursorY !== currentCursorEndY) return true

  // 基于之前状态的跨行判断
  if (terminalState.value.contentCrossRowStatus && cursorY === currentCursorEndY) return true

  return false
}

// 更新光标起始位置
const updateCursorStartPosition = (cursorX: number, quickInit: boolean): void => {
  if (cursorStartX.value === 0 || quickInit) {
    cursorStartX.value = cursorX
  } else {
    cursorStartX.value = Math.min(cursorStartX.value, cursorX)
  }
}

// 处理行内容
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

    // 更新终端状态的跨行信息
    terminalState.value.contentCrossRowLines = crossRowData.crossRowLines
    terminalState.value.contentCrossStartLine = crossRowData.crossStartLine
    terminalState.value.contentCurrentCursorCrossRowLines = crossRowData.currentCursorCrossRowLines

    // 换行后重新设置起始位置
    cursorStartX.value = startStr.value.length
  }

  return { lineContent, finalContentCursorX }
}

// 处理跨行内容
const processCrossRowContent = (parseStrTag: boolean, refreshCrossRow: boolean, cursorX: number, cursorY: number, buffer: any) => {
  const currentBufferLine = terminal.value?.buffer.active.baseY || 0
  let { contentCrossRowLines: crossRowLines, contentCrossStartLine: crossStartLine } = terminalState.value
  let { contentCurrentCursorCrossRowLines: currentCursorCrossRowLines } = terminalState.value

  // 更新跨行起始位置
  if ((crossStartLine === 0 && crossRowLines === 0) || (!parseStrTag && cursorY !== cursorLastY.value)) {
    crossStartLine = getLogicalInputStartLine() - currentBufferLine
  }

  if (refreshCrossRow) {
    crossStartLine = cursorY - currentCursorCrossRowLines + 1
  }

  // 计算跨行数量
  if (crossRowLines === 0 || cursorY > cursorLastY.value || (!parseStrTag && cursorY !== cursorLastY.value)) {
    crossRowLines = cursorEndY.value - crossStartLine + 1
  }

  currentCursorCrossRowLines = cursorY - crossStartLine + 1

  // 计算字符位置和获取完整内容
  let totalCharacterPosition = 0
  let fullContent = ''

  // 计算当前光标位置的字符数
  for (let i = 0; i < currentCursorCrossRowLines; i++) {
    const lineIndex = currentBufferLine + crossStartLine + i
    const lineContent = buffer.lines.get(lineIndex).translateToString(true)
    if (i === currentCursorCrossRowLines - 1) {
      totalCharacterPosition += cursorX
    } else {
      totalCharacterPosition += lineContent.length
    }
  }

  // 获取所有跨行内容
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

// 更新光标历史记录
const updateCursorHistory = (cursorX: number, cursorY: number, maxX: number, maxY: number): void => {
  cursorLastY.value = cursorY
  cursorLastX.value = cursorX
  cursorMaxX.value = maxX
  cursorMaxY.value = maxY
}

// 更新内容字符串
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

// 更新终端内容
const updateTerminalContent = (lineContent: string, contentCursorX: number): void => {
  terminalState.value.content = substrWidth(lineContent, cursorStartX.value)
  terminalState.value.beforeCursor = substrWidth(lineContent, cursorStartX.value, contentCursorX)
}

// 更新终端状态对象
const updateTerminalStateObject = (cursorX: number, cursorY: number, isCrossRow: boolean): void => {
  terminalState.value.cursorPosition = { col: cursorX, row: cursorY }
  terminalState.value.contentCrossRowStatus = isCrossRow
}

// 发送终端状态到服务器
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
        content: terminalState.value.content // 修复了原代码中的 "const" 错误
      }
    })
  } catch (err) {
    console.error('发送终端状态时出错:', err)
  }
}
// 允许外部调用，模拟输入
function handleExternalInput(data) {
  handleInput && handleInput(data, false) // 传递标记，防止死循环
}

const setupTerminalInput = () => {
  if (!terminal.value) return

  handleInput = async (data, isInputManagerCall = true) => {
    // 本地输入时广播给其他终端
    if (isInputManagerCall && isSyncInput.value) {
      inputManager.sendToOthers(connectionId.value, data)
    }
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
        nextTick(() => {})
      }
      // 阻止本轮 queryCommand 重新触发
      selectFlag.value = true
      // 无论是否存在推荐界面，都继续将 Ctrl+C 发送给终端
      sendData(data)
    } else if (data === '\x0c') {
      // Ctrl+L 清屏
      if (suggestions.value.length) {
        // 清除推荐界面
        suggestions.value = []
        activeSuggestion.value = 0
        nextTick(() => {})
      }
      // 阻止本轮 queryCommand 重新触发
      selectFlag.value = true
      // 将 Ctrl+L 发送给终端
      sendData(data)
    } else if (data === '\x1b') {
      // ESC键 - 取消推荐界面
      if (suggestions.value.length) {
        suggestions.value = []
        activeSuggestion.value = 0
        nextTick(() => {})
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
      // 如果有推荐列表，选中当前高亮的推荐项
      if (suggestions.value.length) {
        selectSuggestion(suggestions.value[activeSuggestion.value])
        selectFlag.value = true
        return
      }

      selectFlag.value = true
      // 立即清空推荐窗口
      suggestions.value = []
      activeSuggestion.value = 0
      const delData = String.fromCharCode(127)
      const command = terminalState.value.content
      const aliasStore = aliasConfigStore()
      // configStore.getUserConfig.quickVimStatus = 1
      const newCommand = aliasStore.getCommand(command) // 全局alias
      if (dbConfigStash.aliasStatus === 1 && newCommand !== null) {
        sendData(delData.repeat(command.length) + newCommand + '\r')
      } else if (config.quickVimStatus === 1 && !isSyncInput.value) {
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
      // 右箭头键 - 只执行正常的光标移动
      sendData(data)
    } else {
      sendData(data)
      // 正常输入时立即允许查询推荐
      selectFlag.value = false
    }

    if (!selectFlag.value) {
      queryCommand()
    }
  }
  termOndata = terminal.value.onData(handleInput)
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
        // 进入编辑模式时进行自适应调整
        nextTick(() => {
          handleResize()
        })
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
        // 退出编辑模式时进行自适应调整
        nextTick(() => {
          handleResize()
        })
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
          eventBus.emit('chatToAi', finalOutput)
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
          eventBus.emit('chatToAi', finalOutput)
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
  const { content, beforeCursor, cursorPosition } = allData
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
  let startY = (terminal.value as any)?._core.buffer.y
  if (allData.contentCrossRowStatus) {
    startY = allData.contentCrossStartLine
  }
  const isValidCommand = commands.value?.includes(command)
  // 高亮命令
  if (command) {
    const commandMarker = terminal.value?.registerMarker(startY)
    activeMarkers.value.push(commandMarker)
    // cusWrite?.('\u001b[H\u001b[J[root@VM-12-6-centos ~]# s', {
    //   isUserCall: true
    // })
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
  // 高亮参数
  if (arg.includes("'") || arg.includes('"') || arg.includes('(') || arg.includes('{') || arg.includes('[')) {
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

        cusWrite?.(`\x1b[${cursorPosition.row + 1};${cursorPosition.col + 1}H`, {
          isUserCall: true
        })
        unMatchFlag = true
      }
    }
    if (!unMatchFlag) {
      for (let i = 0; i < afterCommandArr.length; i++) {
        // debugger
        if (afterCommandArr[i].content == ' ') {
          cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1 + afterCommandArr[i].startIndex}H`, {
            isUserCall: true
          })
          cusWrite?.(`${afterCommandArr[i].content}\x1b[0m`, {
            isUserCall: true
          })
        } else {
          // cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1 + afterCommandArr[i].startIndex}H`, {
          //   isUserCall: true
          // })
          const colorCode = afterCommandArr[i].type == 'matched' ? '38;2;250;173;20' : '38;2;126;193;255'
          cusWrite?.(`\x1b[${colorCode}m${afterCommandArr[i].content}\x1b[0m`, {
            isUserCall: true
          })
          // debugger
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

      // cusWrite?.(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`, {
      //   isUserCall: true
      // })
      cusWrite?.(`\x1b[${cursorPosition.row + 1};${cursorPosition.col + 1}H`, {
        isUserCall: true
      })
    } else if (currentCursorX < cursorStartX.value + command.length) {
      // 光标在命令中间

      cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`, {
        isUserCall: true
      })

      cusWrite?.(`\x1b[38;2;126;193;255m${arg}\x1b[0m`, { isUserCall: true })

      // cusWrite?.(`\x1b[${cursorY.value + 1};${currentCursorX + 1}H`, {
      //   isUserCall: true
      // })
      cusWrite?.(`\x1b[${cursorPosition.row + 1};${cursorPosition.col + 1}H`, {
        isUserCall: true
      })
    } else {
      // 光标不在命令范围内

      cusWrite?.(`\x1b[${startY + 1};${cursorStartX.value + command.length + 1}H`, {
        isUserCall: true
      })

      cusWrite?.(`\x1b[38;2;126;193;255m${arg}\x1b[0m`, { isUserCall: true })

      // cusWrite?.(`\x1b[${cursorY.value + 1};${currentCursorX}H`, { isUserCall: true })
      cusWrite?.(`\x1b[${cursorPosition.row + 1};${cursorPosition.col + 1}H`, {
        isUserCall: true
      })
    }
  }
}

type ResultItem = { type: string; content: string; startIndex: number; endIndex?: number }
// 对 非命令字符串进行处理
const processString = (str: string): ResultItem[] => {
  const result: ResultItem[] = []
  let i = 0

  while (i < str.length) {
    // 1. 处理引号整体
    if (str[i] === '"' || str[i] === "'") {
      const quote = str[i]
      let j = i + 1

      // 查找匹配的闭引号
      while (j < str.length && str[j] !== quote) {
        // 跳过转义引号
        if (str[j] === '\\' && str[j + 1] === quote) {
          j += 2
        } else {
          j++
        }
      }

      if (j < str.length) {
        // 找到匹配的闭引号
        result.push({
          type: 'matched',
          startIndex: i,
          endIndex: j,
          content: str.slice(i, j + 1)
        })
        i = j + 1
      } else {
        // 未找到匹配的闭引号，将开引号作为未匹配处理
        result.push({
          type: 'unmatched',
          content: str[i],
          startIndex: i
        })
        i++
      }
      continue
    }

    // 2. 处理 {{...}} 嵌套
    if (str[i] === '{' && str[i + 1] === '{') {
      let depth = 1
      let j = i + 2

      // 查找匹配的闭合括号
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
        // 找到匹配的闭合括号
        result.push({
          type: 'matched',
          startIndex: i,
          endIndex: j + 1,
          content: str.slice(i, j + 2)
        })
        i = j + 2
      } else {
        // 未找到匹配的闭合括号，将开括号作为未匹配处理
        result.push({
          type: 'unmatched',
          content: str[i],
          startIndex: i
        })
        i++
      }
      continue
    }

    // 3. 处理单字符闭合符号 {} [] ()
    if (str[i] === '{' || str[i] === '[' || str[i] === '(') {
      const openChar = str[i]
      const closeChar = openChar === '{' ? '}' : openChar === '[' ? ']' : ')'
      let depth = 1
      let j = i + 1

      // 查找匹配的闭合符号
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
        // 找到匹配的闭合符号
        result.push({
          type: 'matched',
          startIndex: i,
          endIndex: j,
          content: str.slice(i, j + 1)
        })
        i = j + 1
      } else {
        // 未找到匹配的闭合符号，将开符号作为未匹配处理
        result.push({
          type: 'unmatched',
          content: str[i],
          startIndex: i
        })
        i++
      }
      continue
    }

    // 4. 普通字符处理
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

    // 防止无限循环的安全检查
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
  // 立即清空推荐窗口，不延迟
  suggestions.value = []
  activeSuggestion.value = 0
}
const queryCommand = async (cmd = '') => {
  if (!queryCommandFlag.value || isSyncInput.value) return

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

// 输入内容 - 原始处理函数
const handleKeyInputOriginal = (e) => {
  console.log(e, '----------------------')
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

  if (ev.keyCode === 13 || e.key === '\u0003') {
    enterPress.value = true
    selectFlag.value = true
    // Enter
    currentLine.value = ''
    currentLineStartY.value = (terminal.value as any)?._core.buffer.y + 1
    cursorStartX.value = 0

    // 立即清空推荐窗口（确保秒关）
    suggestions.value = []
    activeSuggestion.value = 0
    terminalState.value.contentCrossRowStatus = false
    terminalState.value.contentCrossStartLine = 0
    terminalState.value.contentCrossRowLines = 0
    insertCommand(terminalState.value.content)
  } else if (ev.keyCode === 8) {
    // 删除
    // specialCode.value = true
    index = cursorX.value - 1 - cursorStartX.value
    currentLine.value = currentLine.value.slice(0, index) + currentLine.value.slice(index + 1)
  } else if (ev.keyCode == 38 || ev.keyCode == 40) {
    //上下按键
    specialCode.value = true
  } else if (ev.keyCode == 37 || ev.keyCode == 39) {
    // 左箭头
    stashLine.value = JSON.parse(JSON.stringify(currentLine.value))
    specialCode.value = true
    if (suggestions.value.length) {
      specialCode.value = false
    }
    // this.initList()
  } else if (ev.keyCode == 9) {
    // selectFlag.value = true
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

// 防抖处理的输入函数
const handleKeyInput = debounce(handleKeyInputOriginal, 1000)

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
    case 'clearTerm':
      // 关闭
      // socket.value.close()
      terminal.value?.clear()
      break
    case 'shrotenName':
      // 关闭
      // socket.value.close()
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

const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if (props.activeTabId !== props.currentConnectionId) return

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
  terminal.value?.focus()
}

watch(
  () => isGlobalInput.value,
  (newVal) => {
    terminalContainerResize()
  }
)

const terminalContainerResize = () => {
  if (isGlobalInput.value) {
    terminalContainer.value?.style.setProperty('height', 'calc(100% - 35px)')
  } else {
    terminalContainer.value?.style.setProperty('height', '100%')
    if (terminal.value) terminal.value.scrollToBottom()
  }
}

defineExpose({
  handleResize,
  autoExecuteCode,
  terminal,
  focus,
  // 手动触发自适应调整
  triggerResize: () => {
    handleResize()
  }
})

onUnmounted(() => {
  document.removeEventListener('mouseup', hideSelectionButton)
  inputManager.unregisterInstances(connectionId.value)
})

// 在 script setup 部分添加新变量
const commandOutput = ref('')
const isCollectingOutput = ref(false)
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
  position: relative;
}

.terminal {
  width: 100%;
  height: 100%;
}
.terminal .xterm-viewport {
  background-color: transparent;
}
.terminal ::-webkit-scrollbar {
  width: 0px !important;
}
.select-button {
  position: absolute;
  display: none;
  z-index: 10;
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--text-color);
  font-size: 12px;
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color-light);
  &:hover {
    color: var(--text-color) !important;
    border: 1px solid var(--border-color-light) !important;
  }
}
</style>
