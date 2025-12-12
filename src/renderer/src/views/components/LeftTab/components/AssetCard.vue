<template>
  <div class="card-wrapper">
    <a-card
      class="asset-card"
      :bordered="false"
      @contextmenu.prevent="handleContextMenu"
      @click="handleClick"
      @dblclick="handleDoubleClick"
    >
      <div class="asset-card-content">
        <div class="asset-icon">
          <DatabaseOutlined style="font-size: 24px" />
          <div
            v-if="asset.asset_type === 'organization'"
            class="enterprise-indicator"
          >
            <ApiOutlined />
          </div>
        </div>
        <div class="asset-info">
          <div class="asset-name">{{ asset.title }}</div>
          <div class="asset-type"> {{ t('personal.hostType') }}{{ asset.username ? ', ' + asset.username : '' }} </div>
        </div>
        <div
          class="edit-icon"
          @click.stop="handleEdit"
        >
          <EditOutlined />
        </div>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { DatabaseOutlined, EditOutlined, ApiOutlined } from '@ant-design/icons-vue'
import i18n from '@/locales'
import type { AssetNode } from '../utils/types'

const { t } = i18n.global

interface Props {
  asset: AssetNode
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: [asset: AssetNode]
  'double-click': [asset: AssetNode]
  edit: [asset: AssetNode]
  'context-menu': [event: MouseEvent, asset: AssetNode]
}>()

const handleClick = () => {
  emit('click', props.asset)
}

const handleDoubleClick = () => {
  emit('double-click', props.asset)
}

const handleEdit = () => {
  emit('edit', props.asset)
}

const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  emit('context-menu', event, props.asset)
}
</script>

<style lang="less" scoped>
.card-wrapper {
  margin-bottom: 0;
  transition: width 0.3s ease;
}

.asset-card {
  position: relative;
  padding-right: 36px;
  background-color: var(--bg-color-secondary);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background-color: var(--hover-bg-color);
  }

  :deep(.ant-card-body) {
    padding: 8px 12px;
  }
}

.edit-icon {
  position: absolute;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  color: var(--text-color-tertiary);
  font-size: 22px;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.2s ease,
    color 0.2s ease;
}

.asset-card:hover .edit-icon {
  opacity: 1;
  pointer-events: auto;
}

.edit-icon:hover {
  color: #1890ff;
}

.asset-card-content {
  display: flex;
  align-items: center;
  min-height: 48px;
}

.asset-icon {
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1890ff;
  margin-right: 8px;
  position: relative;
}

.enterprise-indicator {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 14px;
  height: 14px;
  background-color: #1890ff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bg-color);

  :deep(.anticon) {
    font-size: 8px;
    color: white;
  }
}

.asset-info {
  flex: 1;
  overflow: hidden;
}

.asset-name {
  font-size: 13px;
  font-weight: bold;
  color: var(--text-color);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-type {
  font-size: 12px;
  color: var(--text-color-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
