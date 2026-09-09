<template>
  <div class="asset-list-container">
    <div
      v-if="selectionMode"
      class="selection-toolbar"
    >
      <a-checkbox
        :checked="allVisibleSelected"
        :indeterminate="someVisibleSelected && !allVisibleSelected"
        :disabled="selectionDisabled || visibleAssetUuids.length === 0"
        @change="toggleVisibleSelection"
      >
        {{ searchValue.trim() ? t('personal.selectAllMatchingHosts') : t('personal.selectAll') }}
      </a-checkbox>
      <span class="selection-count">{{ t('personal.selectedCount', { count: selectedUuids.length }) }}</span>
      <a-button
        size="small"
        :disabled="selectionDisabled || selectedUuids.length === 0"
        @click="emit('selection-change', [])"
      >
        {{ t('personal.clearSelection') }}
      </a-button>
      <a-button
        size="small"
        danger
        :loading="selectionDisabled"
        :disabled="selectionDisabled || selectedUuids.length === 0"
        @click="emit('batch-delete')"
      >
        <template #icon><DeleteOutlined /></template>
        {{ t('personal.batchDelete') }}
      </a-button>
    </div>
    <template
      v-for="group in filteredAssetGroups"
      :key="group.key"
    >
      <div class="group-title">
        <a-checkbox
          v-if="selectionMode"
          :checked="isGroupSelected(group)"
          :indeterminate="isGroupPartiallySelected(group)"
          :disabled="selectionDisabled || getGroupUuids(group).length === 0"
          @change="toggleGroupSelection(group)"
        >
          {{ group.title }}
        </a-checkbox>
        <template v-else>{{ group.title }}</template>
      </div>
      <div
        class="host-cards"
        :class="{ 'wide-layout': wideLayout }"
      >
        <assetCard
          v-for="host in group.children"
          :key="host.uuid || host.key"
          :asset="host"
          :selection-mode="selectionMode"
          :selected="!!host.uuid && selectedUuidSet.has(host.uuid)"
          :selection-disabled="selectionDisabled"
          @select="toggleAssetSelection"
          @click="handleAssetClick"
          @double-click="handleAssetDoubleClick"
          @edit="handleAssetEdit"
          @delete="handleAssetDelete"
          @context-menu="handleAssetContextMenu"
        />
      </div>
    </template>

    <div
      v-if="filteredAssetGroups.length === 0"
      class="empty-state"
    >
      <div class="empty-icon">
        <LaptopOutlined class="empty-icon-svg" />
      </div>
      <div class="empty-title">
        {{ searchValue ? t('common.noSearchResults') : t('personal.noAssets') }}
      </div>
      <div
        v-if="!searchValue"
        class="empty-description"
      >
        {{ t('personal.emptyAssetsDescription') }}
      </div>
      <div
        v-if="!searchValue"
        class="empty-actions"
      >
        <a-button
          type="primary"
          size="small"
          @click="emit('empty-new-asset')"
        >
          <template #icon>
            <PlusOutlined />
          </template>
          {{ t('personal.newHost') }}
        </a-button>
        <a-button
          size="small"
          @click="emit('empty-import-assets')"
        >
          <template #icon>
            <ImportOutlined />
          </template>
          {{ t('personal.import') }}
        </a-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DeleteOutlined, ImportOutlined, LaptopOutlined, PlusOutlined } from '@ant-design/icons-vue'
import assetCard from './AssetCard.vue'
import { deepClone } from '@/utils/util'
import i18n from '@/locales'
import type { AssetNode } from '../utils/types'

const { t } = i18n.global
const logger = createRendererLogger('config.assetList')

interface Props {
  assetGroups: AssetNode[]
  searchValue?: string
  wideLayout?: boolean
  selectionMode?: boolean
  selectedUuids?: string[]
  selectionDisabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  searchValue: '',
  wideLayout: false,
  selectionMode: false,
  selectedUuids: () => [],
  selectionDisabled: false
})

const emit = defineEmits<{
  'asset-click': [asset: AssetNode]
  'asset-double-click': [asset: AssetNode]
  'asset-edit': [asset: AssetNode]
  'asset-delete': [asset: AssetNode]
  'asset-context-menu': [event: MouseEvent, asset: AssetNode]
  'empty-new-asset': []
  'empty-import-assets': []
  'selection-change': [uuids: string[]]
  'batch-delete': []
}>()

const filteredAssetGroups = computed(() => {
  try {
    if (!props.searchValue.trim()) return props.assetGroups || []

    const lowerCaseInput = props.searchValue.toLowerCase()

    const filterNodes = (nodes: AssetNode[]): AssetNode[] => {
      if (!Array.isArray(nodes)) return []

      return nodes
        .map((node) => {
          if (!node || typeof node.title !== 'string') return null

          if (node.title.toLowerCase().includes(lowerCaseInput)) {
            return { ...node }
          }

          if (node.children && Array.isArray(node.children)) {
            const filteredChildren = filterNodes(node.children)
            if (filteredChildren.length > 0) {
              return {
                ...node,
                children: filteredChildren
              }
            }
          }

          return null
        })
        .filter(Boolean) as AssetNode[]
    }

    return filterNodes(deepClone(props.assetGroups || []) as AssetNode[])
  } catch (error) {
    logger.error('Error filtering asset groups', { error: error })
    return []
  }
})

const selectedUuidSet = computed(() => new Set(props.selectedUuids))

// Only direct children are host configurations; bastion child assets are managed separately.
const getGroupUuids = (group: AssetNode): string[] => {
  return [...new Set((group.children || []).flatMap((asset) => (asset.uuid ? [asset.uuid] : [])))]
}

const visibleAssetUuids = computed(() => [...new Set(filteredAssetGroups.value.flatMap(getGroupUuids))])
const allVisibleSelected = computed(() => {
  return visibleAssetUuids.value.length > 0 && visibleAssetUuids.value.every((uuid) => selectedUuidSet.value.has(uuid))
})
const someVisibleSelected = computed(() => visibleAssetUuids.value.some((uuid) => selectedUuidSet.value.has(uuid)))

const isGroupSelected = (group: AssetNode) => {
  const uuids = getGroupUuids(group)
  return uuids.length > 0 && uuids.every((uuid) => selectedUuidSet.value.has(uuid))
}

const isGroupPartiallySelected = (group: AssetNode) => {
  return !isGroupSelected(group) && getGroupUuids(group).some((uuid) => selectedUuidSet.value.has(uuid))
}

const updateSelection = (uuids: string[], selected: boolean) => {
  if (props.selectionDisabled) return
  const nextSelected = new Set(props.selectedUuids)
  for (const uuid of uuids) {
    if (selected) nextSelected.add(uuid)
    else nextSelected.delete(uuid)
  }
  emit('selection-change', [...nextSelected])
}

const toggleVisibleSelection = () => {
  updateSelection(visibleAssetUuids.value, !allVisibleSelected.value)
}

const toggleGroupSelection = (group: AssetNode) => {
  updateSelection(getGroupUuids(group), !isGroupSelected(group))
}

const toggleAssetSelection = (asset: AssetNode) => {
  if (!asset.uuid) return
  updateSelection([asset.uuid], !selectedUuidSet.value.has(asset.uuid))
}

const handleAssetClick = (asset: AssetNode) => {
  emit('asset-click', asset)
}

const handleAssetDoubleClick = (asset: AssetNode) => {
  emit('asset-double-click', asset)
}

const handleAssetEdit = (asset: AssetNode) => {
  emit('asset-edit', asset)
}

const handleAssetDelete = (asset: AssetNode) => {
  emit('asset-delete', asset)
}

const handleAssetContextMenu = (event: MouseEvent, asset: AssetNode) => {
  emit('asset-context-menu', event, asset)
}
</script>

<style lang="less" scoped>
.asset-list-container {
  width: 100%;

  :deep(.ant-checkbox-wrapper) {
    color: var(--text-color);
  }

  :deep(.ant-checkbox-inner) {
    background-color: var(--bg-color-secondary);
    border-color: var(--border-color-light);
  }

  :deep(.ant-checkbox-wrapper:not(.ant-checkbox-wrapper-disabled):hover .ant-checkbox-inner),
  :deep(.ant-checkbox-input:focus-visible + .ant-checkbox-inner) {
    border-color: var(--primary-color, #1677ff);
  }

  :deep(.ant-checkbox-checked:not(.ant-checkbox-disabled) .ant-checkbox-inner) {
    background-color: var(--primary-color, #1677ff) !important;
    border-color: var(--primary-color, #1677ff) !important;
  }

  :deep(.ant-checkbox-indeterminate .ant-checkbox-inner::after) {
    background-color: var(--primary-color, #1677ff);
  }

  :deep(.ant-checkbox-wrapper-disabled),
  :deep(.ant-checkbox-wrapper-disabled .ant-checkbox + span) {
    color: var(--text-color-tertiary);
  }

  :deep(.ant-checkbox-disabled .ant-checkbox-inner) {
    background-color: var(--bg-color-tertiary) !important;
    border-color: var(--border-color) !important;
  }

  :deep(.ant-checkbox-disabled.ant-checkbox-checked .ant-checkbox-inner::after) {
    border-color: var(--text-color-tertiary);
  }

  :deep(.ant-checkbox-disabled.ant-checkbox-indeterminate .ant-checkbox-inner::after) {
    background-color: var(--text-color-tertiary);
  }
}

.selection-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 0;

  :deep(.ant-btn) {
    color: var(--text-color);
    background-color: var(--bg-color-secondary);
    border-color: var(--border-color);
    box-shadow: none;
  }

  :deep(.ant-btn:not(:disabled):hover),
  :deep(.ant-btn:not(:disabled):focus-visible) {
    color: var(--primary-color, #1677ff);
    background-color: var(--hover-bg-color);
    border-color: var(--primary-color, #1677ff);
  }

  :deep(.ant-btn-dangerous:not(:disabled)),
  :deep(.ant-btn-dangerous:not(:disabled):hover),
  :deep(.ant-btn-dangerous:not(:disabled):focus-visible) {
    color: var(--error-color, #ff4d4f);
    border-color: var(--error-color, #ff4d4f);
  }

  :deep(.ant-btn:disabled),
  :deep(.ant-btn:disabled:hover) {
    color: var(--text-color-tertiary);
    background-color: var(--bg-color-tertiary);
    border-color: var(--border-color);
  }
}

.selection-count {
  flex: 1;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.group-title {
  font-size: 14px;
  font-weight: bold;
  color: var(--text-color);
  margin-bottom: 8px;
  margin-top: 16px;
}

.host-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.host-cards.wide-layout {
  :deep(.card-wrapper) {
    width: calc(33.33% - 8px);
  }
}

.host-cards:not(.wide-layout) {
  :deep(.card-wrapper) {
    width: calc(50% - 6px);
  }
}

@media (max-width: 768px) {
  .host-cards {
    :deep(.card-wrapper) {
      width: 100% !important;
    }
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  margin-bottom: 16px;

  .empty-icon-svg {
    font-size: 48px;
    color: var(--text-color-tertiary);
    opacity: 0.6;
  }
}

.empty-title {
  font-size: 14px;
  color: var(--text-color-secondary);
}

.empty-description {
  max-width: 320px;
  margin-top: 8px;
  color: var(--text-color-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.empty-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
</style>
