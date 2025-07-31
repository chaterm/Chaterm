<template>
  <div class="asset-list-container">
    <!-- 遍历每个组 -->
    <template
      v-for="group in filteredAssetGroups"
      :key="group.key"
    >
      <!-- 组标题 -->
      <div class="group-title">{{ group.title }}</div>

      <!-- 组内主机卡片列表 -->
      <div
        class="host-cards"
        :class="{ 'wide-layout': wideLayout }"
      >
        <!-- 主机列表卡片 -->
        <AssetCard
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

    <!-- 空状态 -->
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
import AssetCard from './AssetCard.vue'
import { deepClone } from '@/utils/util'
import i18n from '@/locales'
import type { AssetNode } from '../types'

const { t } = i18n.global

// Props
interface Props {
  assetGroups: AssetNode[]
  searchValue?: string
  wideLayout?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  searchValue: '',
  wideLayout: false
})

// Emits
const emit = defineEmits<{
  'asset-click': [asset: AssetNode]
  'asset-double-click': [asset: AssetNode]
  'asset-edit': [asset: AssetNode]
  'asset-context-menu': [event: MouseEvent, asset: AssetNode]
}>()

// Computed
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
    console.error('过滤资产组时出错:', error)
    return []
  }
})

// Methods
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

/* 当右侧面板关闭时，显示更多卡片 */
.host-cards.wide-layout {
  :deep(.card-wrapper) {
    width: calc(33.33% - 8px); /* 一行显示3个 */
  }
}

/* 当右侧面板打开时，显示较少卡片 */
.host-cards:not(.wide-layout) {
  :deep(.card-wrapper) {
    width: calc(50% - 6px); /* 一行显示2个 */
  }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .host-cards {
    :deep(.card-wrapper) {
      width: 100% !important; /* 小屏幕一行显示1个 */
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
