<template>
  <div
    v-if="visible"
    class="context-menu"
    :style="{ top: position.y + 'px', left: position.x + 'px' }"
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
import { ApiOutlined, EditOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons-vue'
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

// Emits
const emit = defineEmits<{
  close: []
  connect: []
  edit: []
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

const handleRefresh = () => {
  emit('refresh')
}

const handleRemove = () => {
  emit('remove')
}
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
