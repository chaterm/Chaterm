<template>
  <div
    ref="dragResize"
    class="draggable"
    :style="containerStyle"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseleave="resetCursor"
  >
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onUnmounted, shallowRef, watch, CSSProperties } from 'vue'

interface Props {
  width?: number
  height?: number
  x?: number
  y?: number
  dragHandle?: string
  zIndex?: number
  boundaryEl?: HTMLElement | null
}
const dragResize = ref()

const dragStatus = shallowRef(true)
// TODO
// const resizeStatus = shallowRef(true)
const props = defineProps<Props>()
const emit = defineEmits(['dragStop', 'resizeStop'])

const position = reactive({
  x: props.x || 100,
  y: props.y || 100,
  width: props.width || 200,
  height: props.height || 200,
  boundaryEl: null
})

watch(
  () => props.x,
  (newVal) => {
    if (newVal !== undefined) position.x = newVal
  }
)

watch(
  () => props.y,
  (newVal) => {
    if (newVal !== undefined) position.y = newVal
  }
)

watch(
  () => props.width,
  (newVal) => {
    if (newVal !== undefined) position.width = newVal
  }
)

watch(
  () => props.height,
  (newVal) => {
    if (newVal !== undefined) position.height = newVal
  }
)

const isDragging = ref(false)
const isResizing = ref(false)
const currentStatus = ref('bottom')

const startData = reactive({
  mouseX: 0,
  mouseY: 0,
  startX: position.x,
  startY: position.y,
  startWidth: position.width,
  startHeight: position.height
})

const containerStyle = computed(
  (): CSSProperties => ({
    position: 'absolute',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${position.width}px`,
    height: `${position.height}px`,
    zIndex: props.zIndex || 'auto'
  })
)

const handleMouseDown = (event: MouseEvent) => {
  if (props.dragHandle) {
    let target = event.target as HTMLElement | null
    while (target) {
      if (target.matches?.(props.dragHandle)) {
        dragStatus.value = true
        startDragResize(event, true, true)
        return
      }
      target = target.parentElement
    }
  }
  startDragResize(event, true, false)
}

const startDragResize = (event: MouseEvent, startResize: boolean, startDrag: boolean) => {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()

  const mouseX = event.clientX
  const mouseY = event.clientY

  const buffer = 5

  if (mouseX >= rect.left - buffer && mouseX <= rect.left + buffer) {
    if (mouseY >= rect.top - buffer && mouseY <= rect.top + buffer) {
      currentStatus.value = 'left-top'
    } else if (mouseY >= rect.bottom - buffer && mouseY <= rect.bottom + buffer) {
      currentStatus.value = 'left-bottom'
    } else {
      currentStatus.value = 'left'
    }
  } else if (mouseX >= rect.right - buffer && mouseX <= rect.right + buffer) {
    if (mouseY >= rect.top - buffer && mouseY <= rect.top + buffer) {
      currentStatus.value = 'right-top'
    } else if (mouseY >= rect.bottom - buffer && mouseY <= rect.bottom + buffer) {
      currentStatus.value = 'right-bottom'
    } else {
      currentStatus.value = 'right'
    }
  } else if (mouseY >= rect.top - buffer && mouseY <= rect.top + buffer) {
    if (mouseX >= rect.left - buffer && mouseX <= rect.left + buffer) {
      currentStatus.value = 'top-left'
    } else if (mouseX >= rect.right - buffer && mouseX <= rect.right + buffer) {
      currentStatus.value = 'top-right'
    } else {
      currentStatus.value = 'top'
    }
  } else if (mouseY >= rect.bottom - buffer && mouseY <= rect.bottom + buffer) {
    if (mouseX >= rect.left - buffer && mouseX <= rect.left + buffer) {
      currentStatus.value = 'bottom-left'
    } else if (mouseX >= rect.right - buffer && mouseX <= rect.right + buffer) {
      currentStatus.value = 'bottom-right'
    } else {
      currentStatus.value = 'bottom'
    }
  } else {
    currentStatus.value = ''
  }

  if (currentStatus.value || !dragStatus.value) {
    if (startResize) {
      isResizing.value = true
      startData.mouseX = mouseX
      startData.mouseY = mouseY
      startData.startWidth = position.width
      startData.startHeight = position.height
      startData.startX = position.x
      startData.startY = position.y
      document.addEventListener('mousemove', handleResizing)
      document.addEventListener('mouseup', stopResizing)
    }
  } else {
    if (startDrag) {
      isDragging.value = true
      startData.mouseX = mouseX
      startData.mouseY = mouseY
      startData.startX = position.x
      startData.startY = position.y
      document.addEventListener('mousemove', handleDragging)
      document.addEventListener('mouseup', stopDragging)
    }
  }
}
const handleDragging = (event: MouseEvent) => {
  if (!isDragging.value) return

  const deltaX = event.clientX - startData.mouseX
  const deltaY = event.clientY - startData.mouseY

  const targetX = startData.startX + deltaX
  const targetY = startData.startY + deltaY

  const rect = props.boundaryEl?.getBoundingClientRect()
  const boundaryW = rect?.width ?? window.innerWidth
  const boundaryH = rect?.height ?? window.innerHeight

  // Your original logic to preserve visible area (keep 35/50)
  const minY = 35
  const maxY = boundaryH - 50
  if (targetY < minY) position.y = minY
  else if (targetY > maxY) position.y = maxY
  else position.y = targetY

  const minX = 0
  const maxX = boundaryW - 50
  if (targetX < minX) position.x = minX
  else if (targetX > maxX) position.x = maxX
  else position.x = targetX
}

const stopDragging = () => {
  isDragging.value = false
  emit('dragStop', { x: position.x, y: position.y })
  document.removeEventListener('mousemove', handleDragging)
  document.removeEventListener('mouseup', stopDragging)
}

const handleResizing = (event: MouseEvent) => {
  if (!isResizing.value) return

  const deltaX = event.clientX - startData.mouseX
  const deltaY = event.clientY - startData.mouseY
  switch (currentStatus.value) {
    case 'top':
      position.height = startData.startHeight - deltaY
      position.y = startData.startY + deltaY
      break
    case 'bottom':
      position.height = startData.startHeight + deltaY
      break
    case 'left':
      position.width = startData.startWidth - deltaX
      position.x = startData.startX + deltaX
      break
    case 'right':
      position.width = startData.startWidth + deltaX
      break
    case 'top-left':
      position.height = startData.startHeight - deltaY
      position.y = startData.startY + deltaY
      position.width = startData.startWidth - deltaX
      position.x = startData.startX + deltaX
      break
    case 'left-top':
      position.height = startData.startHeight - deltaY
      position.y = startData.startY + deltaY
      position.width = startData.startWidth - deltaX
      position.x = startData.startX + deltaX
      break
    case 'top-right':
      position.height = startData.startHeight - deltaY
      position.y = startData.startY + deltaY
      position.width = startData.startWidth + deltaX
      break
    case 'right-top':
      position.height = startData.startHeight - deltaY
      position.y = startData.startY + deltaY
      position.width = startData.startWidth + deltaX
      break
    case 'bottom-right':
      position.height = startData.startHeight + deltaY
      position.width = startData.startWidth + deltaX
      break
    case 'right-bottom':
      position.height = startData.startHeight + deltaY
      position.width = startData.startWidth + deltaX
      break
    case 'bottom-left':
      position.height = startData.startHeight + deltaY
      position.width = startData.startWidth - deltaX
      position.x = startData.startX + deltaX
      break
    case 'left-bottom':
      position.height = startData.startHeight + deltaY
      position.width = startData.startWidth - deltaX
      position.x = startData.startX + deltaX
      break
  }
}

const stopResizing = () => {
  isResizing.value = false
  currentStatus.value = ''
  emit('resizeStop', {
    x: position.x,
    y: position.y,
    height: position.height,
    width: position.width
  })
  document.removeEventListener('mousemove', handleResizing)
  document.removeEventListener('mouseup', stopResizing)
}

const handleMouseMove = (event: MouseEvent) => {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()

  const mouseX = event.clientX
  const mouseY = event.clientY

  const buffer = 5

  let cursor = 'default'

  if (mouseX >= rect.left - buffer && mouseX <= rect.left + buffer) {
    if (mouseY >= rect.top - buffer && mouseY <= rect.top + buffer) {
      cursor = 'nwse-resize'
    } else if (mouseY >= rect.bottom - buffer && mouseY <= rect.bottom + buffer) {
      cursor = 'nesw-resize'
    } else {
      cursor = 'ew-resize'
    }
  } else if (mouseX >= rect.right - buffer && mouseX <= rect.right + buffer) {
    if (mouseY >= rect.top - buffer && mouseY <= rect.top + buffer) {
      cursor = 'nesw-resize'
    } else if (mouseY >= rect.bottom - buffer && mouseY <= rect.bottom + buffer) {
      cursor = 'nwse-resize'
    } else {
      cursor = 'ew-resize'
    }
  } else if (mouseY >= rect.top - buffer && mouseY <= rect.top + buffer) {
    if (mouseX >= rect.left - buffer && mouseX <= rect.left + buffer) {
      cursor = 'nesw-resize'
    } else if (mouseX >= rect.right - buffer && mouseX <= rect.right + buffer) {
      cursor = 'nwse-resize'
    } else {
      cursor = 'ns-resize'
    }
  } else if (mouseY >= rect.bottom - buffer && mouseY <= rect.bottom + buffer) {
    if (mouseX >= rect.left - buffer && mouseX <= rect.left + buffer) {
      cursor = 'nwse-resize'
    } else if (mouseX >= rect.right - buffer && mouseX <= rect.right + buffer) {
      cursor = 'nesw-resize'
    } else {
      cursor = 'ns-resize'
    }
  }
  target.style.cursor = cursor
}

const resetCursor = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  target?.style && (target.style.cursor = 'default')
}

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDragging)
  document.removeEventListener('mouseup', stopDragging)
  document.removeEventListener('mousemove', handleResizing)
  document.removeEventListener('mouseup', stopResizing)
})
</script>

<style scoped>
.draggable {
  background-color: #2d2d2d;
  border: 1px solid #2d2d2d;
}
</style>
