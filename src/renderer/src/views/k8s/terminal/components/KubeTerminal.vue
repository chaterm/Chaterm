<template>
  <div
    ref="containerRef"
    class="kube-terminal"
    :class="{ visible }"
  >
    <div
      ref="terminalRef"
      class="terminal-element"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import * as k8sApi from '@/api/k8s'

const props = defineProps<{
  terminalId: string
  clusterId: string
  namespace: string
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const terminalRef = ref<HTMLElement | null>(null)
const terminal = ref<Terminal | null>(null)
const fitAddon = ref<FitAddon | null>(null)

// Cleanup functions for IPC listeners
const cleanupFns: Array<() => void> = []

// Initialize terminal
const initTerminal = () => {
  if (!terminalRef.value) return

  terminal.value = new Terminal({
    scrollback: 5000,
    cursorBlink: true,
    cursorStyle: 'block',
    fontSize: 13,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
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
  })

  fitAddon.value = new FitAddon()
  terminal.value.loadAddon(fitAddon.value)

  terminal.value.open(terminalRef.value)
  fitAddon.value.fit()

  // Handle user input
  terminal.value.onData((data) => {
    k8sApi.writeToTerminal(props.terminalId, data)
  })

  // Handle resize
  terminal.value.onResize((size) => {
    k8sApi.resizeTerminal(props.terminalId, size.cols, size.rows)
  })

  // Subscribe to terminal data
  const dataCleanup = k8sApi.onTerminalData(props.terminalId, (data) => {
    terminal.value?.write(data)
  })
  cleanupFns.push(dataCleanup)

  // Subscribe to terminal exit
  const exitCleanup = k8sApi.onTerminalExit(props.terminalId, () => {
    terminal.value?.writeln('\r\n[Terminal session ended]')
  })
  cleanupFns.push(exitCleanup)
}

// Handle resize
const handleResize = () => {
  if (fitAddon.value && props.visible) {
    fitAddon.value.fit()
  }
}

// Watch for visibility changes
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      nextTick(() => {
        handleResize()
        terminal.value?.focus()
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

  // Initial resize
  nextTick(() => {
    handleResize()
  })
})

onBeforeUnmount(() => {
  // Cleanup IPC listeners
  cleanupFns.forEach((fn) => fn())
  cleanupFns.length = 0

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
</script>

<style scoped>
.kube-terminal {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: none;
  background: #1e1e1e;
}

.kube-terminal.visible {
  display: block;
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
