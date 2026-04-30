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
      @contextmenu.prevent="handleContextMenu"
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
      <span
        class="db-tree-node__icon"
        :class="iconClass"
      >
        <img
          v-if="dbTypeIconUrl"
          class="db-tree-node__icon-img"
          :src="dbTypeIconUrl"
          :alt="node.name"
          width="14"
          height="14"
        />
        <component
          :is="iconComponent"
          v-else
        />
      </span>
      <input
        v-if="isEditing"
        ref="editInputRef"
        v-model="editValue"
        class="db-tree-node__edit-input"
        type="text"
        @click.stop
        @dblclick.stop
        @keydown.enter.prevent="commitEdit"
        @keydown.esc.prevent="cancelEdit"
        @blur="commitEdit"
      />
      <span
        v-else
        class="db-tree-node__label"
        >{{ node.name }}</span
      >
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
        :editing-group-id="editingGroupId"
        @toggle="(id) => emit('toggle', id)"
        @select="(id) => emit('select', id)"
        @open-table="(id) => emit('openTable', id)"
        @connect="(id) => emit('connect', id)"
        @disconnect="(id) => emit('disconnect', id)"
        @group-context="(payload) => emit('group-context', payload)"
        @commit-group-rename="(id, cur, next) => emit('commit-group-rename', id, cur, next)"
        @cancel-group-rename="() => emit('cancel-group-rename')"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  DatabaseOutlined,
  DisconnectOutlined,
  DownOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  LinkOutlined,
  ProfileOutlined,
  RightOutlined,
  TableOutlined,
  ThunderboltOutlined
} from '@ant-design/icons-vue'
import type { DatabaseTreeNode, DatabaseType } from '../types'
import { getDatabaseTypeOption } from '../constants/databaseTypes'

const props = withDefaults(
  defineProps<{
    node: DatabaseTreeNode
    depth?: number
    selectedId: string | null
    connectionStatuses?: Record<string, 'idle' | 'testing' | 'connected' | 'failed'>
    editingGroupId?: string | null
  }>(),
  { depth: 0, editingGroupId: null }
)

const emit = defineEmits<{
  (e: 'toggle', id: string): void
  (e: 'select', id: string): void
  (e: 'openTable', id: string): void
  (e: 'connect', id: string): void
  (e: 'disconnect', id: string): void
  (e: 'group-context', payload: { id: string; name: string; x: number; y: number }): void
  (e: 'commit-group-rename', groupId: string, currentName: string, nextName: string): void
  (e: 'cancel-group-rename'): void
}>()

const isEditing = computed(() => props.node.type === 'group' && props.editingGroupId === props.node.id)
const editValue = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)
const suppressBlur = ref(false)

// When this node enters edit mode, seed the input and focus+select it.
watch(
  isEditing,
  async (editing) => {
    if (!editing) return
    editValue.value = props.node.name
    suppressBlur.value = false
    await nextTick()
    editInputRef.value?.focus()
    editInputRef.value?.select()
  },
  { immediate: true }
)

const commitEdit = (): void => {
  if (!isEditing.value || suppressBlur.value) return
  // Prevent the blur-handler from firing twice (Enter triggers blur after).
  suppressBlur.value = true
  emit('commit-group-rename', props.node.id, props.node.name, editValue.value)
}

const cancelEdit = (): void => {
  suppressBlur.value = true
  emit('cancel-group-rename')
}

const hasChildren = computed(() => !!props.node.children && props.node.children.length > 0)

/**
 * A node is "expandable" if it already has children OR if it is a kind of
 * node whose children get loaded lazily. Database/connection nodes fetch
 * their schema on first expand; table nodes fetch their columns.
 */
const canExpand = computed(() => {
  if (hasChildren.value) return true
  return props.node.type === 'database' || props.node.type === 'connection' || props.node.type === 'table'
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
      return props.node.expanded ? FolderOpenOutlined : FolderOutlined
    case 'connection':
      return LinkOutlined
    case 'database':
      return DatabaseOutlined
    case 'folder':
      return props.node.expanded ? FolderOpenOutlined : FolderOutlined
    case 'table':
      return TableOutlined
    case 'column':
      return ProfileOutlined
    default:
      return FolderOutlined
  }
})

// Colored-by-type icon styling for non-connection nodes (connection uses
// the branded SVG instead; see dbTypeIconUrl).
const iconClass = computed(() => {
  const classes: string[] = [`db-tree-node__icon--${props.node.type}`]
  if (props.node.type === 'connection') {
    const dbType = (props.node.meta as { dbType?: string } | undefined)?.dbType
    if (dbType) classes.push(`db-tree-node__icon--db-${String(dbType).toLowerCase()}`)
  }
  return classes
})

// When the node is a connection carrying a dbType, render its branded color
// logo instead of the generic LinkOutlined — makes MySQL / PostgreSQL (and
// future DBMS) instantly recognizable at a glance.
const dbTypeIconUrl = computed<string | null>(() => {
  if (props.node.type !== 'connection') return null
  const raw = (props.node.meta as { dbType?: string } | undefined)?.dbType
  if (!raw) return null
  const normalized = normalizeDbType(raw)
  if (!normalized) return null
  return getDatabaseTypeOption(normalized)?.iconUrl ?? null
})

// Incoming dbType from the store is lowercase ('mysql' | 'postgresql'), but
// DATABASE_TYPE_OPTIONS keys are TitleCase ('MySQL' | 'PostgreSQL'). Map
// known values; return null for anything we don't recognize so we fall back
// to the generic antd icon.
function normalizeDbType(raw: string): DatabaseType | null {
  switch (raw.toLowerCase()) {
    case 'mysql':
      return 'MySQL'
    case 'postgresql':
    case 'postgres':
      return 'PostgreSQL'
    default:
      return null
  }
}

const handleRowClick = () => {
  if (isEditing.value) return
  emit('select', props.node.id)
  // Tables only toggle via the explicit triangle — single-clicking the row
  // would otherwise race with the double-click-to-open-data behavior.
  if (props.node.type === 'table') return
  if (canExpand.value) emit('toggle', props.node.id)
}

const handleRowDoubleClick = () => {
  if (isEditing.value) return
  if (props.node.type === 'table') emit('openTable', props.node.id)
}

const handleContextMenu = (event: MouseEvent) => {
  if (isEditing.value) return
  if (props.node.type !== 'group') return
  emit('group-context', {
    id: props.node.id,
    name: props.node.name,
    x: event.clientX,
    y: event.clientY
  })
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
    // Left/right margin pulls hover + selected highlight away from the column
    // edges so the pill doesn't run full-bleed across the sidebar. Combined
    // with border-radius this matches a modern tree-node aesthetic.
    margin: 0 6px;
    border-radius: 4px;
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

    // Per-node-type colorization so tree levels are visually distinguishable.
    // Connection additionally gets a per-DBMS accent via the db-<dbType> class.
    &--group {
      color: #f59e0b; // amber (same as folder)
    }
    &--database {
      color: #f59e0b; // amber
    }
    &--folder {
      color: #f59e0b; // amber
    }
    &--table {
      color: #22c55e; // green
    }
    &--column {
      color: #3b82f6; // blue
    }
    &--connection {
      color: #6366f1; // default indigo for unknown dbType
    }
    &--db-mysql {
      color: #00758f;
    }
    &--db-postgresql {
      color: #336791;
    }
    &--db-mariadb {
      color: #c0765c;
    }
    &--db-sqlite {
      color: #00a1e0;
    }
    &--db-sqlserver {
      color: #a91d22;
    }
    &--db-oracle {
      color: #f80000;
    }
    &--db-clickhouse {
      color: #fdd835;
    }
    &--db-mongodb {
      color: #4db33d;
    }
  }

  &__icon-img {
    display: block;
    width: 14px;
    height: 14px;
    object-fit: contain;
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__edit-input {
    flex: 1;
    min-width: 0;
    height: 20px;
    padding: 0 6px;
    color: var(--text-color);
    background: var(--bg-color);
    border: 1px solid var(--primary-color, #3b82f6);
    border-radius: 3px;
    font: inherit;
    outline: none;

    &:focus {
      border-color: var(--primary-color, #3b82f6);
    }
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
