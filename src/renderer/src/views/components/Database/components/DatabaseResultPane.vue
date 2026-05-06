<template>
  <div class="db-result">
    <div
      v-if="columns.length === 0"
      class="db-result__empty"
    >
      {{ $t('database.noResults') }}
    </div>
    <div
      v-else
      class="db-result__table-wrapper"
    >
      <table class="db-result__table">
        <thead>
          <tr>
            <th class="db-result__th db-result__th--index">#</th>
            <th
              v-for="col in columns"
              :key="col"
              class="db-result__th"
            >
              <span
                class="db-result__th-label"
                @click="handleHeaderClick(col)"
              >
                {{ col }}
              </span>
              <span class="db-result__th-controls">
                <span
                  class="db-result__th-icon"
                  :class="{ 'db-result__th-icon--active': sort?.column === col }"
                  :title="$t('database.sortTooltip')"
                  @click.stop="handleHeaderClick(col)"
                >
                  <CaretUpOutlined v-if="sort?.column === col && sort.direction === 'asc'" />
                  <CaretDownOutlined v-else-if="sort?.column === col && sort.direction === 'desc'" />
                  <SwapOutlined
                    v-else
                    class="db-result__th-icon-swap"
                  />
                </span>
                <span
                  class="db-result__th-icon"
                  :class="{ 'db-result__th-icon--active': hasFilter(col) }"
                  :title="$t('database.filterTooltip')"
                  @click.stop="handleFilterClick($event, col)"
                >
                  <FilterOutlined />
                </span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(_row, rowIndex) in rows"
            :key="rowIndex"
            class="db-result__tr"
            :class="originalRowClass(rowIndex)"
            @click="handleRowClick(rowIndex)"
          >
            <td class="db-result__td db-result__td--index">{{ startRowIndex + rowIndex }}</td>
            <td
              v-for="col in columns"
              :key="col"
              class="db-result__td"
              :class="cellClass(rowIndex, col)"
              @dblclick="handleCellDblClick(rowIndex, col, $event)"
            >
              <template v-if="isEditingCell(rowIndex, col)">
                <input
                  ref="editInputRef"
                  class="db-result__cell-input"
                  :value="editingValueText"
                  @input="onEditInput"
                  @keydown.enter.prevent="commitEdit()"
                  @keydown.esc.prevent="cancelEdit()"
                  @blur="commitEdit()"
                />
              </template>
              <template v-else>
                <span
                  v-if="displayCellValue(rowIndex, col) === null"
                  class="db-result__null"
                  >&lt;null&gt;</span
                >
                <span v-else>{{ formatCell(displayCellValue(rowIndex, col)) }}</span>
              </template>
            </td>
          </tr>
          <!-- Locally added rows rendered at the bottom of the grid -->
          <tr
            v-for="newRow in newRows"
            :key="'new-' + newRow.tmpId"
            class="db-result__tr db-result__tr--new"
            :class="newRowClass(newRow.tmpId)"
            @click="handleNewRowClick(newRow.tmpId)"
          >
            <td class="db-result__td db-result__td--index">*</td>
            <td
              v-for="col in columns"
              :key="col"
              class="db-result__td"
              @dblclick="handleNewCellDblClick(newRow.tmpId, col, $event)"
            >
              <template v-if="isEditingNewCell(newRow.tmpId, col)">
                <input
                  ref="editInputRef"
                  class="db-result__cell-input"
                  :value="editingValueText"
                  @input="onEditInput"
                  @keydown.enter.prevent="commitEdit()"
                  @keydown.esc.prevent="cancelEdit()"
                  @blur="commitEdit()"
                />
              </template>
              <template v-else>
                <span
                  v-if="newRow.values[col] === null || newRow.values[col] === undefined"
                  class="db-result__null"
                  >&lt;null&gt;</span
                >
                <span v-else>{{ formatCell(newRow.values[col]) }}</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <TableFilterPopover
      v-if="openFilterColumn"
      :key="openFilterColumn"
      :column="openFilterColumn"
      :current="activeFilterFor(openFilterColumn)"
      :anchor-left="filterAnchor.x"
      :anchor-top="filterAnchor.y"
      :values="distinctValues"
      :loading="distinctLoading"
      @apply="(f) => emit('applyFilter', openFilterColumn!, f)"
      @close="openFilterColumn = null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CaretDownOutlined, CaretUpOutlined, FilterOutlined, SwapOutlined } from '@ant-design/icons-vue'
import TableFilterPopover from './TableFilterPopover.vue'
import type { DbColumnFilter, DbColumnSort } from '../types'

const props = withDefaults(
  defineProps<{
    columns: string[]
    rows: Array<Record<string, unknown>>
    filters?: DbColumnFilter[]
    sort?: DbColumnSort | null
    /** Index of the first row (1-based) for display in the row-number column. */
    startRowIndex?: number
    /** Loads distinct values for a column on demand. */
    loadDistinct?: (column: string) => Promise<string[]>

    // Editing props (populated only for kind='data' tabs)
    editable?: boolean
    newRows?: Array<{ tmpId: string; values: Record<string, unknown> }>
    deletedRowKeys?: Set<string>
    updatedCells?: Map<string, Record<string, unknown>>
    primaryKey?: string[] | null
    selectedRowKey?: string | null
  }>(),
  {
    filters: () => [],
    sort: null,
    startRowIndex: 1,
    loadDistinct: undefined,
    editable: false,
    newRows: () => [],
    deletedRowKeys: () => new Set<string>(),
    updatedCells: () => new Map<string, Record<string, unknown>>(),
    primaryKey: null,
    selectedRowKey: null
  }
)

const emit = defineEmits<{
  (e: 'sort', column: string, direction: 'asc' | 'desc' | null): void
  (e: 'applyFilter', column: string, filter: DbColumnFilter | null): void
  (e: 'cellEdit', rowKey: string, col: string, newVal: unknown): void
  (e: 'newRowCellEdit', tmpId: string, col: string, newVal: unknown): void
  (e: 'selectRow', rowKey: string): void
}>()

const openFilterColumn = ref<string | null>(null)
const filterAnchor = ref({ x: 0, y: 0 })
const distinctValues = ref<string[]>([])
const distinctLoading = ref(false)

// Inline edit session state.
// "origin" distinguishes an original-row edit from a new-row edit so we can
// emit the correct event kind on commit.
type EditTarget = { origin: 'row'; rowKey: string; col: string } | { origin: 'new'; tmpId: string; col: string }
const editing = ref<EditTarget | null>(null)
const editingValueText = ref('')
const editInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null)

const pk = computed(() => props.primaryKey ?? null)
const hasPk = computed(() => Array.isArray(pk.value) && pk.value.length > 0)

/** Build a stable row key from a row object given the table's primary key. */
const buildRowKey = (row: Record<string, unknown>, primaryKey: string[] | null): string | null => {
  if (!primaryKey || primaryKey.length === 0) return null
  const parts: unknown[] = []
  for (const col of primaryKey) {
    parts.push(row[col])
  }
  return JSON.stringify(parts)
}

// Diagnose: print the first row's value types once per data change.
watch(
  () => props.rows,
  (rows) => {
    if (!rows || rows.length === 0) return
    const sample = rows[0]
    const typesPerCol: Record<string, string> = {}
    for (const key of Object.keys(sample)) {
      const v = sample[key]
      if (v === null) {
        typesPerCol[key] = 'null'
      } else if (v === undefined) {
        typesPerCol[key] = 'undefined'
      } else if (Array.isArray(v)) {
        typesPerCol[key] = 'array'
      } else if (typeof v === 'object') {
        typesPerCol[key] = (v as object).constructor?.name ?? 'object'
      } else {
        typesPerCol[key] = typeof v
      }
    }
    // eslint-disable-next-line no-console
    console.log('[DB-DEBUG] ResultPane first-row types', typesPerCol)
  },
  { immediate: true }
)

const formatCell = (value: unknown): string => {
  try {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (typeof value === 'bigint') return value.toString()
    if (value instanceof Date) {
      // Invalid Date objects throw on toISOString(). Fall back to the tag
      // that Date.toString() emits so the cell stays renderable.
      const ts = value.getTime()
      return Number.isFinite(ts) ? value.toISOString() : ''
    }
    // mysql2 may return Buffer for binary / some collations
    if (value && typeof (value as { toString?: () => string }).toString === 'function') {
      const ctor = (value as object).constructor?.name
      if (ctor === 'Buffer' || ctor === 'Uint8Array') {
        return (value as Buffer).toString('utf8')
      }
    }
    // Plain object / array / other — JSON-stringify so the render never blows up.
    return JSON.stringify(value)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB-DEBUG] formatCell threw', err, value)
    return '<unrenderable>'
  }
}

const hasFilter = (col: string) => (props.filters ?? []).some((f) => f.column === col)

const activeFilterFor = (col: string): DbColumnFilter | null => (props.filters ?? []).find((f) => f.column === col) ?? null

const handleHeaderClick = (col: string) => {
  // Tri-state: asc -> desc -> null -> asc
  const current = props.sort
  if (!current || current.column !== col) {
    emit('sort', col, 'asc')
  } else if (current.direction === 'asc') {
    emit('sort', col, 'desc')
  } else {
    emit('sort', col, null)
  }
}

const handleFilterClick = async (ev: MouseEvent, col: string) => {
  const target = ev.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  filterAnchor.value = { x: rect.left, y: rect.bottom + 2 }
  if (openFilterColumn.value === col) {
    openFilterColumn.value = null
    return
  }
  openFilterColumn.value = col
  distinctValues.value = []
  if (props.loadDistinct) {
    distinctLoading.value = true
    try {
      distinctValues.value = await props.loadDistinct(col)
    } finally {
      distinctLoading.value = false
    }
  }
}

// --- Row key / dirty helpers ------------------------------------------------

const rowKeyAt = (rowIndex: number): string | null => {
  const row = props.rows[rowIndex]
  if (!row) return null
  return buildRowKey(row, pk.value)
}

const isRowDeleted = (rowIndex: number): boolean => {
  const key = rowKeyAt(rowIndex)
  if (!key) return false
  return props.deletedRowKeys?.has(key) ?? false
}

const isRowUpdated = (rowIndex: number): boolean => {
  const key = rowKeyAt(rowIndex)
  if (!key) return false
  const patch = props.updatedCells?.get(key)
  return !!patch && Object.keys(patch).length > 0
}

const isRowSelected = (rowIndex: number): boolean => {
  const key = rowKeyAt(rowIndex)
  if (!key) return false
  return props.selectedRowKey === key
}

const originalRowClass = (rowIndex: number) => ({
  'db-result__tr--deleted': isRowDeleted(rowIndex),
  'db-result__tr--updated': isRowUpdated(rowIndex),
  'db-result__tr--selected': isRowSelected(rowIndex)
})

const cellClass = (rowIndex: number, col: string) => {
  const key = rowKeyAt(rowIndex)
  if (!key) return {}
  const patch = props.updatedCells?.get(key)
  if (patch && Object.prototype.hasOwnProperty.call(patch, col)) {
    return { 'db-result__td--updated': true }
  }
  return {}
}

const newRowClass = (tmpId: string) => ({
  'db-result__tr--selected': props.selectedRowKey === tmpId
})

// Returns the currently displayed value for an original-row cell,
// preferring any pending dirty value.
const displayCellValue = (rowIndex: number, col: string): unknown => {
  const row = props.rows[rowIndex]
  if (!row) return null
  const key = buildRowKey(row, pk.value)
  if (key) {
    const patch = props.updatedCells?.get(key)
    if (patch && Object.prototype.hasOwnProperty.call(patch, col)) {
      const v = patch[col]
      return v === undefined ? null : v
    }
  }
  const raw = row[col]
  return raw === undefined ? null : raw
}

// --- Selection --------------------------------------------------------------

const handleRowClick = (rowIndex: number) => {
  const key = rowKeyAt(rowIndex)
  if (!key) return
  emit('selectRow', key)
}

const handleNewRowClick = (tmpId: string) => {
  emit('selectRow', tmpId)
}

// --- Inline editing ---------------------------------------------------------

const valueToText = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  return formatCell(v)
}

const isEditingCell = (rowIndex: number, col: string): boolean => {
  if (!editing.value || editing.value.origin !== 'row') return false
  const key = rowKeyAt(rowIndex)
  return !!key && editing.value.rowKey === key && editing.value.col === col
}

const isEditingNewCell = (tmpId: string, col: string): boolean => {
  if (!editing.value || editing.value.origin !== 'new') return false
  return editing.value.tmpId === tmpId && editing.value.col === col
}

const focusEditInput = () => {
  nextTick(() => {
    const ref = editInputRef.value
    const el = Array.isArray(ref) ? ref[0] : ref
    if (el && typeof (el as HTMLInputElement).focus === 'function') {
      ;(el as HTMLInputElement).focus()
      try {
        ;(el as HTMLInputElement).select()
      } catch {
        /* ignore */
      }
    }
  })
}

const handleCellDblClick = (rowIndex: number, col: string, _ev: MouseEvent) => {
  if (!props.editable) return
  if (!hasPk.value) return
  const key = rowKeyAt(rowIndex)
  if (!key) return
  if (isRowDeleted(rowIndex)) return
  editing.value = { origin: 'row', rowKey: key, col }
  editingValueText.value = valueToText(displayCellValue(rowIndex, col))
  focusEditInput()
}

const handleNewCellDblClick = (tmpId: string, col: string, _ev: MouseEvent) => {
  if (!props.editable) return
  editing.value = { origin: 'new', tmpId, col }
  const row = props.newRows?.find((r) => r.tmpId === tmpId)
  editingValueText.value = valueToText(row?.values[col])
  focusEditInput()
}

const onEditInput = (ev: Event) => {
  const target = ev.target as HTMLInputElement | null
  if (!target) return
  editingValueText.value = target.value
}

const commitEdit = () => {
  const target = editing.value
  if (!target) return
  const newVal: string = editingValueText.value
  editing.value = null
  if (target.origin === 'row') {
    emit('cellEdit', target.rowKey, target.col, newVal)
  } else {
    emit('newRowCellEdit', target.tmpId, target.col, newVal)
  }
}

const cancelEdit = () => {
  editing.value = null
  editingValueText.value = ''
}

// Expose buildRowKey for tests / parent logic if ever needed.
defineExpose({ buildRowKey })
</script>

<style lang="less" scoped>
.db-result {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
  color: var(--text-color);
  position: relative;

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-color-secondary, #8a94a6);
    font-size: 13px;
  }

  &__table-wrapper {
    flex: 1;
    overflow: auto;
  }

  &__table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  &__th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 4px 10px;
    text-align: left;
    font-weight: 500;
    color: var(--text-color);
    background: var(--bg-color-secondary);
    border-bottom: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
    white-space: nowrap;
    user-select: none;

    &--index {
      width: 44px;
      text-align: center;
      color: var(--text-color-secondary, #8a94a6);
    }
  }

  &__th-label {
    cursor: pointer;
    margin-right: 6px;
  }

  &__th-controls {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  &__th-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    font-size: 11px;
    color: var(--text-color-secondary, #8a94a6);
    cursor: pointer;
    border-radius: 3px;
    opacity: 0.55;
    transition:
      opacity 0.15s ease,
      color 0.15s ease,
      background 0.15s ease;

    &:hover {
      background: var(--hover-bg-color);
      color: var(--text-color);
      opacity: 1;
    }

    &--active {
      color: #a78bfa;
      opacity: 1;
    }
  }

  &__th-icon-swap {
    transform: rotate(90deg);
    font-size: 10px;
  }

  &__tr:hover {
    background: var(--hover-bg-color);
  }

  &__tr--new {
    background: rgba(39, 174, 96, 0.12);
    border-left: 3px solid #27ae60;
  }

  &__tr--deleted {
    background: rgba(231, 76, 60, 0.12);
    text-decoration: line-through;
    border-left: 3px solid #e74c3c;
  }

  &__tr--selected {
    background: rgba(24, 144, 255, 0.08);
    border-left: 2px solid var(--primary-color, #1890ff);
  }

  &__td {
    padding: 4px 10px;
    color: var(--text-color);
    border-bottom: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
    white-space: nowrap;

    &--index {
      width: 44px;
      text-align: center;
      color: var(--text-color-secondary, #8a94a6);
    }

    &--updated {
      background: rgba(241, 196, 15, 0.15);
      position: relative;

      &::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        border-width: 0 6px 6px 0;
        border-style: solid;
        border-color: transparent #f1c40f transparent transparent;
      }
    }
  }

  &__null {
    color: #22c55e;
    font-style: italic;
  }

  &__cell-input {
    width: 100%;
    padding: 2px 4px;
    font-size: 12px;
    color: var(--text-color);
    background: var(--bg-color);
    border: 1px solid var(--primary-color, #1890ff);
    border-radius: 2px;
    outline: none;
  }
}
</style>

<style lang="less">
.db-result__table-wrapper {
  scrollbar-gutter: stable both-edges;
  scrollbar-width: auto;
  scrollbar-color: var(--scrollbar-thumb-color, var(--border-color-light)) var(--scrollbar-track-color, var(--bg-color-secondary));
}

.db-result__table-wrapper::-webkit-scrollbar {
  display: block;
  width: 14px;
  height: 14px;
}

.db-result__table-wrapper::-webkit-scrollbar-track {
  background: var(--scrollbar-track-color, var(--bg-color-secondary));
  border-radius: 7px;
}

.db-result__table-wrapper::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color, var(--border-color-light));
  border-radius: 7px;
  border: 3px solid transparent;
  background-clip: padding-box;
  min-height: 40px;
  min-width: 40px;
}

.db-result__table-wrapper::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color, var(--text-color-tertiary));
  background-clip: padding-box;
}

.db-result__table-wrapper::-webkit-scrollbar-thumb:active {
  background: var(--scrollbar-thumb-hover-color, var(--text-color-secondary));
  background-clip: padding-box;
}

.db-result__table-wrapper::-webkit-scrollbar-corner {
  background: var(--scrollbar-track-color, var(--bg-color-secondary));
}
</style>
