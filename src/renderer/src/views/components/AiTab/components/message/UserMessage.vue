<template>
  <div
    ref="wrapperRef"
    class="user-message-wrapper"
  >
    <!-- Opaque backdrop (always rendered for sticky positioning) -->
    <div class="user-message-backdrop"></div>

    <div
      v-if="isEditing"
      class="user-message-edit-container"
      @keydown.esc="cancelEditing"
    >
      <InputSendContainer
        ref="inputSendContainerRef"
        :is-active-tab="true"
        mode="edit"
        :initial-value="typeof message.content === 'string' ? message.content : ''"
        :on-confirm-edit="handleConfirmEdit"
      />
    </div>
    <div
      v-else
      ref="contentRef"
      class="user-message-content"
      :class="{ 'user-message-content--masked': shouldShowMask }"
      @click="startEditing"
    >
      <!-- User message content -->
      <div class="user-message">
        {{ message.content }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { isElementInAiTab } from '@/utils/domUtils'
import type { ChatMessage } from '../../types'
import InputSendContainer from '../InputSendContainer.vue'

interface Props {
  message: ChatMessage
}

const props = withDefaults(defineProps<Props>(), {})

// Define events
const emit = defineEmits<{
  (e: 'truncate-and-send', payload: { message: ChatMessage; newContent: string }): void
}>()

// Template refs
const contentRef = ref<HTMLElement | null>(null)
const wrapperRef = ref<HTMLElement | null>(null)

// Reactive state to control mask visibility
const shouldShowMask = ref(false)

// ResizeObserver instance
let resizeObserver: ResizeObserver | null = null

// Editing state
const isEditing = ref(false)
const inputSendContainerRef = ref<InstanceType<typeof InputSendContainer> | null>(null)

const startEditing = async () => {
  isEditing.value = true
  await nextTick()
  inputSendContainerRef.value?.focus()
}

// Custom global click handler to replace onClickOutside
const handleGlobalClick = (e: MouseEvent) => {
  if (!isEditing.value) return

  const target = e.target as HTMLElement

  if (wrapperRef.value?.contains(target)) {
    return
  }

  if (!isElementInAiTab(target)) {
    return
  }

  const antPopupClasses = [
    'ant-select-dropdown',
    'ant-select-item',
    'ant-select-item-option',
    'ant-dropdown-menu',
    'ant-dropdown-menu-item',
    'ant-picker-dropdown',
    'ant-modal-wrap',
    'ant-tooltip',
    'ant-popover',
    'ant-notification',
    'ant-message'
  ]

  for (const className of antPopupClasses) {
    if (target.closest(`.${className}`)) {
      return
    }
  }

  const antPopupSelectors = [
    '.ant-select-dropdown',
    '.ant-dropdown-menu',
    '.ant-picker-dropdown',
    '.ant-modal-wrap',
    '.ant-tooltip',
    '.ant-popover',
    '.ant-notification',
    '.ant-message'
  ]

  for (const selector of antPopupSelectors) {
    const popup = document.querySelector(selector)
    if (popup?.contains(target)) {
      return
    }
  }

  cancelEditing()
}

const cancelEditing = () => {
  isEditing.value = false
}

const handleConfirmEdit = (newContent: string) => {
  emit('truncate-and-send', {
    message: props.message,
    newContent
  })

  isEditing.value = false
}

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
    resizeObserver.observe(contentRef.value)
    checkOverflow()
  }

  // Add global click listener for handling clicks outside edit mode
  // Use nextTick to avoid triggering immediately on mount
  nextTick(() => {
    document.addEventListener('click', handleGlobalClick, true)
  })
})

// Cleanup ResizeObserver when component is unmounted
onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  document.removeEventListener('click', handleGlobalClick, true)
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

  // Editable style
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.85;

    .user-message {
      background-color: var(--hover-bg-color);
    }
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

.user-message-edit-container {
  position: relative;
  z-index: 5;
  width: 100%;
}
</style>
