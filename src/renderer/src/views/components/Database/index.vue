<template>
  <div class="db-workspace">
    <splitpanes class="db-workspace__splitpanes">
      <pane
        class="db-workspace__sidebar"
        :size="sidebarSize"
        :min-size="16"
        :max-size="40"
      >
        <DatabaseSidebar
          :nodes="store.filteredTree"
          :selected-id="store.selectedNodeId"
          :keyword="store.searchKeyword"
          :connection-statuses="store.connectionStatuses"
          @update:keyword="store.setSearchKeyword"
          @add-connection="store.openConnectionModal"
          @toggle="handleToggle"
          @select="handleSelect"
          @open-table="handleOpenTable"
          @connect="handleConnect"
          @disconnect="handleDisconnect"
        />
      </pane>
      <pane
        class="db-workspace__main"
        :size="100 - sidebarSize"
      >
        <DatabaseWorkspaceTabs
          :tabs="store.tabs"
          :active-tab-id="store.activeTabId"
          @select="store.setActiveTab"
          @close="store.closeTab"
        />
        <div class="db-workspace__panel">
          <DatabaseOverview v-if="activeTab && activeTab.kind === 'overview'" />
          <div
            v-else-if="activeTab && activeTab.kind === 'data'"
            class="db-workspace__data"
          >
            <DataGridToolbar
              :page="activeTab.page ?? 1"
              :page-size="activeTab.pageSize ?? 100"
              :total="activeTab.total ?? null"
              :can-edit="canEditActiveTab"
              :has-selection="hasSelectionOnActiveTab"
              :can-undo="canUndoActiveTab"
              :is-dirty="isActiveTabDirty"
              @goto-page="(p) => handleGotoPage(p)"
              @goto-last-page="handleGotoLastPage"
              @change-page-size="(s) => handleChangePageSize(s)"
              @refresh-total="() => handleRefreshTotal()"
              @refresh="() => handleRefresh()"
              @add-row="handleAddRow"
              @delete-row="handleDeleteRow"
              @undo="handleUndo"
              @save="handleSaveEdits"
            />
            <WhereOrderBar
              :where-raw="activeTab.whereRaw"
              :order-by-raw="activeTab.orderByRaw"
              @apply-where="(v) => store.setTableWhereRaw(activeTab!.id, v)"
              @apply-order-by="(v) => store.setTableOrderByRaw(activeTab!.id, v)"
            />
            <div class="db-workspace__grid">
              <div
                v-if="activeTab.loading"
                class="db-workspace__status"
              >
                {{ $t('database.loading') }}
              </div>
              <DatabaseResultPane
                v-else
                :columns="activeTab.resultColumns"
                :rows="activeTab.resultRows"
                :filters="activeTab.filters ?? []"
                :sort="activeTab.sort ?? null"
                :start-row-index="((activeTab.page ?? 1) - 1) * (activeTab.pageSize ?? 100) + 1"
                :load-distinct="(col: string) => store.loadColumnDistinct(activeTab!.id, col)"
                :editable="canEditActiveTab"
                :new-rows="activeTab.dirtyState?.newRows ?? []"
                :deleted-row-keys="activeTab.dirtyState?.deletedRowKeys ?? new Set()"
                :updated-cells="activeTab.dirtyState?.updatedCells ?? new Map()"
                :primary-key="activeTab.primaryKey ?? null"
                :selected-row-key="activeTab.selectedRowKey ?? null"
                @sort="(col, dir) => store.setTableSort(activeTab!.id, col, dir)"
                @apply-filter="(col, f) => store.setTableFilter(activeTab!.id, f, col)"
                @cell-edit="(rowKey, col, newVal) => handleCellEdit(rowKey, col, newVal)"
                @new-row-cell-edit="(tmpId, col, newVal) => handleNewRowCellEdit(tmpId, col, newVal)"
                @select-row="(rowKey) => handleSelectRow(rowKey)"
              />
            </div>
            <DataStatusBar
              :error="activeTab.error"
              :duration-ms="activeTab.durationMs"
              :row-count="activeTab.rowCount"
            />
          </div>
          <splitpanes
            v-else-if="activeTab"
            horizontal
            class="db-workspace__sql-splitpanes"
          >
            <pane
              :size="45"
              :min-size="20"
            >
              <DatabaseEditorPane
                :model-value="activeTab.sql"
                @update:model-value="(v: string) => updateSql(v)"
                @run="handleRun"
              />
            </pane>
            <pane
              :size="55"
              :min-size="20"
            >
              <DatabaseResultPane
                :columns="activeTab.resultColumns"
                :rows="activeTab.resultRows"
              />
            </pane>
          </splitpanes>
        </div>
      </pane>
    </splitpanes>

    <DatabaseConnectionModal
      :visible="store.connectionModalVisible"
      :draft="store.connectionDraft"
      :last-test-result="store.lastTestResult"
      @update="store.updateConnectionDraft"
      @cancel="store.closeConnectionModal"
      @test="handleTest"
      @save="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Pane, Splitpanes } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import DatabaseSidebar from './components/DatabaseSidebar.vue'
import DatabaseWorkspaceTabs from './components/DatabaseWorkspaceTabs.vue'
import DatabaseOverview from './components/DatabaseOverview.vue'
import DatabaseEditorPane from './components/DatabaseEditorPane.vue'
import DatabaseResultPane from './components/DatabaseResultPane.vue'
import DatabaseConnectionModal from './components/DatabaseConnectionModal.vue'
import DataGridToolbar from './components/DataGridToolbar.vue'
import DataStatusBar from './components/DataStatusBar.vue'
import WhereOrderBar from './components/WhereOrderBar.vue'
import { useDatabaseWorkspaceStore } from '@/store/databaseWorkspaceStore'
import type { DatabaseConnectionDraft, DatabaseTreeNode } from './types'

const store = useDatabaseWorkspaceStore()

const sidebarSize = 22

const activeTab = computed(() => store.activeTab)

// --- Edit capability / state derivations for the data tab ---------------

const canEditActiveTab = computed(() => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data') return false
  // A data tab can be edited only when a primary key is known.
  return Array.isArray(tab.primaryKey) && tab.primaryKey.length > 0
})

const hasSelectionOnActiveTab = computed(() => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data') return false
  return !!tab.selectedRowKey
})

const canUndoActiveTab = computed(() => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data') return false
  return (tab.undoStack?.length ?? 0) > 0
})

const isActiveTabDirty = computed(() => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data') return false
  const d = tab.dirtyState
  if (!d) return false
  const hasNew = (d.newRows?.length ?? 0) > 0
  const hasDeleted = (d.deletedRowKeys?.size ?? 0) > 0
  const hasUpdated = (d.updatedCells?.size ?? 0) > 0
  return hasNew || hasDeleted || hasUpdated
})

onMounted(() => {
  store.loadAssetsFromBackend()
})

const findNode = (nodes: DatabaseTreeNode[], id: string): DatabaseTreeNode | null => {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

const assetIdOf = (node: DatabaseTreeNode): string | null => {
  const meta = node.meta as { assetId?: string } | undefined
  return meta?.assetId ?? null
}

const handleToggle = async (id: string) => {
  const node = findNode(store.tree, id)
  if (!node) return

  // Lazy-load tables on first expand of a database node.
  if (node.type === 'database' && !node.expanded) {
    const alreadyLoaded = (node.children ?? []).some((c) => c.type === 'folder')
    if (!alreadyLoaded) {
      const connection = findNode(store.tree, node.parentId ?? '')
      const assetId = connection ? assetIdOf(connection) : null
      if (assetId) await store.loadDatabaseTables(assetId, node.name)
    }
  }

  node.expanded = !node.expanded
}

const handleSelect = (id: string) => {
  store.setSelectedNode(id)
}

const handleOpenTable = (id: string) => {
  store.openTableDataTab(id)
}

const handleConnect = async (id: string) => {
  const node = findNode(store.tree, id)
  if (!node || node.type !== 'connection') return
  const assetId = assetIdOf(node)
  if (!assetId) return
  await store.connectAsset(assetId)
  node.expanded = true
}

const handleDisconnect = async (id: string) => {
  const node = findNode(store.tree, id)
  if (!node || node.type !== 'connection') return
  const assetId = assetIdOf(node)
  if (!assetId) return
  await store.disconnectAsset(assetId)
}

const updateSql = (value: string) => {
  if (!activeTab.value) return
  activeTab.value.sql = value
}

const handleRun = () => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'sql') return
  store.runQueryForTab(tab.id)
}

const handleTest = async () => {
  if (!store.connectionDraft) return
  await store.testConnectionFromDraft(store.connectionDraft)
}

const handleSave = async (draft: DatabaseConnectionDraft) => {
  await store.saveConnection(draft)
}

const handleGotoLastPage = () => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data' || !tab.total || !tab.pageSize) return
  const last = Math.max(1, Math.ceil(tab.total / tab.pageSize))
  store.setTablePage(tab.id, last)
}

const handleGotoPage = (page: number) => {
  const tab = activeTab.value
  // eslint-disable-next-line no-console
  console.log('[DB-DEBUG] index handleGotoPage', {
    page,
    tabId: tab?.id,
    tabKind: tab?.kind,
    currentPage: tab?.page,
    assetId: tab?.assetId,
    database: tab?.databaseName,
    table: tab?.tableName
  })
  if (!tab || tab.kind !== 'data') return
  try {
    store.setTablePage(tab.id, page)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB-DEBUG] index setTablePage threw', err)
  }
}

const handleChangePageSize = (size: number) => {
  const tab = activeTab.value
  // eslint-disable-next-line no-console
  console.log('[DB-DEBUG] index handleChangePageSize', { size, tabId: tab?.id })
  if (!tab || tab.kind !== 'data') return
  try {
    store.setTablePageSize(tab.id, size)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB-DEBUG] index setTablePageSize threw', err)
  }
}

const handleRefreshTotal = () => {
  const tab = activeTab.value
  // eslint-disable-next-line no-console
  console.log('[DB-DEBUG] index handleRefreshTotal', { tabId: tab?.id })
  if (!tab || tab.kind !== 'data') return
  try {
    store.refreshTableTotal(tab.id)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB-DEBUG] index refreshTableTotal threw', err)
  }
}

const handleRefresh = () => {
  const tab = activeTab.value
  // eslint-disable-next-line no-console
  console.log('[DB-DEBUG] index handleRefresh', { tabId: tab?.id })
  if (!tab || tab.kind !== 'data') return
  try {
    store.reloadTableData(tab.id)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB-DEBUG] index reloadTableData threw', err)
  }
}

// --- Edit toolbar handlers ----------------------------------------------

const handleAddRow = () => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data') return
  store.addNewRow(tab.id)
}

const handleDeleteRow = () => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data' || !tab.selectedRowKey) return
  store.deleteRow(tab.id, tab.selectedRowKey)
}

const handleUndo = () => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data') return
  store.undo(tab.id)
}

const handleSaveEdits = () => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data') return
  store.commitDirty(tab.id)
}

const handleCellEdit = (rowKey: string, col: string, newVal: unknown) => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data') return
  store.updateCell(tab.id, rowKey, col, newVal)
}

const handleNewRowCellEdit = (tmpId: string, col: string, newVal: unknown) => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data') return
  store.updateNewRowCell(tab.id, tmpId, col, newVal)
}

const handleSelectRow = (rowKey: string) => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'data') return
  store.selectRow(tab.id, rowKey)
}
</script>

<style lang="less" scoped>
.db-workspace {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);

  &__splitpanes {
    flex: 1;
  }

  &__sidebar {
    min-width: 220px;
  }

  &__main {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-color);
  }

  &__panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__data {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__grid {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__status {
    padding: 12px 16px;
    font-size: 12px;
    color: var(--text-color-secondary, #8a94a6);

    &--error {
      color: #ef4444;
    }
  }

  &__sql-splitpanes {
    flex: 1;
  }
}
</style>
