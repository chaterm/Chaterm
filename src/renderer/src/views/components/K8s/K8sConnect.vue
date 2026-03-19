<template>
  <div
    ref="containerRef"
    class="k8s-terminal-container"
  >
    <div
      ref="terminalRef"
      class="terminal-element"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import * as k8sApi from '@/api/k8s'
import { v4 as uuidv4 } from 'uuid'
import { userConfigStore } from '@/store/userConfigStore'

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

// Get terminal theme based on user config
const getTerminalTheme = () => {
  return {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    cursorAccent: '#1e1e1e',
    selectionBackground: '#264f78',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#e5e5e5'
  }
}

// Initialize terminal
const initTerminal = async () => {
  if (!terminalRef.value) return

  const fontSize = configStore.getUserConfig?.fontSize || 13

  terminal.value = new Terminal({
    scrollback: 5000,
    cursorBlink: true,
    cursorStyle: 'block',
    fontSize,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
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
  // serverInfo.data contains the original item, which has data.data as the cluster
  // or serverInfo.data is the cluster directly
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

      // Handle resize
      terminal.value?.onResize((size) => {
        k8sApi.resizeTerminal(terminalId.value, size.cols, size.rows)
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

// Handle resize
const handleResize = () => {
  if (fitAddon.value) {
    nextTick(() => {
      fitAddon.value?.fit()
    })
  }
}

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

  // Setup ResizeObserver
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  // Cleanup IPC listeners
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
  background: #1e1e1e;
}

.terminal-element {
  width: 100%;
  height: 100%;
  padding: 8px;
}

.terminal-element :deep(.xterm) {
  height: 100%;
}

.terminal-element :deep(.xterm-viewport) {
  overflow-y: auto !important;
}
</style>
