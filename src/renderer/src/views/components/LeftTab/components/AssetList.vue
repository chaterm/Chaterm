<template>
  <div class="asset-list-container">
    <template
      v-for="group in filteredAssetGroups"
      :key="group.key"
    >
      <div class="group-title">{{ group.title }}</div>
      <div
        class="host-cards"
        :class="{ 'wide-layout': wideLayout }"
      >
        <assetCard
          v-for="host in group.children"
          :key="host.key"
          :asset="host"
          @click="handleAssetClick"
          @double-click="handleAssetDoubleClick"
          @edit="handleAssetEdit"
          @context-menu="handleAssetContextMenu"
        />
      </div>
    </template>

    <div
      v-if="filteredAssetGroups.length === 0"
      class="empty-state"
    >
      <div class="empty-icon">
        <DatabaseOutlined style="font-size: 48px; color: var(--text-color-tertiary)" />
      </div>
      <div class="empty-text">
        {{ searchValue ? t('common.noSearchResults') : t('personal.noAssets') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DatabaseOutlined } from '@ant-design/icons-vue'
import assetCard from './AssetCard.vue'
import { deepClone } from '@/utils/util'
import i18n from '@/locales'
import type { AssetNode } from '../utils/types'

const { t } = i18n.global

interface Props {
  assetGroups: AssetNode[]
  searchValue?: string
  wideLayout?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  searchValue: '',
  wideLayout: false
})

const emit = defineEmits<{
  'asset-click': [asset: AssetNode]
  'asset-double-click': [asset: AssetNode]
  'asset-edit': [asset: AssetNode]
  'asset-context-menu': [event: MouseEvent, asset: AssetNode]
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
    console.error('Error filtering asset groups:', error)
    return []
  }
})

const handleAssetClick = (asset: AssetNode) => {
  emit('asset-click', asset)
}

const handleAssetDoubleClick = (asset: AssetNode) => {
  emit('asset-double-click', asset)
}

const handleAssetEdit = (asset: AssetNode) => {
  emit('asset-edit', asset)
}

const handleAssetContextMenu = (event: MouseEvent, asset: AssetNode) => {
  emit('asset-context-menu', event, asset)
}
</script>

<style lang="less" scoped>
.asset-list-container {
  width: 100%;
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
}

.empty-text {
  font-size: 14px;
  color: var(--text-color-secondary);
}
</style>
