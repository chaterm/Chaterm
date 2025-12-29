<template>
  <div class="user-message-wrapper">
    <!-- Opaque backdrop (always rendered for sticky positioning) -->
    <div class="user-message-backdrop"></div>

    <!-- Content wrapper with max-height and gradient mask -->
    <div
      ref="contentRef"
      class="user-message-content"
      :class="{ 'user-message-content--masked': shouldShowMask }"
    >
      <!-- User message content -->
      <div class="user-message">
        {{ message.content }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { ChatMessage } from '../../types'

interface Props {
  message: ChatMessage
}

defineProps<Props>()

// Template ref for the content container
const contentRef = ref<HTMLElement | null>(null)

// Reactive state to control mask visibility
const shouldShowMask = ref(false)

// ResizeObserver instance
let resizeObserver: ResizeObserver | null = null

// Check if content overflows the container
const checkOverflow = () => {
  if (contentRef.value) {
    // Compare scrollHeight (actual content height) with clientHeight (visible height)
    // If scrollHeight > clientHeight, content is overflowing
    shouldShowMask.value = contentRef.value.scrollHeight > contentRef.value.clientHeight
  }
}

// Setup ResizeObserver when component is mounted
onMounted(() => {
  if (contentRef.value) {
    // Create ResizeObserver to watch for size changes
    resizeObserver = new ResizeObserver(() => {
      checkOverflow()
    })

    // Start observing the content container
    resizeObserver.observe(contentRef.value)

    // Initial check
    checkOverflow()
  }
})

// Cleanup ResizeObserver when component is unmounted
onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<style scoped lang="less">
.user-message-wrapper {
  padding: 0px 4px;
  // padding: 0px 4px 8px 4px;
  margin: 0px 0px 8px 0px;

  width: 100%;
  position: relative;

  // Sticky positioning - apply to wrapper for correct scope
  position: sticky;
  top: 0;
  z-index: 3;

  // Add a pseudo-element to create gradient fade zone below the sticky message
  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    height: 20px;
    background: linear-gradient(to bottom, var(--bg-color) 0%, transparent 100%);
    pointer-events: none;
    z-index: 4;
  }
}

.user-message-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-color);
  z-index: 1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.user-message-content {
  // Apply max-height and overflow hidden for content truncation
  width: 100%;
  max-height: 84px;
  overflow: hidden;

  // Position relative to allow backdrop to be behind
  position: relative;
  z-index: 2;

  // Apply gradient mask only when content overflows
  &--masked {
    mask-image: linear-gradient(to bottom, black 65%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, black 65%, transparent 100%);
  }
}

.user-message {
  // Layout - full width
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;

  // Visual styles - maintain original appearance
  background-color: var(--bg-color-secondary);
  color: var(--text-color);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;

  // Text handling
  overflow-wrap: break-word;
  word-break: break-word;
  user-select: text;
}
</style>
