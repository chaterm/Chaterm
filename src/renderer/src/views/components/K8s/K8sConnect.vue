<template>
  <div
    ref="containerRef"
    class="k8s-terminal-container"
    :class="{ 'transparent-bg': isTransparent, 'theme-light': isLightTheme }"
  >
    <div
      ref="terminalRef"
      class="terminal-element"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch, computed } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import * as k8sApi from '@/api/k8s'
import { v4 as uuidv4 } from 'uuid'
import { userConfigStore } from '@/store/userConfigStore'
import { userConfigStore as serviceUserConfig } from '@/services/userConfigStoreService'
import { getActualTheme } from '@/utils/themeUtils'
import { getResolvedTerminalTheme } from '@/themes/terminalTheme'
import type { ThemeId, ThemeChangePayload } from '../../../../../shared/themes/types'
import eventBus from '@/utils/eventBus'
import { getLastNonEmptyLine, isTerminalPromptLine } from '@views/components/Ssh/utils/terminalPrompt'
import { stripAnsiBasic } from '@views/components/Ssh/utils/ansiUtils'

const logger = createRendererLogger('k8s.connect')

interface Props {
  serverInfo: {
    id: string
    title: string
    content: string
    type?: string
    data?: any
  }
  isActive: boolean
  activeTabId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'close-tab-in-term': [id: string]
}>()

const configStore = userConfigStore()
const containerRef = ref<HTMLElement | null>(null)
const terminalRef = ref<HTMLElement | null>(null)
const terminal = ref<Terminal | null>(null)
const fitAddon = ref<FitAddon | null>(null)
const terminalId = ref<string>('')
const isConnected = ref(false)

// Output collection state for AI command mode
const isCollectingOutput = ref(false)
const commandOutput = ref('')
const currentCommandTabId = ref<string | undefined>(undefined)
const currentCommand = ref<string>('')
const commandOutputProcessTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// Cleanup functions for IPC listeners
const cleanupFns: Array<() => void> = []

let userConfig: any = null

const isTransparent = computed(() => !!configStore.getUserConfig.background.image)
const currentTheme = ref(getActualTheme(configStore.getUserConfig.theme || 'dark'))
const isLightTheme = computed(() => currentTheme.value === 'light')

// Debounce helper (mirrors sshConnect.vue implementation)
const debounce = (func: (...args: any[]) => void, wait: number, immediate = false) => {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let isFirstCall = true
  let isDragging = false
  let lastCallTime = 0

  return function executedFunction(...args: any[]) {
    const now = Date.now()
    const timeSinceLastCall = now - lastCallTime
    lastCallTime = now
    isDragging = timeSinceLastCall < 50

    const later = () => {
      timeout = null
      if (!immediate) func(...args)
      isDragging = false
    }

    const callNow = immediate && !timeout
    if (timeout) clearTimeout(timeout)

    let dynamicWait: number
    if (isDragging) {
      dynamicWait = 5
    } else if (isFirstCall) {
      dynamicWait = 0
      isFirstCall = false
    } else {
      dynamicWait = wait
    }

    timeout = setTimeout(later, dynamicWait)

    if (callNow) {
      func(...args)
    }
  }
}

// Get terminal theme using unified resolver
const getTerminalTheme = (themeOverride?: string) => {
  const themeId = (themeOverride || userConfig?.theme || configStore.getUserConfig.theme || 'dark') as ThemeId
  return getResolvedTerminalTheme(themeId, { hasCustomBg: isTransparent.value === true })
}

// Initialize terminal
const initTerminal = async () => {
  if (!terminalRef.value) return

  userConfig = await serviceUserConfig.getConfig()

  const fontSize = userConfig?.fontSize || configStore.getUserConfig?.fontSize || 13
  const fontFamily = userConfig?.fontFamily || 'Menlo, Monaco, "Courier New", monospace'

  terminal.value = new Terminal({
    scrollback: userConfig?.scrollBack || 5000,
    cursorBlink: true,
    cursorStyle: userConfig?.cursorStyle || 'block',
    fontSize,
    fontFamily,
    allowTransparency: true,
    theme: getTerminalTheme()
  })

  fitAddon.value = new FitAddon()
  terminal.value.loadAddon(fitAddon.value)

  terminal.value.open(terminalRef.value)
  fitAddon.value.fit()

  // Connect to K8s cluster
  await connectToCluster()
}

// Handle command output collection for AI command mode (Windows PowerShell PTY)
const handleCommandOutput = (data: string) => {
  // Clean ANSI/OSC sequences for Windows PowerShell output
  const cleanOutput = data
    .replace(/\x1b\]0;[^\x07]*\x07/g, '')
    .replace(/\x1b\]9;[^\x07]*\x07/g, '')
    .replace(/\]0;[^\x07\n\r]*\x07?/g, '')
    .replace(/\]9;[^\x07\n\r]*\x07?/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*[ABCDEFGJKST]/g, '')
    .replace(/\x1b\[[0-9]*[XK]/g, '')
    .replace(/\x1b\[[0-9;]*[Hf]/g, '')
    .replace(/\x1b\[[?][0-9;]*[hl]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  commandOutput.value += cleanOutput

  const accumulatedOutput = commandOutput.value
  const lastNonEmptyLine = getLastNonEmptyLine(accumulatedOutput)

  if (lastNonEmptyLine && isTerminalPromptLine(lastNonEmptyLine)) {
    const tabId = currentCommandTabId.value

    // Use a short timer to allow any remaining data chunks to arrive
    if (commandOutputProcessTimer.value) clearTimeout(commandOutputProcessTimer.value)
    commandOutputProcessTimer.value = setTimeout(() => {
      commandOutputProcessTimer.value = null
      isCollectingOutput.value = false

      const outputText = commandOutput.value
      commandOutput.value = ''
      currentCommandTabId.value = undefined

      // Extract output lines, strip command echo and prompt
      const lines = outputText.split('\n')
      let startIdx = 0
      let endIdx = lines.length

      // Remove prompt line(s) from the end
      while (endIdx > 0) {
        const line = stripAnsiBasic(lines[endIdx - 1]).trim()
        if (!line || isTerminalPromptLine(line)) {
          endIdx--
        } else {
          break
        }
      }

      // Skip leading empty lines
      while (startIdx < endIdx && !stripAnsiBasic(lines[startIdx]).trim()) {
        startIdx++
      }

      // Skip command echo line(s) at the start.
      // Windows PTY echoes the sent command back; due to PTY buffering the echo
      // may have duplicate leading characters (e.g. "kkubectl" for "kubectl").
      // We strip any leading line whose cleaned text contains the sent command
      // as a substring, or whose cleaned text is a prefix/suffix of the command.
      const sentCmd = currentCommand.value
      currentCommand.value = ''
      if (sentCmd) {
        const normalize = (s: string) => stripAnsiBasic(s).replace(/\s+/g, ' ').trim()
        const normCmd = normalize(sentCmd)
        while (startIdx < endIdx) {
          const normLine = normalize(lines[startIdx])
          if (
            !normLine ||
            normLine === normCmd ||
            normCmd.includes(normLine) ||
            normLine.includes(normCmd) ||
            // PTY double-echo: "kkubectl..." — first char duplicated
            (normLine.length > 1 && normCmd.startsWith(normLine.slice(1)))
          ) {
            startIdx++
          } else {
            break
          }
        }
      }

      const outputLines = lines.slice(startIdx, endIdx)
      const finalOutput = outputLines.join('\n').trim()
      const toolResult = {
        output: finalOutput || 'Command executed successfully, no output returned',
        toolName: 'execute_command'
      }

      if (finalOutput) {
        const formattedOutput = `Terminal output:\n\`\`\`\n${finalOutput}\n\`\`\``
        eventBus.emit('sendMessageToAi', { content: formattedOutput, tabId, toolResult })
      } else {
        eventBus.emit('sendMessageToAi', { content: 'Command executed successfully, no output returned', tabId, toolResult })
      }
    }, 150)
  }
}

// Connect to K8s cluster
const connectToCluster = async () => {
  const cluster = props.serverInfo.data?.data || props.serverInfo.data
  if (!cluster || !cluster.id) {
    terminal.value?.writeln('Error: No cluster data provided')
    logger.error('No cluster data', { serverInfo: props.serverInfo })
    return
  }

  terminalId.value = uuidv4()
  logger.info('Connecting to K8s cluster', { clusterId: cluster.id, terminalId: terminalId.value })

  try {
    const cols = terminal.value?.cols || 80
    const rows = terminal.value?.rows || 24

    const result = await window.api.k8sTerminalCreate({
      id: terminalId.value,
      clusterId: cluster.id,
      namespace: cluster.default_namespace || 'default',
      cols,
      rows
    })

    if (result.success) {
      isConnected.value = true

      // Handle user input
      terminal.value?.onData((data) => {
        k8sApi.writeToTerminal(terminalId.value, data)
      })

      // Subscribe to terminal data
      const dataCleanup = k8sApi.onTerminalData(terminalId.value, (data) => {
        terminal.value?.write(data)
        // Collect output for AI command mode
        if (isCollectingOutput.value) {
          handleCommandOutput(data)
        }
      })
      cleanupFns.push(dataCleanup)

      // Subscribe to terminal exit
      const exitCleanup = k8sApi.onTerminalExit(terminalId.value, () => {
        terminal.value?.writeln('\r\n[Terminal session ended]')
        isConnected.value = false
      })
      cleanupFns.push(exitCleanup)

      logger.info('K8s terminal connected', { terminalId: terminalId.value })
    } else {
      terminal.value?.writeln(`Error: ${result.error || 'Failed to create terminal session'}`)
      logger.error('Failed to create K8s terminal', { error: result.error })
    }
  } catch (error) {
    terminal.value?.writeln(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    logger.error('K8s terminal connection error', { error })
  }
}

// Handle resize: fit first, then sync cols/rows to PTY (mirrors sshConnect.vue)
const handleResize = debounce(() => {
  if (fitAddon.value && terminal.value && terminalRef.value) {
    try {
      const rect = terminalRef.value.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        fitAddon.value.fit()
        const { cols, rows } = terminal.value
        if (isConnected.value && terminalId.value) {
          k8sApi.resizeTerminal(terminalId.value, cols, rows)
        }
      }
    } catch (error) {
      logger.error('Failed to resize K8s terminal', { error })
    }
  }
}, 100)

// Focus terminal
const focus = () => {
  terminal.value?.focus()
}

// Get terminal buffer content
const getTerminalBufferContent = (): string | null => {
  if (!terminal.value) return null
  const buffer = terminal.value.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i)
    if (line) {
      lines.push(line.translateToString())
    }
  }
  return lines.join('\n')
}

// Watch for active state changes
watch(
  () => props.isActive,
  (isActive) => {
    if (isActive) {
      nextTick(() => {
        handleResize()
        focus()
      })
    }
  }
)

// Setup ResizeObserver
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  initTerminal()

  // ResizeObserver with debounce (30ms leading-edge, mirrors sshConnect.vue)
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(
      debounce(
        () => {
          handleResize()
        },
        30,
        true
      )
    )
    resizeObserver.observe(containerRef.value)
  }

  window.addEventListener('resize', handleResize)

  nextTick(() => {
    setTimeout(() => {
      handleResize()
    }, 100)
  })

  // Sync theme changes (supports both legacy string and new ThemeChangePayload)
  const handleUpdateTheme = (payload: string | ThemeChangePayload) => {
    const themeId = (typeof payload === 'string' ? payload : payload.themeId) as ThemeId
    const actualTheme = getActualTheme(themeId)
    currentTheme.value = actualTheme
    if (terminal.value) {
      terminal.value.options.theme = getTerminalTheme(themeId)
    }
  }
  eventBus.on('updateTheme', handleUpdateTheme)
  cleanupFns.push(() => eventBus.off('updateTheme', handleUpdateTheme))

  // Re-apply terminal theme when the custom background image is toggled so
  // the xterm surface picks up the new transparent/opaque state immediately.
  const stopBgWatch = watch(
    () => configStore.getUserConfig.background.image,
    () => {
      if (terminal.value) {
        terminal.value.options.theme = getTerminalTheme()
      }
    }
  )
  cleanupFns.push(stopBgWatch)

  // Handle executeTerminalCommand for AI command mode
  const handleExecuteCommand = (payload: { command: string; tabId?: string }) => {
    if (!props.isActive) return
    if (!payload?.command) {
      logger.warn('handleExecuteCommand: command is empty')
      return
    }
    if (isConnected.value && terminalId.value) {
      // Start collecting output for AI command mode
      isCollectingOutput.value = true
      commandOutput.value = ''
      currentCommandTabId.value = payload.tabId
      currentCommand.value = payload.command.replace(/\r?\n$/, '').trim()
      k8sApi.writeToTerminal(terminalId.value, payload.command)
      terminal.value?.focus()
    }
  }
  eventBus.on('executeTerminalCommand', handleExecuteCommand)
  cleanupFns.push(() => eventBus.off('executeTerminalCommand', handleExecuteCommand))
})

onBeforeUnmount(() => {
  // Cleanup IPC listeners and event bus
  cleanupFns.forEach((fn) => fn())
  cleanupFns.length = 0

  // Close terminal session
  if (terminalId.value && isConnected.value) {
    window.api.k8sTerminalClose(terminalId.value)
  }

  // Cleanup ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  window.removeEventListener('resize', handleResize)

  // Dispose terminal
  if (terminal.value) {
    terminal.value.dispose()
    terminal.value = null
  }
})

defineExpose({
  handleResize,
  focus,
  getTerminalBufferContent
})
</script>

<style scoped>
.k8s-terminal-container {
  width: 100%;
  height: 100%;
  background: #141414;

  &.theme-light {
    background: #f5f5f5;
  }

  &.transparent-bg {
    background: transparent !important;
  }
}

.terminal-element {
  width: 100%;
  height: 100%;
}

.terminal-element :deep(.xterm) {
  height: 100%;
  padding: 8px;
}

.terminal-element :deep(.xterm-viewport) {
  overflow-y: auto !important;
}
</style>
