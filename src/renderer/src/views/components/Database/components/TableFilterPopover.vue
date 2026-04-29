<template>
  <div
    ref="rootRef"
    class="db-filter-popover"
    :style="popoverStyle"
    @click.stop
  >
    <div class="db-filter-popover__search">
      <SearchOutlined class="db-filter-popover__search-icon" />
      <input
        ref="inputRef"
        v-model="searchText"
        type="text"
        class="db-filter-popover__search-input"
        :placeholder="$t('database.filterLocalSearch', { column })"
        @keydown.enter="apply"
        @keydown.esc="emit('close')"
      />
    </div>

    <div class="db-filter-popover__head">
      <label class="db-filter-popover__row db-filter-popover__row--all">
        <input
          type="checkbox"
          :checked="allChecked"
          :indeterminate.prop="someChecked && !allChecked"
          @change="toggleAll"
        />
        <span class="db-filter-popover__label">{{ $t('database.filterAll') }}</span>
        <button
          class="db-filter-popover__clear"
          @click="clear"
          >{{ $t('database.filterClear') }}</button
        >
      </label>
    </div>

    <div class="db-filter-popover__list">
      <div
        v-if="loading"
        class="db-filter-popover__status"
      >
        {{ $t('database.loading') }}
      </div>
      <template v-else>
        <div
          v-if="visibleValues.length === 0"
          class="db-filter-popover__status"
        >
          {{ $t('database.noResults') }}
        </div>
        <label
          v-for="entry in visibleValues"
          :key="entry.value"
          class="db-filter-popover__row"
        >
          <input
            type="checkbox"
            :checked="selected.has(entry.value)"
            @change="(e) => toggleValue(entry.value, (e.target as HTMLInputElement).checked)"
          />
          <span
            class="db-filter-popover__label"
            :title="entry.label"
            >{{ entry.label }}</span
          >
          <span class="db-filter-popover__count">({{ entry.count }})</span>
        </label>
      </template>
    </div>

    <div
      v-if="!loading && values.length > 0"
      class="db-filter-popover__footer"
    >
      <button
        class="db-filter-popover__btn"
        @click="emit('close')"
        >{{ $t('common.cancel') }}</button
      >
      <button
        class="db-filter-popover__btn db-filter-popover__btn--primary"
        @click="apply"
        >{{ $t('database.filterApply') }}</button
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { SearchOutlined } from '@ant-design/icons-vue'
import type { DbColumnFilter } from '../types'

/** Placeholder entry used for NULL values so they can be rendered distinctly. */
const NULL_MARKER = '__NULL__'

const props = defineProps<{
  column: string
  current: DbColumnFilter | null
  anchorLeft: number
  anchorTop: number
  /** Pre-fetched distinct values from the server. Pass [] + loading=true to show a spinner. */
  values: string[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'apply', filter: DbColumnFilter | null): void
  (e: 'close'): void
}>()

const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const searchText = ref('')
const selected = ref<Set<string>>(new Set())

/**
 * Seed the selection from the existing filter on the column. If it's an IN
 * filter we pre-check those values; otherwise start with nothing selected
 * (which is equivalent to "all" in this UI — applying an empty selection
 * clears the filter).
 */
const seedSelection = () => {
  selected.value = new Set()
  const c = props.current
  if (!c) return
  if (c.operator === 'in' && c.values) {
    for (const v of c.values) selected.value.add(v)
  } else if (c.operator === 'eq' && c.value != null) {
    selected.value.add(c.value)
  } else if (c.operator === 'isnull') {
    selected.value.add(NULL_MARKER)
  }
}

watch(() => props.current, seedSelection, { immediate: true })
watch(
  () => props.column,
  () => {
    searchText.value = ''
    seedSelection()
  }
)

/**
 * Group raw values into (label, value, count) entries. Empty string is shown
 * as <empty>; nulls are folded into a single NULL_MARKER row.
 */
const groupedValues = computed(() => {
  const map = new Map<string, { value: string; label: string; count: number }>()
  for (const raw of props.values) {
    const key = raw === '' ? '' : raw // empty string stays as ''
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
    } else {
      map.set(key, {
        value: key,
        label: raw === '' ? '<empty>' : raw,
        count: 1
      })
    }
  }
  return Array.from(map.values())
})

const visibleValues = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return groupedValues.value
  return groupedValues.value.filter((e) => e.label.toLowerCase().includes(q))
})

const allChecked = computed(() => visibleValues.value.length > 0 && visibleValues.value.every((e) => selected.value.has(e.value)))
const someChecked = computed(() => visibleValues.value.some((e) => selected.value.has(e.value)))

const toggleValue = (value: string, checked: boolean) => {
  const next = new Set(selected.value)
  if (checked) next.add(value)
  else next.delete(value)
  selected.value = next
}

const toggleAll = (ev: Event) => {
  const checked = (ev.target as HTMLInputElement).checked
  const next = new Set(selected.value)
  for (const e of visibleValues.value) {
    if (checked) next.add(e.value)
    else next.delete(e.value)
  }
  selected.value = next
}

const apply = () => {
  // No selection, or all selected => clear the filter (user wants everything).
  const total = groupedValues.value.length
  if (selected.value.size === 0 || selected.value.size === total) {
    emit('apply', null)
    emit('close')
    return
  }
  const valuesArr = Array.from(selected.value).filter((v) => v !== NULL_MARKER)
  // If exactly one value is selected, use eq for nicer SQL / pg performance.
  if (valuesArr.length === 1 && !selected.value.has(NULL_MARKER)) {
    emit('apply', { column: props.column, operator: 'eq', value: valuesArr[0] })
  } else if (valuesArr.length > 0) {
    emit('apply', { column: props.column, operator: 'in', values: valuesArr })
  } else {
    emit('apply', { column: props.column, operator: 'isnull' })
  }
  emit('close')
}

const clear = () => {
  selected.value = new Set()
  emit('apply', null)
  emit('close')
}

/**
 * Pin the popover to the viewport — the anchor button can be near a screen
 * edge and we don't want to clip. Width is fixed; height is capped.
 */
const popoverStyle = computed(() => {
  const w = 260
  const maxH = 360
  const left = Math.max(8, Math.min(props.anchorLeft, window.innerWidth - w - 8))
  const top = Math.max(8, Math.min(props.anchorTop, window.innerHeight - maxH - 8))
  return { left: `${left}px`, top: `${top}px`, width: `${w}px` }
})

const onDocMouseDown = (ev: MouseEvent) => {
  const root = rootRef.value
  if (!root) return
  if (!root.contains(ev.target as Node)) emit('close')
}

onMounted(async () => {
  await nextTick()
  inputRef.value?.focus()
  document.addEventListener('mousedown', onDocMouseDown, true)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocMouseDown, true)
})
</script>

<style lang="less" scoped>
.db-filter-popover {
  position: fixed;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  max-height: 360px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
  color: var(--text-color);
  overflow: hidden;
  font-size: 12px;

  &__search {
    position: relative;
    padding: 8px;
    border-bottom: 1px solid var(--border-color);
  }

  &__search-icon {
    position: absolute;
    top: 50%;
    left: 16px;
    transform: translateY(-50%);
    color: var(--text-color-secondary, #8a94a6);
    font-size: 12px;
    pointer-events: none;
  }

  &__search-input {
    width: 100%;
    height: 26px;
    padding: 0 8px 0 26px;
    font-size: 12px;
    color: var(--text-color);
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    outline: none;

    &::placeholder {
      color: var(--text-color-secondary, #8a94a6);
    }

    &:focus {
      border-color: #a78bfa;
    }
  }

  &__head {
    padding: 2px 8px;
    border-bottom: 1px solid var(--border-color);
  }

  &__list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
  }

  &__status {
    padding: 12px;
    text-align: center;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    cursor: pointer;
    user-select: none;

    &:hover {
      background: var(--hover-bg-color);
    }

    input[type='checkbox'] {
      width: 14px;
      height: 14px;
      accent-color: #a78bfa;
      cursor: pointer;
    }

    &--all {
      height: 28px;
      font-weight: 500;
    }
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__count {
    color: var(--text-color-secondary, #8a94a6);
  }

  &__clear {
    margin-left: auto;
    padding: 0;
    font-size: 12px;
    color: var(--text-color-secondary, #8a94a6);
    background: transparent;
    border: none;
    cursor: pointer;

    &:hover {
      color: var(--text-color);
      text-decoration: underline;
    }
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding: 6px 8px;
    border-top: 1px solid var(--border-color);
  }

  &__btn {
    height: 24px;
    padding: 0 10px;
    font-size: 12px;
    color: var(--text-color);
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: var(--hover-bg-color);
    }

    &--primary {
      color: #fff;
      background: #7c3aed;
      border-color: #7c3aed;

      &:hover {
        background: #8b5cf6;
        border-color: #8b5cf6;
      }
    }
  }
}
</style>
