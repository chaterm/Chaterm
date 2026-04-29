<template>
  <div class="sql-workspace">
    <SqlToolbar
      :asset-id="tab.assetId"
      :database-name="tab.databaseName"
      :tree="tree"
      :connection-statuses="connectionStatuses"
      @run="handleRun"
      @update:asset-id="(v: string) => emit('update-context', v || undefined, tab.databaseName)"
      @update:database-name="(v: string) => emit('update-context', tab.assetId, v || undefined)"
    />
    <splitpanes
      horizontal
      class="sql-workspace__panes"
    >
      <pane
        :size="45"
        :min-size="20"
      >
        <SqlMonacoEditor
          ref="editorRef"
          :model-value="tab.sql"
          @update:model-value="(v: string) => emit('update-sql', v)"
          @run="(m: 'all' | 'currentStatement') => handleRun(m)"
        />
      </pane>
      <pane
        :size="55"
        :min-size="20"
      >
        <div class="sql-workspace__bottom">
          <SqlResultTabs
            :result-tabs="tab.resultTabs ?? []"
            :active-result-tab-id="tab.activeResultTabId ?? 'overview'"
            @select="(id: string) => emit('select-result-tab', id)"
            @close="(id: string) => emit('close-result-tab', id)"
          />
          <DataGridToolbar
            v-if="showResultToolbar"
            :page="viewState.page"
            :page-size="viewState.pageSize"
            :total="filteredTotal"
            hide-refresh
            @goto-page="handleGotoPage"
            @goto-last-page="handleGotoLastPage"
            @change-page-size="handleChangePageSize"
            @refresh-total="() => {}"
          />
          <div class="sql-workspace__body">
            <SqlOverviewPane
              v-if="(tab.activeResultTabId ?? 'overview') === 'overview'"
              :history="tab.history ?? []"
              :closed-result-tab-ids="closedResultTabIds"
              @open-result="(id: string) => emit('select-result-tab', id)"
            />
            <template v-else-if="activeResult">
              <div
                v-if="activeResult.status === 'running'"
                class="sql-workspace__status"
              >
                {{ $t('database.sqlRunning') }}
              </div>
              <div
                v-else-if="activeResult.status === 'error'"
                class="sql-workspace__status sql-workspace__status--error"
              >
                {{ activeResult.error }}
              </div>
              <DatabaseResultPane
                v-else
                :columns="activeResult.columns"
                :rows="displayRows"
                :filters="viewState.filters"
                :sort="viewState.sort"
                :start-row-index="startRowIndex"
                :load-distinct="loadDistinct"
                @sort="handleSort"
                @apply-filter="handleApplyFilter"
              />
            </template>
          </div>
          <DataStatusBar
            v-if="activeResult"
            :error="activeResult.error"
            :duration-ms="activeResult.durationMs"
            :row-count="activeResult.rowCount"
          />
        </div>
      </pane>
    </splitpanes>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Pane, Splitpanes } from 'splitpanes'
import SqlToolbar from './SqlToolbar.vue'
import SqlMonacoEditor from './SqlMonacoEditor.vue'
import SqlResultTabs from './SqlResultTabs.vue'
import SqlOverviewPane from './SqlOverviewPane.vue'
import DatabaseResultPane from './DatabaseResultPane.vue'
import DataGridToolbar from './DataGridToolbar.vue'
import DataStatusBar from './DataStatusBar.vue'
import type { DatabaseTreeNode, DatabaseWorkspaceTab, DbColumnFilter, DbColumnSort } from '../types'

/**
 * Shell that composes the SQL workbench for a `kind: 'sql'` tab:
 *
 *   toolbar (run buttons + connection/database pickers)
 *   + splitpanes
 *     + Monaco editor
 *     + result tab bar (Overview + one tab per execution)
 *       + DataGridToolbar (pagination + disabled edit buttons, SQL-result mode)
 *       + either the Overview history table, or the active result's grid
 *     + status bar
 *
 * All SQL-execution mutations are surfaced as events so the owner
 * (`Database/index.vue`) can route them through the Pinia store; this
 * component owns only presentation-level state for the result grid —
 * client-side pagination, sorting, and column filtering per result tab —
 * because those are transient view concerns and should not pollute the
 * store.
 */
const props = defineProps<{
  tab: DatabaseWorkspaceTab
  tree: DatabaseTreeNode[]
  connectionStatuses: Record<string, 'idle' | 'testing' | 'connected' | 'failed'>
}>()

const emit = defineEmits<{
  (e: 'update-sql', v: string): void
  (e: 'update-context', assetId: string | undefined, databaseName: string | undefined): void
  (e: 'run', mode: 'all' | 'currentStatement' | 'explain', sql: string): void
  (e: 'select-result-tab', id: string): void
  (e: 'close-result-tab', id: string): void
}>()

interface EditorApi {
  getText(): string
  getSelectedText(): string
  getTextUntilCursor(): string
  getCurrentStatement(): string
  focus?: () => void
}

const editorRef = ref<EditorApi | null>(null)

const activeResult = computed(() => {
  const id = props.tab.activeResultTabId
  if (!id || id === 'overview') return null
  return (props.tab.resultTabs ?? []).find((r) => r.id === id) ?? null
})

// Track history entries whose result tab has been closed. Used by the
// Overview pane to render those rows as dimmed / inert.
const closedResultTabIds = computed(() => {
  const live = new Set((props.tab.resultTabs ?? []).map((r) => r.id))
  const ids = new Set<string>()
  for (const h of props.tab.history ?? []) {
    if (h.resultTabId && !live.has(h.resultTabId)) ids.add(h.resultTabId)
  }
  return ids
})

// -- Client-side view state per result tab --------------------------------
//
// Keyed by SqlResultTab.id. We keep a reactive record rather than a Map so
// Vue picks up writes via bracket assignment without needing manual triggers.

interface SqlResultViewState {
  page: number
  pageSize: number
  filters: DbColumnFilter[]
  sort: DbColumnSort | null
}

const DEFAULT_PAGE_SIZE = 100

const viewStateByResultTab = reactive<Record<string, SqlResultViewState>>({})

const getOrCreateViewState = (resultTabId: string): SqlResultViewState => {
  let s = viewStateByResultTab[resultTabId]
  if (!s) {
    s = { page: 1, pageSize: DEFAULT_PAGE_SIZE, filters: [], sort: null }
    viewStateByResultTab[resultTabId] = s
  }
  return s
}

// Fall-back state object used when no result tab is active. Kept as a
// constant object (not reactive) because nothing ever writes to it — the
// grid and toolbar simply skip rendering in that case.
const EMPTY_VIEW_STATE: SqlResultViewState = Object.freeze({
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  filters: [],
  sort: null
}) as SqlResultViewState

const viewState = computed<SqlResultViewState>(() => {
  const r = activeResult.value
  if (!r) return EMPTY_VIEW_STATE
  return getOrCreateViewState(r.id)
})

// Column filter application. Mirrors the semantics of the server-side
// filters so the UX feels identical: eq/neq/like match string coerced
// values, isnull/notnull ignore value, in matches against `values`.
const matchesFilter = (row: Record<string, unknown>, f: DbColumnFilter): boolean => {
  const raw = row[f.column]
  switch (f.operator) {
    case 'isnull':
      return raw === null || raw === undefined
    case 'notnull':
      return raw !== null && raw !== undefined
    case 'eq':
      return String(raw ?? '') === String(f.value ?? '')
    case 'neq':
      return String(raw ?? '') !== String(f.value ?? '')
    case 'like': {
      const needle = String(f.value ?? '').toLowerCase()
      if (!needle) return true
      return String(raw ?? '')
        .toLowerCase()
        .includes(needle)
    }
    case 'in': {
      const hay = String(raw ?? '')
      return (f.values ?? []).some((v) => String(v ?? '') === hay)
    }
    default:
      return true
  }
}

// Rows after filter + sort, before paging. Used for totals + the slice
// handed to DatabaseResultPane.
const filteredSortedRows = computed<Array<Record<string, unknown>>>(() => {
  const r = activeResult.value
  if (!r || r.status !== 'ok') return []
  const s = viewState.value
  let rows = r.rows
  if (s.filters.length > 0) {
    rows = rows.filter((row) => s.filters.every((f) => matchesFilter(row, f)))
  }
  if (s.sort) {
    const { column, direction } = s.sort
    const factor = direction === 'desc' ? -1 : 1
    // Copy before sort to avoid mutating store-owned arrays.
    rows = [...rows].sort((a, b) => {
      const av = a[column]
      const bv = b[column]
      if (av == null && bv == null) return 0
      if (av == null) return -1 * factor
      if (bv == null) return 1 * factor
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * factor
      }
      return String(av).localeCompare(String(bv)) * factor
    })
  }
  return rows
})

const filteredTotal = computed(() => filteredSortedRows.value.length)

const displayRows = computed(() => {
  const rows = filteredSortedRows.value
  const s = viewState.value
  const start = (s.page - 1) * s.pageSize
  return rows.slice(start, start + s.pageSize)
})

const startRowIndex = computed(() => {
  const s = viewState.value
  return (s.page - 1) * s.pageSize + 1
})

// Only show the data-grid toolbar when we have a concrete OK result in
// front of the user. Overview / running / error all hide it.
const showResultToolbar = computed(() => {
  const id = props.tab.activeResultTabId
  if (!id || id === 'overview') return false
  const r = activeResult.value
  return !!(r && r.status === 'ok')
})

// -- Toolbar + grid event handlers ----------------------------------------

const handleGotoPage = (page: number) => {
  const r = activeResult.value
  if (!r) return
  const s = getOrCreateViewState(r.id)
  const total = filteredTotal.value
  const maxPage = total <= 0 ? 1 : Math.max(1, Math.ceil(total / s.pageSize))
  s.page = Math.min(Math.max(1, Math.floor(page)), maxPage)
}

const handleGotoLastPage = () => {
  const r = activeResult.value
  if (!r) return
  const s = getOrCreateViewState(r.id)
  const total = filteredTotal.value
  s.page = total <= 0 ? 1 : Math.max(1, Math.ceil(total / s.pageSize))
}

const handleChangePageSize = (size: number) => {
  const r = activeResult.value
  if (!r) return
  const s = getOrCreateViewState(r.id)
  const safe = Number.isFinite(size) && size > 0 ? Math.floor(size) : DEFAULT_PAGE_SIZE
  s.pageSize = safe
  // Clamp current page into the new range so user is not stranded on an
  // empty page after switching to a larger page size.
  const total = filteredTotal.value
  const maxPage = total <= 0 ? 1 : Math.max(1, Math.ceil(total / safe))
  if (s.page > maxPage) s.page = maxPage
}

const handleSort = (column: string, direction: 'asc' | 'desc' | null) => {
  const r = activeResult.value
  if (!r) return
  const s = getOrCreateViewState(r.id)
  s.sort = direction ? { column, direction } : null
  s.page = 1
}

const handleApplyFilter = (column: string, filter: DbColumnFilter | null) => {
  const r = activeResult.value
  if (!r) return
  const s = getOrCreateViewState(r.id)
  const others = s.filters.filter((f) => f.column !== column)
  s.filters = filter ? [...others, filter] : others
  s.page = 1
}

/**
 * Provide the Filter popover with a distinct-value list for a column,
 * computed locally from the current result set. Capped at 500 entries to
 * avoid runaway DOM in wide result grids; if the column has more distinct
 * values than that, the user can still use the fuzzy / eq / isnull paths.
 * NULL / undefined values are skipped (the popover represents NULL with its
 * own chip).
 */
const loadDistinct = async (column: string): Promise<string[]> => {
  const r = activeResult.value
  if (!r || r.status !== 'ok') return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of r.rows) {
    const v = row[column]
    if (v === null || v === undefined) continue
    const key = String(v)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
    if (out.length >= 500) break
  }
  return out
}

const handleRun = (mode: 'all' | 'currentStatement' | 'explain') => {
  const ed = editorRef.value
  if (!ed) return
  let sql = ''
  if (mode === 'all') {
    sql = ed.getText()
  } else if (mode === 'currentStatement') {
    // Selection wins if the user actually highlighted something; otherwise
    // fall back to the statement under the cursor.
    const sel = ed.getSelectedText()
    sql = sel.trim().length > 0 ? sel : ed.getCurrentStatement()
  } else {
    // Explain: always targets the statement under the cursor; selection is
    // intentionally ignored to keep EXPLAIN + arbitrary sub-selection from
    // producing syntactically broken input.
    const stmt = ed.getCurrentStatement().trim()
    sql = stmt.length > 0 ? `EXPLAIN ${stmt}` : ''
  }
  emit('run', mode, sql)
}
</script>

<style scoped lang="less">
.sql-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sql-workspace__panes {
  flex: 1;
  min-height: 0;
}

.sql-workspace__bottom {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sql-workspace__body {
  flex: 1;
  overflow: hidden;
}

.sql-workspace__status {
  padding: 12px 16px;
  font-size: 12px;
  color: var(--text-color-secondary, #8a94a6);

  &--error {
    color: #ef4444;
  }
}
</style>
