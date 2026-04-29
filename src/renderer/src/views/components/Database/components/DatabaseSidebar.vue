<template>
  <div class="db-sidebar">
    <div class="db-sidebar__header">
      <span class="db-sidebar__title">{{ $t('database.title') }}</span>
      <div class="db-sidebar__add">
        <button
          class="db-sidebar__add-btn"
          :title="$t('database.newConnection')"
          @click="toggleAddMenu"
        >
          <PlusOutlined />
        </button>
        <div
          v-if="showAddMenu"
          class="db-sidebar__add-menu"
        >
          <button
            class="db-sidebar__add-menu-item"
            @click="handleAddGroup"
          >
            {{ $t('database.newGroup') }}
          </button>
          <button
            class="db-sidebar__add-menu-item db-sidebar__db-type-option--mysql"
            @click="handleAddConnection('MySQL')"
          >
            MySQL
          </button>
          <button
            class="db-sidebar__add-menu-item db-sidebar__db-type-option--postgresql"
            @click="handleAddConnection('PostgreSQL')"
          >
            PostgreSQL
          </button>
        </div>
      </div>
    </div>
    <div class="db-sidebar__search">
      <a-input
        :value="keyword"
        class="transparent-Input"
        :placeholder="$t('database.searchPlaceholder')"
        allow-clear
        @update:value="(v: string) => emit('update:keyword', v)"
      >
        <template #suffix>
          <SearchOutlined />
        </template>
      </a-input>
    </div>
    <div class="db-sidebar__tree">
      <DatabaseTree
        :nodes="nodes"
        :selected-id="selectedId"
        :connection-statuses="connectionStatuses"
        @toggle="(id) => emit('toggle', id)"
        @select="(id) => emit('select', id)"
        @open-table="(id) => emit('openTable', id)"
        @connect="(id) => emit('connect', id)"
        @disconnect="(id) => emit('disconnect', id)"
        @group-context="handleGroupContext"
      />
    </div>
    <div
      v-if="groupMenu"
      class="db-sidebar__group-menu"
      :style="{ left: `${groupMenu.x}px`, top: `${groupMenu.y}px` }"
    >
      <button
        class="db-sidebar__group-menu-item"
        @click="handleContextNewConnection"
      >
        {{ $t('database.newConnection') }}
      </button>
      <button
        class="db-sidebar__group-menu-item"
        @click="handleContextNewGroup"
      >
        {{ $t('database.newGroup') }}
      </button>
      <button
        class="db-sidebar__group-menu-item"
        @click="handleContextRename"
      >
        {{ $t('common.rename') }}
      </button>
      <button
        class="db-sidebar__group-menu-item"
        @click="handleContextCopyName"
      >
        {{ $t('database.copyName') }}
      </button>
      <button
        class="db-sidebar__group-menu-item db-sidebar__group-menu-item--danger"
        @click="handleContextDelete"
      >
        {{ $t('database.deleteGroup') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons-vue'
import DatabaseTree from './DatabaseTree.vue'
import type { DatabaseTreeNode, DatabaseType } from '../types'

defineProps<{
  nodes: DatabaseTreeNode[]
  selectedId: string | null
  keyword: string
  connectionStatuses?: Record<string, 'idle' | 'testing' | 'connected' | 'failed'>
}>()

const emit = defineEmits<{
  (e: 'update:keyword', value: string): void
  (e: 'add-connection', dbType: DatabaseType): void
  (e: 'add-connection-to-group', dbType: DatabaseType, groupId: string): void
  (e: 'add-group'): void
  (e: 'add-group-child', groupId: string): void
  (e: 'rename-group', groupId: string, currentName: string): void
  (e: 'delete-group', groupId: string, currentName: string): void
  (e: 'copy-group-name', value: string): void
  (e: 'toggle', id: string): void
  (e: 'select', id: string): void
  (e: 'openTable', id: string): void
  (e: 'connect', id: string): void
  (e: 'disconnect', id: string): void
}>()

const showAddMenu = ref(false)
const groupMenu = ref<{ id: string; name: string; x: number; y: number } | null>(null)

const toggleAddMenu = () => {
  showAddMenu.value = !showAddMenu.value
  if (showAddMenu.value) groupMenu.value = null
}

const handleAddConnection = (dbType: DatabaseType) => {
  showAddMenu.value = false
  emit('add-connection', dbType)
}

const handleAddGroup = () => {
  showAddMenu.value = false
  emit('add-group')
}

const hideMenus = () => {
  showAddMenu.value = false
  groupMenu.value = null
}

const handleGroupContext = (payload: { id: string; name: string; x: number; y: number }) => {
  showAddMenu.value = false
  groupMenu.value = payload
}

const handleContextNewConnection = () => {
  if (!groupMenu.value) return
  emit('add-connection-to-group', 'MySQL', groupMenu.value.id)
  hideMenus()
}

const handleContextNewGroup = () => {
  if (!groupMenu.value) return
  emit('add-group-child', groupMenu.value.id)
  hideMenus()
}

const handleContextRename = () => {
  if (!groupMenu.value) return
  emit('rename-group', groupMenu.value.id, groupMenu.value.name)
  hideMenus()
}

const handleContextCopyName = () => {
  if (!groupMenu.value) return
  emit('copy-group-name', groupMenu.value.name)
  hideMenus()
}

const handleContextDelete = () => {
  if (!groupMenu.value) return
  emit('delete-group', groupMenu.value.id, groupMenu.value.name)
  hideMenus()
}

onMounted(() => {
  window.addEventListener('click', hideMenus)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', hideMenus)
})
</script>

<style lang="less" scoped>
.db-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  border-right: 1px solid var(--border-color);

  &__header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-color);
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
  }

  &__add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: var(--text-color);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: var(--hover-bg-color);
    }
  }

  &__add {
    position: relative;
  }

  &__add-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 140px;
    padding: 6px;
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
  }

  &__add-menu-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 8px 10px;
    color: var(--text-color);
    background: transparent;
    border: none;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--hover-bg-color);
    }
  }

  &__search {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-color);
  }

  &__tree {
    flex: 1;
    overflow: auto;
  }

  &__group-menu {
    position: fixed;
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 6px;
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 20%);
  }

  &__group-menu-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 8px 10px;
    color: var(--text-color);
    background: transparent;
    border: none;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--hover-bg-color);
    }

    &--danger {
      color: #ef4444;
    }
  }
}
</style>
