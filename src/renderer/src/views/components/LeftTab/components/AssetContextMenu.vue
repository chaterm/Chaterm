<template>
  <div
    v-if="visible"
    ref="contextMenuRef"
    class="context-menu"
    :style="menuStyle"
    @click="handleClose"
  >
    <div
      v-if="asset?.asset_type !== 'organization'"
      class="context-menu-item"
      @click.stop="handleConnect"
    >
      <div class="context-menu-icon"><ApiOutlined /></div>
      <div>{{ t('common.connect') }}</div>
    </div>

    <div
      class="context-menu-item"
      @click.stop="handleEdit"
    >
      <div class="context-menu-icon"><EditOutlined /></div>
      <div>{{ t('common.edit') }}</div>
    </div>

    <div
      v-if="asset?.asset_type !== 'organization'"
      class="context-menu-item"
      @click.stop="handleClone"
    >
      <div class="context-menu-icon"><CopyOutlined /></div>
      <div>{{ t('common.clone') }}</div>
    </div>

    <div
      v-if="asset?.asset_type === 'organization'"
      class="context-menu-item"
      @click.stop="handleRefresh"
    >
      <div class="context-menu-icon"><ReloadOutlined /></div>
      <div>{{ t('personal.refreshAssets') }}</div>
    </div>

    <div
      class="context-menu-item delete"
      @click.stop="handleRemove"
    >
      <div class="context-menu-icon"><DeleteOutlined /></div>
      <div>{{ t('common.remove') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { ApiOutlined, EditOutlined, ReloadOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons-vue'
import i18n from '@/locales'
import type { AssetNode, Position } from '../types'

const { t } = i18n.global

// Props
interface Props {
  visible: boolean
  position: Position
  asset: AssetNode | null
}

const props = defineProps<Props>()

// Refs
const contextMenuRef = ref<HTMLElement | null>(null)

// State
const actualMenuSize = ref({ width: 150, height: 200 })

// Computed
const menuStyle = computed(() => {
  if (!props.visible) return {}

  const { x, y } = props.position
  const { width: menuWidth, height: menuHeight } = actualMenuSize.value
  const padding = 10 // margin

  // Get window dimensions
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  // Calculate adjusted position
  let adjustedX = x
  let adjustedY = y

  // Horizontal position adjustment
  if (x + menuWidth + padding > windowWidth) {
    adjustedX = windowWidth - menuWidth - padding
  }
  if (adjustedX < padding) {
    adjustedX = padding
  }

  // Vertical position adjustment
  if (y + menuHeight + padding > windowHeight) {
    adjustedY = windowHeight - menuHeight - padding
  }
  if (adjustedY < padding) {
    adjustedY = padding
  }

  return {
    top: `${adjustedY}px`,
    left: `${adjustedX}px`
  }
})

// Emits
const emit = defineEmits<{
  close: []
  connect: []
  edit: []
  clone: []
  refresh: []
  remove: []
}>()

// Methods
const handleClose = () => {
  emit('close')
}

const handleConnect = () => {
  emit('connect')
}

const handleEdit = () => {
  emit('edit')
}

const handleClone = () => {
  emit('clone')
}

const handleRefresh = () => {
  emit('refresh')
}

const handleRemove = () => {
  emit('remove')
}

// Update actual menu size
const updateMenuSize = () => {
  if (contextMenuRef.value) {
    const rect = contextMenuRef.value.getBoundingClientRect()
    actualMenuSize.value = {
      width: rect.width,
      height: rect.height
    }
  }
}

// Watch menu visibility state and update size
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      nextTick(() => {
        updateMenuSize()
      })
    }
  }
)
</script>

<style lang="less" scoped>
.context-menu {
  position: fixed;
  z-index: 1000;
  background-color: var(--bg-color);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 150px;
  padding: 5px 0;
}

.context-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-color);
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--hover-bg-color);
  }

  &.delete {
    color: #ff4d4f;

    &:hover {
      background-color: rgba(255, 77, 79, 0.15);
    }
  }
}

.context-menu-icon {
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
}
</style>
