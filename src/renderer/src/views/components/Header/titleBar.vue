<template>
  <div
    v-if="!platform.includes('darwin')"
    class="window-controls"
  >
    <div
      class="window-control-btn"
      @click="handleMinimize"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 11 11"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M1 5.5H10"
          stroke="currentColor"
          stroke-width="1"
        />
      </svg>
    </div>
    <div
      class="window-control-btn"
      @click="handleMaximize"
    >
      <svg
        v-if="!isMaximized"
        width="11"
        height="11"
        viewBox="0 0 11 11"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="1.5"
          y="1.5"
          width="8"
          height="8"
          stroke="currentColor"
          stroke-width="1"
        />
      </svg>
      <svg
        v-else
        width="11"
        height="11"
        viewBox="0 0 11 11"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="1.5"
          y="3.5"
          width="6"
          height="6"
          stroke="currentColor"
          stroke-width="1"
        />
        <line
          x1="3"
          y1="2"
          x2="9"
          y2="2"
          stroke="currentColor"
          stroke-width="1"
        />
        <line
          x1="9"
          y1="2"
          x2="9"
          y2="8"
          stroke="currentColor"
          stroke-width="1"
        />
      </svg>
    </div>
    <div
      class="window-control-btn close-btn"
      @click="handleClose"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 11 11"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M1 1L10 10M10 1L1 10"
          stroke="currentColor"
          stroke-width="1"
        />
      </svg>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
const api = window.api as any
const platform = ref('')
const isMaximized = ref(false)

let cleanupMaximized: undefined | (() => void)
let cleanupUnmaximized: undefined | (() => void)

onMounted(async () => {
  platform.value = await api.getPlatform()
  if (!platform.value.includes('darwin')) {
    isMaximized.value = await api.isMaximized()

    cleanupMaximized = api.onMaximized(() => {
      isMaximized.value = true
    })

    cleanupUnmaximized = api.onUnmaximized(() => {
      isMaximized.value = false
    })
  }
})

onUnmounted(() => {
  cleanupMaximized?.()
  cleanupUnmaximized?.()
})

const handleMinimize = () => {
  api.minimizeWindow()
}

const handleMaximize = async () => {
  isMaximized.value = await api.isMaximized()
  if (isMaximized.value) {
    await api.unmaximizeWindow()
  } else {
    await api.maximizeWindow()
  }
}

const handleClose = () => {
  api.closeWindow()
}
</script>
<style lang="less" scoped>
.window-controls {
  display: flex;
  height: 100%;
  width: 120px;
  .window-control-btn {
    -webkit-app-region: no-drag;
    width: 46px;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    color: var(--text-color);
    transition: all 0.2s;

    &:hover {
      background-color: var(--hover-bg-color);
    }

    &.close-btn:hover {
      background-color: #e81123;
      color: white;
    }
  }
}
</style>
