<template>
  <div
    class="card-wrapper"
    data-onboarding-id="asset-card"
  >
    <a-card
      class="asset-card"
      :class="{ 'asset-card-selected': selected, 'asset-card-selecting': selectionMode }"
      :bordered="false"
      @contextmenu.prevent="handleContextMenu"
      @click="handleClick"
      @dblclick="handleDoubleClick"
    >
      <div class="asset-card-content">
        <a-checkbox
          v-if="selectionMode"
          class="asset-checkbox"
          :checked="selected"
          :disabled="selectionDisabled || !asset.uuid"
          :aria-label="asset.title"
          @click.stop
          @dblclick.stop
          @change="handleSelect"
        />
        <div class="asset-icon">
          <!-- Switch icon for network switches -->
          <ClusterOutlined
            v-if="isSwitch(asset.asset_type)"
            style="font-size: 24px"
          />
          <!-- Default server icon -->
          <img
            v-else
            :src="laptopIcon"
            alt="server"
            style="width: 24px; height: 24px"
          />
          <!-- Enterprise indicator -->
          <div
            v-if="isOrganizationAsset(asset.asset_type)"
            class="enterprise-indicator"
          >
            <ApiOutlined />
          </div>
        </div>
        <div class="asset-info">
          <div class="asset-name">
            {{ asset.title }}
          </div>
          <div class="asset-type"> {{ t('personal.hostType') }}{{ asset.username ? ', ' + asset.username : '' }} </div>
        </div>
        <div
          v-if="!selectionMode"
          class="action-buttons"
        >
          <div
            class="action-button edit-button"
            :title="t('common.edit')"
            @click.stop="handleEdit"
          >
            <EditOutlined />
          </div>
          <div
            v-if="asset.asset_type !== 'organization'"
            class="action-button delete-button"
            :title="t('common.remove')"
            @click.stop="handleDelete"
          >
            <DeleteOutlined />
          </div>
        </div>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { EditOutlined, ApiOutlined, ClusterOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import i18n from '@/locales'
import type { AssetNode } from '../utils/types'
import { isSwitch, isOrganizationAsset } from '../utils/types'
import laptopIcon from '@/assets/menu/laptop.svg'

const { t } = i18n.global

interface Props {
  asset: AssetNode
  selectionMode?: boolean
  selected?: boolean
  selectionDisabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selectionMode: false,
  selected: false,
  selectionDisabled: false
})

const emit = defineEmits<{
  click: [asset: AssetNode]
  'double-click': [asset: AssetNode]
  edit: [asset: AssetNode]
  delete: [asset: AssetNode]
  'context-menu': [event: MouseEvent, asset: AssetNode]
  select: [asset: AssetNode]
}>()

const handleSelect = () => {
  if (props.selectionMode && !props.selectionDisabled && props.asset.uuid) {
    emit('select', props.asset)
  }
}

const handleClick = () => {
  if (props.selectionMode) {
    handleSelect()
    return
  }
  emit('click', props.asset)
}

const handleDoubleClick = () => {
  if (props.selectionMode) return
  emit('double-click', props.asset)
}

const handleEdit = () => {
  emit('edit', props.asset)
}

const handleDelete = () => {
  emit('delete', props.asset)
}

const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  if (props.selectionMode) return
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
  padding-right: 60px;
  background-color: var(--bg-color-card);
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

.asset-card-selecting {
  padding-right: 0;
}

.asset-card-selected {
  outline: 1px solid var(--primary-color, #1677ff);
  outline-offset: -1px;
  background-color: var(--active-bg-color);
}

.asset-checkbox {
  margin-right: 12px;
}

:global(body.has-custom-bg .asset-card) {
  background-color: var(--bg-color-secondary);
  box-shadow: inset 0 0 0 1px var(--border-color);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
}

.action-buttons {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.2s ease,
    color 0.2s ease;
}

.asset-card:hover .action-buttons {
  opacity: 1;
  pointer-events: auto;
}

.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: var(--text-color-tertiary);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: transparent;

  &:hover {
    background-color: var(--hover-bg-color);
    color: #1890ff;
  }

  &:active {
    transform: scale(0.95);
  }
}

.edit-button:hover {
  color: #1890ff;
}

.delete-button:hover {
  color: #ff6b6b;
  background-color: rgba(255, 107, 107, 0.15);
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

  img {
    filter: brightness(0) saturate(100%) invert(48%) sepia(57%) saturate(2303%) hue-rotate(198deg) brightness(102%) contrast(96%);
  }

  :global(.light-theme) & img {
    filter: brightness(0) saturate(100%) invert(31%) sepia(98%) saturate(1720%) hue-rotate(199deg) brightness(95%) contrast(107%);
  }
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
  display: flex;
  align-items: center;
  gap: 6px;
}

.asset-type {
  font-size: 12px;
  color: var(--text-color-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
