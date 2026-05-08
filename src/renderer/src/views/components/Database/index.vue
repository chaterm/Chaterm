<template>
  <div class="db-workspace">
    <!-- Outer splitpanes: sidebar (fixed 22%) | content area -->
    <splitpanes
      class="db-workspace__splitpanes"
      @resize="handleOuterSplitResize"
    >
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
          :editing-group-id="editingGroupId"
          @update:keyword="store.setSearchKeyword"
          @add-connection="handleOpenConnectionModal"
          @add-connection-to-group="handleOpenConnectionModalForGroup"
          @add-group="handleCreateGroup"
          @add-group-child="handleCreateChildGroup"
          @move-group="handleMoveGroup"
          @rename-group="handleRenameGroup"
          @commit-group-rename="handleCommitGroupRename"
          @cancel-group-rename="handleCancelGroupRename"
          @delete-group="handleDeleteGroup"
          @copy-group-name="handleCopyGroupName"
          @toggle="handleToggle"
          @select="handleSelect"
          @open-table="handleOpenTable"
          @connect="handleConnect"
          @disconnect="handleDisconnect"
          @refresh-connected="handleRefreshConnected"
          @edit-connection="handleEditConnection"
          @table-action="handleTableAction"
        />
      </pane>
      <!-- Inner splitpanes: main content | AI pane (conditional) -->
      <pane
        class="db-workspace__content-outer"
        :size="contentAreaSize"
      >
        <splitpanes
          class="db-workspace__content-split"
          @resize="handleInnerSplitResize"
        >
          <pane
            class="db-workspace__main"
            :size="innerMainSize"
          >
            <DatabaseWorkspaceTabs
              :tabs="store.tabs"
              :active-tab-id="store.activeTabId"
              :ai-pane-open="store.dbAi.aiPaneOpen"
              :can-toggle-ai-pane="canToggleAiPane"
              @select="store.setActiveTab"
              @close="store.closeTab"
              @add="store.openNewSqlTab"
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
              <SqlWorkspace
                v-else-if="activeTab && activeTab.kind === 'sql'"
                ref="sqlWorkspaceRef"
                :tab="activeTab"
                :tree="store.tree"
                :connection-statuses="store.connectionStatuses"
                @update-sql="(v) => updateSql(v)"
                @update-context="(a, d) => store.setSqlTabContext(activeTab!.id, a, d)"
                @update-schema="(s) => store.setSqlTabSchema(activeTab!.id, s)"
                @run="(mode, sql) => store.runSqlOnActiveTab(mode, sql)"
                @select-result-tab="(id) => store.setActiveResultTab(activeTab!.id, id)"
                @close-result-tab="(id) => store.closeResultTab(activeTab!.id, id)"
                @db-ai="(kind, sql) => handleDbAiEditorAction(kind, sql)"
              />
            </div>
          </pane>
          <pane
            v-if="store.dbAi.aiPaneOpen"
            class="db-workspace__ai"
            :size="aiPaneSize"
            :min-size="18"
            :max-size="60"
          >
            <div class="db-workspace__ai-pane">
              <AiTab
                ref="dbAiTabRef"
                :toggle-sidebar="handleCloseAiPane"
                :saved-state="savedDbAiTabState || undefined"
                :is-agent-mode="true"
                :workspace="'database'"
                :db-context="resolveDbContextForAiTab"
                :db-picker-context="dbAiContext"
                :db-tree="store.tree"
                :db-connection-statuses="store.connectionStatuses"
                @state-changed="handleDbAiTabStateChanged"
                @db-asset-change="onDbAiAssetChange"
                @db-database-change="onDbAiDatabaseChange"
                @db-schema-change="onDbAiSchemaChange"
              />
            </div>
          </pane>
        </splitpanes>
      </pane>
    </splitpanes>

    <DatabaseConnectionModal
      :visible="store.connectionModalVisible"
      :draft="store.connectionDraft"
      :groups="store.groups"
      :last-test-result="store.lastTestResult"
      :mode="store.connectionModalMode"
      @update="store.updateConnectionDraft"
      @cancel="store.closeConnectionModal"
      @test="handleTest"
      @save="handleSave"
    />

    <DdlViewerModal
      :open="ddlViewer.open"
      :table-name="ddlViewer.tableName"
      :ddl="ddlViewer.ddl"
      @update:open="(v) => (ddlViewer.open = v)"
    />

    <DbAiResultDrawer :editor-commands="dbAiEditorCommands" />

    <a-modal
      :open="nl2SqlModal.open"
      :title="t('database.dbAi.nl2SqlPrompt.title')"
      :ok-text="t('database.dbAi.nl2SqlPrompt.submit')"
      :cancel-text="t('database.dbAi.nl2SqlPrompt.cancel')"
      :confirm-loading="nl2SqlModal.confirmLoading"
      :mask-closable="false"
      width="560px"
      @ok="submitNl2SqlModal"
      @cancel="cancelNl2SqlModal"
    >
      <div class="db-ai-nl2sql-modal">
        <p class="db-ai-nl2sql-modal__hint">{{ t('database.dbAi.nl2SqlPrompt.hint') }}</p>
        <a-textarea
          v-model:value="nl2SqlModal.question"
          :placeholder="t('database.dbAi.nl2SqlPrompt.placeholder')"
          :auto-size="{ minRows: 4, maxRows: 10 }"
          :disabled="nl2SqlModal.confirmLoading"
        />
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Pane, Splitpanes } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import { Modal, message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import DatabaseSidebar from './components/DatabaseSidebar.vue'
import DatabaseWorkspaceTabs from './components/DatabaseWorkspaceTabs.vue'
import DatabaseOverview from './components/DatabaseOverview.vue'
import DatabaseResultPane from './components/DatabaseResultPane.vue'
import DatabaseConnectionModal from './components/DatabaseConnectionModal.vue'
import DdlViewerModal from './components/DdlViewerModal.vue'
import DataGridToolbar from './components/DataGridToolbar.vue'
import DataStatusBar from './components/DataStatusBar.vue'
import WhereOrderBar from './components/WhereOrderBar.vue'
import SqlWorkspace from './components/SqlWorkspace.vue'
import DbAiResultDrawer from './components/DbAiResultDrawer.vue'
import AiTab from '@views/components/AiTab/index.vue'
import type { AiTabDbContext } from '@views/components/AiTab/composables/useChatMessages'
import { aiTabStorageKey } from '@views/components/AiTab/workspace'
import { useDatabaseWorkspaceStore } from '@/store/databaseWorkspaceStore'
import { buildQualifiedTable, findConnectionByAssetId } from '@/store/databaseWorkspaceStore'
import { createRendererLogger } from '@/utils/logger'
import type { DatabaseConnectionDraft, DatabaseTreeNode } from './types'

const store = useDatabaseWorkspaceStore()
const { t } = useI18n()
const logger = createRendererLogger('database.dbAi.entry')

const DB_AI_TAB_STORAGE_KEY = aiTabStorageKey('database')

const ddlViewer = ref<{ open: boolean; tableName: string; ddl: string }>({ open: false, tableName: '', ddl: '' })

// Id of the group currently in inline-rename mode (null when none).
const editingGroupId = ref<string | null>(null)

// SQL workspace ref — exposes insertAtCursor/replaceSelection/replaceAll so
// the DB-AI drawer can inject generated SQL without a separate store bus.
const sqlWorkspaceRef = ref<{
  insertSqlAtCursor: (sql: string) => void
  replaceEditorSelection: (sql: string) => void
  replaceEditorAll: (sql: string) => void
} | null>(null)

const sidebarSize = 22

const activeTab = computed(() => store.activeTab)

// --- Stage 2 of #18: AI pane (third splitpanes pane hosting AiTab) ------

const dbAiContext = ref<{
  assetId?: string
  databaseName?: string
  schemaName?: string
  dbType?: 'mysql' | 'postgresql'
}>({})

const canToggleAiPane = computed(() => {
  return store.assets.some((asset) => store.connectionStatuses[asset.id] === 'connected')
})

/**
 * Outer splitpanes: sidebar (22%) | content area (78%).
 * The content-area pane holds an inner splitpanes for main + AI.
 * This nesting ensures the sidebar width stays at 22% regardless
 * of AI pane open/close, avoiding the splitpanes redistribution bug
 * that occurs with conditional v-if panes.
 */
const contentAreaSize = computed(() => 100 - sidebarSize)

/**
 * Inner splitpanes: main | AI pane.
 * When AI pane is closed, main takes 100%. When open, sizes are
 * computed from the stored pixel width converted to percentage of
 * the content-area (not the full container).
 */
const contentAreaWidthPx = ref<number>(0)

const aiPaneSize = computed(() => {
  if (!store.dbAi.aiPaneOpen) return 0
  const w = contentAreaWidthPx.value
  if (!w || w <= 0) return 26
  const pct = (store.dbAi.sidebarSize / w) * 100
  return Math.min(60, Math.max(18, pct))
})

const innerMainSize = computed(() => {
  if (!store.dbAi.aiPaneOpen) return 100
  return Math.max(10, 100 - aiPaneSize.value)
})

/** Handle outer splitpanes resize (sidebar | content area split). */
const handleOuterSplitResize = (_panes: Array<{ size: number }>) => {
  // Outer split only has sidebar + content area; no pixel conversion needed
}

/**
 * Update the stored pixel width of the AI pane after the user drags
 * the inner splitter. The inner splitpanes emits sizes for its panes;
 * the second entry corresponds to the AI pane (index 1 when open).
 */
const handleInnerSplitResize = (panes: Array<{ size: number }>) => {
  if (!store.dbAi.aiPaneOpen) return
  const aiPane = panes[1]
  if (!aiPane || typeof aiPane.size !== 'number') return
  const w = contentAreaWidthPx.value
  if (!w || w <= 0) return
  const nextPx = Math.round((aiPane.size / 100) * w)
  if (nextPx > 0) store.setDbAiSidebarSize(nextPx)
}

/**
 * AiTab expects a non-null DbContext getter when workspace='database'.
 * Wrap the store helper so AiTab can re-read at send time without
 * holding a reactive subscription on the whole store. Returns null when
 * no connection is picked — AiTab treats that as "open without context"
 * and the send path will bail with the standard warning toast.
 */
const resolveDbContextForAiTab = (): AiTabDbContext | null => {
  if (!canToggleAiPane.value) return null
  const ctx = dbAiContext.value
  if (!ctx.assetId || !ctx.dbType || !ctx.databaseName) return null
  // Look up the connection's display name so the DB ChatBot header can
  // render "pg-prod · orders_db · public" without re-querying the tree.
  const asset = store.assets.find((a) => a.id === ctx.assetId)
  return {
    assetId: ctx.assetId,
    dbType: ctx.dbType,
    databaseName: ctx.databaseName,
    schemaName: ctx.schemaName,
    assetName: asset?.name
  }
}

const onDbAiAssetChange = (assetId: string) => {
  const asset = store.assets.find((item) => item.id === assetId)
  dbAiContext.value = {
    assetId,
    dbType: asset?.db_type,
    databaseName: undefined,
    schemaName: undefined
  }
}

const onDbAiDatabaseChange = (databaseName: string) => {
  dbAiContext.value = {
    ...dbAiContext.value,
    databaseName,
    schemaName: undefined
  }
}

const onDbAiSchemaChange = (schemaName: string) => {
  dbAiContext.value = {
    ...dbAiContext.value,
    schemaName
  }
}

const ensureDbAiContextInitialized = () => {
  if (dbAiContext.value.assetId) return
  const currentTabCtx = store.getActiveDbAiContext()
  if (currentTabCtx) {
    dbAiContext.value = {
      assetId: currentTabCtx.assetId,
      dbType: currentTabCtx.dbType,
      databaseName: currentTabCtx.databaseName,
      schemaName: currentTabCtx.schemaName
    }
    return
  }
  const connectedAsset = store.assets.find((asset) => store.connectionStatuses[asset.id] === 'connected')
  if (!connectedAsset) return
  const connNode = findConnectionByAssetId(store.tree, connectedAsset.id)
  const firstDb = connNode?.children?.find((node) => node.type === 'database')?.name
  const firstSchema =
    connectedAsset.db_type === 'postgresql' && firstDb
      ? connNode?.children?.find((node) => node.type === 'database' && node.name === firstDb)?.children?.find((node) => node.type === 'schema')?.name
      : undefined
  dbAiContext.value = {
    assetId: connectedAsset.id,
    dbType: connectedAsset.db_type,
    databaseName: firstDb,
    schemaName: firstSchema
  }
}

/**
 * Persist the DB AI tab state separately from the Terminal sidebar state
 * (see Stage 1: `aiTabStorageKey('database')`). Loaded on first mount;
 * written whenever AiTab emits state-changed.
 */
const savedDbAiTabState = ref<Record<string, unknown> | null>(null)
// Ref handle for the AiTab instance — referenced in the template via
// `ref="dbAiTabRef"`. Kept so future Stage 3 work can drive
// `getCurrentState()` / `restoreState()` on mode switches. The explicit
// `void` read satisfies vue-tsc's noUnusedLocals — template refs don't
// count as reads from TS's perspective.
const dbAiTabRef = ref<{
  restoreState?: (s: Record<string, unknown>) => void | Promise<void>
  getCurrentState?: () => Record<string, unknown> | null
} | null>(null)
void dbAiTabRef.value

const handleDbAiTabStateChanged = (state: Record<string, unknown>) => {
  savedDbAiTabState.value = state
  try {
    localStorage.setItem(DB_AI_TAB_STORAGE_KEY, JSON.stringify(state))
  } catch (err) {
    logger.warn('persist db ai tab state failed', {
      event: 'database.dbAi.aiTab.persist.failed',
      reason: err instanceof Error ? err.message : 'unknown'
    })
  }
}

const loadSavedDbAiTabState = () => {
  try {
    const raw = localStorage.getItem(DB_AI_TAB_STORAGE_KEY)
    if (raw) {
      savedDbAiTabState.value = JSON.parse(raw)
    }
  } catch (err) {
    logger.warn('load db ai tab state failed', {
      event: 'database.dbAi.aiTab.load.failed',
      reason: err instanceof Error ? err.message : 'unknown'
    })
    savedDbAiTabState.value = null
  }
}

const handleCloseAiPane = () => {
  store.setDbAiPaneOpen(false)
}

// Editor command bundle handed to the drawer. `null` when the active tab
// isn't a SQL tab (data/overview) so the drawer disables insert/replace.
const dbAiEditorCommands = computed(() => {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'sql') return null
  return {
    insertSql: (sql: string) => sqlWorkspaceRef.value?.insertSqlAtCursor(sql),
    replaceSelection: (sql: string) => sqlWorkspaceRef.value?.replaceEditorSelection(sql),
    runSql: (sql: string) => {
      // Read-only execute button: reuse existing runSqlOnActiveTab pipeline.
      // SQL the AI emits is not pre-validated here; the main-process
      // execute handler still applies its own safety rules.
      store.runSqlOnActiveTab('currentStatement', sql)
    }
  }
})

/**
 * Handle a DB-AI editor action bubbled up from the Monaco editor. Resolves
 * the DB context from the store (NOT from a captured prop) so switching
 * tabs between "invoke" and "IPC callback" never fires the request against
 * a stale connection. The actual main-process call is best-effort: if
 * `window.api.dbAi` is not yet wired up (service-dev owns task #5), we
 * still seed the local request state so the drawer UX can be developed
 * and verified with a mock.
 */
type DbAiEditorActionKind = 'explainSelection' | 'optimizeSelection' | 'convertDialect' | 'nl2sqlFromComment' | 'nl2sqlPrompt'

const handleDbAiEditorAction = (kind: DbAiEditorActionKind, sql: string) => {
  // NL → SQL prompt is driven by a modal; it doesn't follow the
  // SQL-selection fast path the other actions share.
  if (kind === 'nl2sqlPrompt') {
    openNl2SqlModal(sql)
    return
  }
  const ctx = store.getActiveDbAiContext()
  if (!ctx) {
    message.warning(t('database.dbAi.contextRequired'))
    return
  }
  const trimmed = (sql ?? '').trim()
  if (trimmed.length === 0) {
    message.info(t('database.dbAi.emptyInput'))
    return
  }

  if (kind === 'explainSelection') {
    dispatchDbAiRequest({
      action: 'explain',
      context: ctx,
      input: { sql: trimmed, selectedText: trimmed }
    })
    return
  }
  if (kind === 'optimizeSelection') {
    dispatchDbAiRequest({
      action: 'optimize',
      context: ctx,
      input: { sql: trimmed, selectedText: trimmed }
    })
    return
  }
  if (kind === 'convertDialect') {
    // Default target dialect is "the other one" — PG → MySQL and vice
    // versa. Users can still change it in the drawer's selector.
    const targetDialect = ctx.dbType === 'postgresql' ? 'mysql' : 'postgresql'
    dispatchDbAiRequest({
      action: 'convert',
      context: ctx,
      input: { sql: trimmed, selectedText: trimmed, targetDialect },
      targetDialect
    })
    return
  }
  if (kind === 'nl2sqlFromComment') {
    dispatchDbAiRequest({
      action: 'nl2sql',
      context: ctx,
      input: { question: trimmed }
    })
    return
  }
}

/**
 * NL → SQL prompt modal state. Driven entirely by two refs: the modal
 * is rendered unconditionally in the template with `:open="nl2SqlModal.open"`;
 * the textarea binds to `nl2SqlModal.question`. Kept in the Database root
 * instead of a sub-component so the handler can use the same store helpers
 * (`getActiveDbAiContext`, `dispatchDbAiRequest`) as the other actions.
 */
const nl2SqlModal = ref<{ open: boolean; question: string; confirmLoading: boolean }>({
  open: false,
  question: '',
  confirmLoading: false
})

const openNl2SqlModal = (seed: string) => {
  // Pre-check context up front so the user isn't asked to type a
  // question only to discover no connection is picked.
  const ctx = store.getActiveDbAiContext()
  if (!ctx) {
    message.warning(t('database.dbAi.contextRequired'))
    return
  }
  nl2SqlModal.value = {
    open: true,
    question: (seed ?? '').trim(),
    confirmLoading: false
  }
}

const cancelNl2SqlModal = () => {
  nl2SqlModal.value = { open: false, question: '', confirmLoading: false }
}

const submitNl2SqlModal = () => {
  const q = nl2SqlModal.value.question.trim()
  if (q.length === 0) {
    message.info(t('database.dbAi.emptyInput'))
    return
  }
  // Re-resolve context at submit time — the user may have switched tabs
  // while the modal was open.
  const ctx = store.getActiveDbAiContext()
  if (!ctx) {
    message.warning(t('database.dbAi.contextRequired'))
    return
  }
  dispatchDbAiRequest({
    action: 'nl2sql',
    context: ctx,
    input: { question: q }
  })
  nl2SqlModal.value = { open: false, question: '', confirmLoading: false }
}

/**
 * Shared dispatch helper: seeds the store's local request, wires up the
 * preload IPC call if present, and surfaces a best-effort error into the
 * store's done event so the drawer doesn't wedge.
 */
interface DispatchArgs {
  action: 'explain' | 'optimize' | 'convert' | 'nl2sql'
  context: ReturnType<typeof store.getActiveDbAiContext> & object
  input: Record<string, unknown>
  // Mirrors `SqlDialect` in `@common/db-ai-types` (PG/MySQL only today).
  // The drawer's own selector allows the user to pick Oracle/MSSQL/SQLite
  // for text-only conversion after the fact; those expanded targets are
  // not surfaced at start-time from the editor action.
  targetDialect?: 'postgresql' | 'mysql'
}

const dispatchDbAiRequest = (args: DispatchArgs) => {
  const reqId = generateReqId()
  store.startDbAiRequest({
    reqId,
    action: args.action,
    context: args.context,
    // Forward a minimal, normalized view of the input for the drawer's
    // local state. The full payload still goes to main via IPC below.
    input: args.input as Parameters<typeof store.startDbAiRequest>[0]['input'],
    targetDialect: args.targetDialect
  })
  const anyGlobal = globalThis as unknown as {
    window?: {
      api?: {
        dbAi?: {
          start?: (req: Record<string, unknown>) => Promise<{ ok: boolean; errorMessage?: string }>
        }
      }
    }
  }
  const startFn = anyGlobal.window?.api?.dbAi?.start
  if (typeof startFn !== 'function') {
    // Preload API not yet available — service-dev owns the wiring.
    // Log once at debug level and leave the request in `queued` state so
    // the UX is visibly distinguishable from a silent noop.
    logger.debug('dbAi.start not available; running in UI-only mode', {
      event: 'database.dbAi.start.mock',
      reqId,
      action: args.action
    })
    return
  }
  startFn({
    reqId,
    action: args.action,
    context: args.context,
    input: args.input
  }).catch((err) => {
    logger.warn('dbAi.start ipc failed', {
      event: 'database.dbAi.start.failed',
      reqId,
      action: args.action,
      reason: err instanceof Error ? err.message : 'unknown'
    })
    store.finishDbAiRequest({
      reqId,
      action: args.action,
      ok: false,
      errorMessage: 'ipc error'
    })
  })
}

function generateReqId(): string {
  const cryptoApi = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()
  return `db-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

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

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  store.loadAssetsFromBackend()
  subscribeDbAiEvents()
  loadSavedDbAiTabState()
  ensureDbAiContextInitialized()

  // Measure the content-area width (outer splitpanes' right pane) so
  // the inner splitpanes can convert AI pane px -> percentage accurately.
  const measureContentArea = () => {
    const contentPane = document.querySelector('.db-workspace__content-outer') as HTMLElement | null
    if (contentPane) {
      contentAreaWidthPx.value = contentPane.clientWidth
    }
  }
  measureContentArea()

  // Observe the workspace root for container width changes that affect
  // both outer and inner splitpanes sizing.
  const root = document.querySelector('.db-workspace') as HTMLElement | null
  if (typeof ResizeObserver !== 'undefined' && root) {
    resizeObserver = new ResizeObserver(measureContentArea)
    resizeObserver.observe(root)
  } else {
    globalThis.addEventListener?.('resize', measureContentArea)
  }
})

watch(
  () => [store.tree.length, store.assets.length, Object.keys(store.connectionStatuses).length],
  () => {
    ensureDbAiContextInitialized()
  }
)

onBeforeUnmount(() => {
  for (const off of dbAiUnsubs) {
    try {
      off()
    } catch {
      // ignore — unsubscribing twice is fine.
    }
  }
  dbAiUnsubs.length = 0
  resizeObserver?.disconnect()
  resizeObserver = null
})

const dbAiUnsubs: Array<() => void> = []

/**
 * Wire the store to the DB-AI IPC event stream. Subscriptions are disposed
 * on unmount so repeated Database workspace mounts do not accumulate
 * listeners. If `window.api.dbAi` is not yet available (task #5 in progress)
 * we simply skip — the drawer still renders the mock state seeded by
 * `startDbAiRequest`.
 */
function subscribeDbAiEvents() {
  const anyGlobal = globalThis as unknown as {
    window?: {
      api?: {
        dbAi?: {
          onStream?: (cb: (ev: { reqId: string; action: string; kind: 'text' | 'reasoning'; text: string }) => void) => () => void
          onDone?: (
            cb: (ev: { reqId: string; action: string; ok: boolean; errorMessage?: string; result?: { text?: string; sql?: string } }) => void
          ) => () => void
        }
      }
    }
  }
  const dbAi = anyGlobal.window?.api?.dbAi
  if (!dbAi) return
  if (typeof dbAi.onStream === 'function') {
    dbAiUnsubs.push(
      dbAi.onStream((ev) => {
        store.appendDbAiStream({
          reqId: ev.reqId,
          action: ev.action as Parameters<typeof store.appendDbAiStream>[0]['action'],
          kind: ev.kind,
          text: ev.text
        })
      })
    )
  }
  if (typeof dbAi.onDone === 'function') {
    dbAiUnsubs.push(
      dbAi.onDone((ev) => {
        store.finishDbAiRequest({
          reqId: ev.reqId,
          action: ev.action as Parameters<typeof store.finishDbAiRequest>[0]['action'],
          ok: ev.ok,
          errorMessage: ev.errorMessage,
          result: ev.result
        })
      })
    )
  }
}

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
    const alreadyLoaded = (node.children ?? []).some((c) => c.type === 'folder' || c.type === 'schema')
    if (!alreadyLoaded) {
      const connection = findNode(store.tree, node.parentId ?? '')
      const assetId = connection ? assetIdOf(connection) : null
      if (assetId) await store.loadDatabaseTables(assetId, node.name)
    }
  }

  // Lazy-load schema-scoped objects (tables/views/functions/procedures) on
  // first expand of a PG schema object-kind folder. Folders outside a PG
  // schema (e.g. the legacy MySQL "tables" folder) have no objectKind meta
  // and fall through unchanged.
  if (node.type === 'folder' && !node.expanded) {
    const meta = node.meta as { objectKind?: string; loaded?: boolean } | undefined
    if (meta?.objectKind && !meta.loaded) {
      await store.loadSchemaObjects(node.id)
    }
  }

  // Lazy-load columns on first expand of a table node.
  if (node.type === 'table' && !node.expanded) {
    const alreadyLoaded = (node.children ?? []).some((c) => c.type === 'column')
    if (!alreadyLoaded) {
      await store.loadTableColumns(node.id)
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

// Reload the schema tree for every currently-connected asset in parallel.
// Disconnected assets are skipped so the refresh icon does not implicitly
// reconnect anything.
const handleRefreshConnected = async () => {
  const connectedIds = Object.entries(store.connectionStatuses)
    .filter(([, status]) => status === 'connected')
    .map(([assetId]) => assetId)
  if (connectedIds.length === 0) return
  await Promise.all(connectedIds.map((assetId) => store.loadConnectedTree(assetId)))
}

const updateSql = (value: string) => {
  if (!activeTab.value) return
  activeTab.value.sql = value
}

const handleTest = async () => {
  if (!store.connectionDraft) return
  await store.testConnectionFromDraft(store.connectionDraft)
}

const handleSave = async (draft: DatabaseConnectionDraft) => {
  await store.saveConnection(draft)
}

const handleOpenConnectionModal = (dbType: DatabaseConnectionDraft['dbType']) => {
  store.openConnectionModal({ dbType })
}

const handleOpenConnectionModalForGroup = (dbType: DatabaseConnectionDraft['dbType'], groupId: string) => {
  store.openConnectionModal({ dbType, groupId })
}

const handleEditConnection = (assetId: string) => {
  store.openEditConnectionModal(assetId)
}

const handleCreateGroup = async () => {
  const id = await store.createGroup('New Group')
  if (id) editingGroupId.value = id
}

const handleCreateChildGroup = async (groupId: string) => {
  const id = await store.createGroup('New Group', groupId)
  if (id) editingGroupId.value = id
}

const handleMoveGroup = async (groupId: string, parentId: string | null) => {
  await store.moveGroup(groupId, parentId)
}

const handleRenameGroup = async (groupId: string) => {
  // Switch the target group into inline-edit mode; the tree node renders an
  // input that will call handleCommitGroupRename on blur/Enter.
  editingGroupId.value = groupId
}

const handleCommitGroupRename = async (groupId: string, currentName: string, nextName: string) => {
  editingGroupId.value = null
  const trimmed = nextName.trim()
  if (!trimmed || trimmed === currentName) return
  await store.renameGroup(groupId, trimmed)
}

const handleCancelGroupRename = () => {
  editingGroupId.value = null
}

const handleDeleteGroup = async (groupId: string, currentName: string) => {
  Modal.confirm({
    title: t('database.deleteGroupConfirmTitle'),
    content: t('database.deleteGroupConfirmContent', { name: currentName }),
    okText: t('common.delete'),
    okType: 'danger',
    cancelText: t('common.cancel'),
    maskClosable: true,
    onOk: async () => {
      await store.deleteGroup(groupId)
    }
  })
}

const handleCopyGroupName = async (value: string) => {
  await globalThis.navigator?.clipboard?.writeText?.(value)
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

// --- Table context-menu actions -----------------------------------------

interface TableActionCtx {
  nodeId: string
  assetId: string
  dbType: 'mysql' | 'postgresql'
  databaseName: string
  schemaName?: string
  tableName: string
}

type TableActionKind = 'openTable' | 'queryConsole' | 'copyName' | 'viewDdl' | 'copySelect' | 'copyDdl' | 'truncate' | 'drop'

/**
 * Copy text to the system clipboard with a textarea fallback for older
 * Electron contexts where navigator.clipboard is unavailable.
 */
const copyTextToClipboard = async (value: string): Promise<void> => {
  const nav = globalThis.navigator as Navigator | undefined
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(value)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = value
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(ta)
  }
}

const handleTableAction = async (payload: { action: TableActionKind; ctx: TableActionCtx }): Promise<void> => {
  const { action, ctx } = payload
  const storeCtx = {
    assetId: ctx.assetId,
    dbType: ctx.dbType,
    databaseName: ctx.databaseName,
    schemaName: ctx.schemaName,
    tableName: ctx.tableName
  }
  switch (action) {
    case 'openTable':
      await store.openTableDataTab(ctx.nodeId)
      return
    case 'queryConsole':
      store.openSqlTabWithSelect(storeCtx)
      return
    case 'copyName':
      await copyTextToClipboard(ctx.tableName)
      message.success(t('database.tableMenu.nameCopied'))
      return
    case 'copySelect': {
      const qualified = buildQualifiedTable(ctx.dbType, ctx.schemaName, ctx.tableName)
      await copyTextToClipboard(`SELECT * FROM ${qualified}`)
      message.success(t('database.tableMenu.selectCopied'))
      return
    }
    case 'viewDdl': {
      const res = await store.fetchTableDdl(storeCtx)
      if (!res.ok) {
        if (res.errorCode === 'permission') {
          message.error(t('database.tableMenu.ddlPermissionDenied'))
        } else {
          message.error(t('database.tableMenu.ddlFetchFailed', { msg: res.errorMessage }))
        }
        return
      }
      ddlViewer.value = { open: true, tableName: ctx.tableName, ddl: res.ddl }
      return
    }
    case 'copyDdl': {
      const res = await store.fetchTableDdl(storeCtx)
      if (!res.ok) {
        if (res.errorCode === 'permission') {
          message.error(t('database.tableMenu.ddlPermissionDenied'))
        } else {
          message.error(t('database.tableMenu.ddlFetchFailed', { msg: res.errorMessage }))
        }
        return
      }
      await copyTextToClipboard(res.ddl)
      message.success(t('database.tableMenu.ddlCopied'))
      return
    }
    case 'truncate': {
      Modal.confirm({
        title: t('database.tableMenu.truncateConfirmTitle'),
        content: t('database.tableMenu.truncateConfirmContent', { table: ctx.tableName }),
        okType: 'danger',
        okText: t('common.delete'),
        cancelText: t('common.cancel'),
        onOk: async () => {
          const res = await store.truncateTable(storeCtx)
          if (res.ok) {
            message.success(t('database.tableMenu.truncated'))
          } else {
            message.error(res.errorMessage ?? '')
          }
        }
      })
      return
    }
    case 'drop': {
      Modal.confirm({
        title: t('database.tableMenu.dropConfirmTitle'),
        content: t('database.tableMenu.dropConfirmContent', { table: ctx.tableName }),
        okType: 'danger',
        okText: t('common.delete'),
        cancelText: t('common.cancel'),
        onOk: async () => {
          const res = await store.dropTable(storeCtx)
          if (res.ok) {
            message.success(t('database.tableMenu.dropped'))
          } else {
            message.error(res.errorMessage ?? '')
          }
        }
      })
      return
    }
  }
}
</script>

<style lang="less" scoped>
.db-ai-nl2sql-modal {
  display: flex;
  flex-direction: column;
  gap: 8px;

  &__hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-color-secondary, #8a94a6);
  }
}

.db-workspace {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);

  &__splitpanes {
    flex: 1;

    .splitpanes__pane {
      transition: none !important;
      animation: none !important;
    }
  }

  &__content-outer {
    // The outer splitpanes' right pane that holds the inner splitpanes
    // must also disable transitions
  }

  &__content-split {
    height: 100%;

    .splitpanes__pane {
      transition: none !important;
      animation: none !important;
    }
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

  &__ai-pane {
    height: 100%;
    display: flex;
    flex-direction: column;
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
