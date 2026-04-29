<template>
  <li
    class="db-tree-node"
    role="treeitem"
    :aria-expanded="canExpand ? !!node.expanded : undefined"
  >
    <div
      class="db-tree-node__row"
      :class="{ 'db-tree-node__row--selected': selectedId === node.id }"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
      @click="handleRowClick"
      @dblclick="handleRowDoubleClick"
    >
      <span
        v-if="canExpand"
        class="db-tree-node__toggle"
        @click.stop="emit('toggle', node.id)"
      >
        <DownOutlined v-if="node.expanded" />
        <RightOutlined v-else />
      </span>
      <span
        v-else
        class="db-tree-node__toggle db-tree-node__toggle--placeholder"
      />
      <span class="db-tree-node__icon">
        <component :is="iconComponent" />
      </span>
      <span class="db-tree-node__label">{{ node.name }}</span>
      <span
        v-if="statusClass"
        class="db-tree-node__status-dot"
        :class="statusClass"
        :title="statusLabel"
      />
      <span
        v-if="node.type === 'connection' && assetId"
        class="db-tree-node__actions"
      >
        <button
          v-if="connectionStatus === 'connected'"
          class="db-tree-node__action-btn"
          :title="'Disconnect'"
          @click.stop="emit('disconnect', node.id)"
        >
          <DisconnectOutlined />
        </button>
        <button
          v-else
          class="db-tree-node__action-btn"
          :title="'Connect'"
          @click.stop="emit('connect', node.id)"
        >
          <ThunderboltOutlined />
        </button>
      </span>
    </div>
    <ul
      v-if="hasChildren && node.expanded"
      class="db-tree-node__children"
    >
      <DatabaseTreeNodeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected-id="selectedId"
        :connection-statuses="connectionStatuses"
        @toggle="(id) => emit('toggle', id)"
        @select="(id) => emit('select', id)"
        @open-table="(id) => emit('openTable', id)"
        @connect="(id) => emit('connect', id)"
        @disconnect="(id) => emit('disconnect', id)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  DatabaseOutlined,
  DisconnectOutlined,
  DownOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  LinkOutlined,
  RightOutlined,
  TableOutlined,
  TeamOutlined,
  ThunderboltOutlined
} from '@ant-design/icons-vue'
import type { DatabaseTreeNode } from '../types'

const props = withDefaults(
  defineProps<{
    node: DatabaseTreeNode
    depth?: number
    selectedId: string | null
    connectionStatuses?: Record<string, 'idle' | 'testing' | 'connected' | 'failed'>
  }>(),
  { depth: 0 }
)

const emit = defineEmits<{
  (e: 'toggle', id: string): void
  (e: 'select', id: string): void
  (e: 'openTable', id: string): void
  (e: 'connect', id: string): void
  (e: 'disconnect', id: string): void
}>()

const hasChildren = computed(() => !!props.node.children && props.node.children.length > 0)

/**
 * A node is "expandable" if it already has children OR if it is a kind of
 * node whose children get loaded lazily (database nodes fetch their tables
 * on first expand). Without this the toggle arrow is never rendered for
 * freshly-loaded database nodes and the user has no way to drill in.
 */
const canExpand = computed(() => {
  if (hasChildren.value) return true
  return props.node.type === 'database' || props.node.type === 'connection'
})

const assetId = computed(() => {
  const meta = props.node.meta as { assetId?: string } | undefined
  return meta?.assetId ?? null
})

const connectionStatus = computed(() => {
  if (!assetId.value || !props.connectionStatuses) return null
  return props.connectionStatuses[assetId.value] ?? null
})

const statusClass = computed(() => {
  if (props.node.type !== 'connection') return null
  const status = connectionStatus.value
  if (!status) return null
  return `db-tree-node__status-dot--${status}`
})

const statusLabel = computed(() => connectionStatus.value ?? '')

const iconComponent = computed(() => {
  switch (props.node.type) {
    case 'group':
      return TeamOutlined
    case 'connection':
      return LinkOutlined
    case 'database':
      return DatabaseOutlined
    case 'folder':
      return props.node.expanded ? FolderOpenOutlined : FolderOutlined
    case 'table':
      return TableOutlined
    default:
      return FolderOutlined
  }
})

const handleRowClick = () => {
  emit('select', props.node.id)
  if (canExpand.value) emit('toggle', props.node.id)
}

const handleRowDoubleClick = () => {
  if (props.node.type === 'table') emit('openTable', props.node.id)
}
</script>

<style lang="less" scoped>
.db-tree-node {
  list-style: none;
  margin: 0;
  padding: 0;

  &__row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 8px;
    height: 24px;
    cursor: pointer;
    color: var(--text-color);
    font-size: 12px;

    &:hover {
      background: var(--hover-bg-color);
      .db-tree-node__actions {
        opacity: 1;
      }
    }

    &--selected {
      background: var(--active-bg-color);
    }
  }

  &__toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    color: var(--text-color-secondary, #8a94a6);
    font-size: 10px;

    &--placeholder {
      visibility: hidden;
    }
  }

  &__icon {
    display: inline-flex;
    align-items: center;
    color: var(--text-color-secondary, #8a94a6);
    font-size: 13px;
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__status-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #8a94a6;
    flex-shrink: 0;

    &--connected {
      background: #22c55e;
    }

    &--testing {
      background: #eab308;
    }

    &--failed {
      background: #ef4444;
    }
  }

  &__actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  &__action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    font-size: 12px;
    color: var(--text-color-secondary, #8a94a6);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: var(--active-bg-color);
      color: var(--text-color);
    }
  }

  &__children {
    list-style: none;
    margin: 0;
    padding: 0;
  }
}
</style>
