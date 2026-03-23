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
import eventBus from '@/utils/eventBus'

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

// Get terminal theme matching sshConnect.vue
const getTerminalTheme = (themeOverride?: string) => {
  const theme = themeOverride || getActualTheme(userConfig?.theme || configStore.getUserConfig.theme || 'dark')
  const hasBackground = !!(userConfig?.background?.image || configStore.getUserConfig.background.image)
  if (theme === 'light') {
    return {
      background: hasBackground ? 'rgba(245, 245, 245, 0.82)' : '#f5f5f5',
      foreground: '#000000',
      cursor: '#000000',
      cursorAccent: '#000000',
      selectionBackground: '#add6ff80',
      selectionInactiveBackground: '#add6ff5a'
    }
  }
  return {
    background: hasBackground ? 'transparent' : '#141414',
    foreground: '#e0e0e0',
    cursor: '#e0e0e0',
    cursorAccent: '#e0e0e0',
    selectionBackground: 'rgba(255, 255, 255, 0.3)',
    selectionInactiveBackground: 'rgba(255, 255, 255, 0.2)'
  }
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

  // Sync theme changes (mirrors sshConnect.vue handleUpdateTheme)
  const handleUpdateTheme = (theme: string) => {
    const actualTheme = getActualTheme(theme)
    currentTheme.value = actualTheme
    if (terminal.value) {
      terminal.value.options.theme = getTerminalTheme(actualTheme)
    }
  }
  eventBus.on('updateTheme', handleUpdateTheme)
  cleanupFns.push(() => eventBus.off('updateTheme', handleUpdateTheme))
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
