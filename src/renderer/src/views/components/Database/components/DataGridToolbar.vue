<template>
  <div class="db-toolbar">
    <div class="db-toolbar__group">
      <button
        class="db-toolbar__btn"
        :disabled="page <= 1"
        :title="$t('database.firstPage')"
        @click="safeEmitGoto(1, 'first')"
        >⏮</button
      >
      <button
        class="db-toolbar__btn"
        :disabled="page <= 1"
        :title="$t('database.prevPage')"
        @click="safeEmitGoto(page - 1, 'prev')"
        >⏴</button
      >
      <span class="db-toolbar__page">
        <a-input-number
          :value="page"
          :min="1"
          size="small"
          class="db-toolbar__page-input"
          @change="onPageInputChange"
        />
      </span>
      <button
        class="db-toolbar__btn"
        :title="$t('database.nextPage')"
        @click="safeEmitGoto(page + 1, 'next')"
        >⏵</button
      >
      <button
        class="db-toolbar__btn"
        :title="$t('database.lastPage')"
        :disabled="!total || total <= page * pageSize"
        @click="onGotoLast"
        >⏭</button
      >
      <a-select
        :value="pageSize"
        size="small"
        style="width: 90px; margin-left: 6px"
        @update:value="onPageSizeChange"
      >
        <a-select-option
          v-for="size in PAGE_SIZE_OPTIONS"
          :key="size"
          :value="size"
          >{{ size }}</a-select-option
        >
      </a-select>
      <span
        class="db-toolbar__total"
        :title="$t('database.totalTooltip')"
        @click="onRefreshTotal"
      >
        {{ $t('database.total') }}:
        <span
          v-if="total === null || total === undefined"
          class="db-toolbar__total-unknown"
          >?</span
        >
        <span v-else>{{ total }}</span>
      </span>
    </div>

    <div class="db-toolbar__group">
      <button
        v-if="!hideRefresh"
        class="db-toolbar__btn"
        :title="$t('database.refresh')"
        @click="onRefresh"
        >↻</button
      >
      <button
        class="db-toolbar__btn db-toolbar__btn--add-row"
        :disabled="!canEdit"
        :title="addRowTitle"
        @click="onAddRow"
        >+</button
      >
      <button
        class="db-toolbar__btn db-toolbar__btn--delete-row"
        :disabled="!canEdit || !hasSelection"
        :title="deleteRowTitle"
        @click="onDeleteRow"
        >-</button
      >
      <button
        class="db-toolbar__btn db-toolbar__btn--undo"
        :disabled="!canUndo"
        :title="undoTitle"
        @click="onUndo"
        >↶</button
      >
      <button
        class="db-toolbar__btn db-toolbar__btn--save"
        :disabled="!canEdit || !isDirty"
        :title="saveTitle"
        @click="onSave"
        >💾</button
      >
      <button
        class="db-toolbar__btn"
        disabled
        title="V1 placeholder"
        >📊</button
      >
      <button
        class="db-toolbar__btn"
        disabled
        title="V1 placeholder"
        >💬</button
      >
    </div>

    <div class="db-toolbar__spacer" />

    <div class="db-toolbar__group">
      <button
        class="db-toolbar__btn db-toolbar__btn--export"
        disabled
        >Export ▾</button
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const PAGE_SIZE_OPTIONS = [10, 50, 100, 500, 1000, 5000, 10000]

const props = withDefaults(
  defineProps<{
    page: number
    pageSize: number
    total: number | null | undefined
    // Edit capability flags. Defaults are "edit disabled" so existing
    // non-data tabs keep their previous behaviour without changes.
    canEdit?: boolean
    hasSelection?: boolean
    canUndo?: boolean
    isDirty?: boolean
    // Hide the refresh button. Used by the SQL result toolbar where
    // "refresh" has no semantic meaning (the rows are already in memory).
    hideRefresh?: boolean
  }>(),
  { canEdit: false, hasSelection: false, canUndo: false, isDirty: false, hideRefresh: false }
)

const emit = defineEmits<{
  (e: 'gotoPage', page: number): void
  (e: 'gotoLastPage'): void
  (e: 'changePageSize', size: number): void
  (e: 'refreshTotal'): void
  (e: 'refresh'): void
  (e: 'add-row'): void
  (e: 'delete-row'): void
  (e: 'undo'): void
  (e: 'save'): void
}>()

const { t } = useI18n()

// Button tooltips switch between the "action" label and the
// "why it's disabled" hint based on the capability flags.
const addRowTitle = computed(() => (props.canEdit ? t('database.addRow') : t('database.editDisabledSqlResult')))

const deleteRowTitle = computed(() => {
  if (!props.canEdit) return t('database.editDisabledSqlResult')
  if (!props.hasSelection) return t('database.deleteDisabledNoRow')
  return t('database.deleteRow')
})

const undoTitle = computed(() => (props.canUndo ? t('database.undo') : t('database.undoDisabledEmpty')))

const saveTitle = computed(() => {
  if (!props.canEdit) return t('database.editDisabledSqlResult')
  if (!props.isDirty) return t('database.saveDisabledClean')
  return t('database.saveChanges')
})

const safeEmitGoto = (target: number, reason: string) => {
  try {
    const safe = Number.isFinite(target) && target > 0 ? Math.floor(target) : 1
    // eslint-disable-next-line no-console
    console.log('[DB-DEBUG] toolbar gotoPage', { reason, rawTarget: target, safe, currentPage: props.page })
    emit('gotoPage', safe)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB-DEBUG] toolbar gotoPage threw', err)
  }
}

const onPageInputChange = (v: unknown) => {
  try {
    // eslint-disable-next-line no-console
    console.log('[DB-DEBUG] toolbar page-input change', { rawValue: v, rawType: typeof v })
    const num = typeof v === 'number' ? v : Number(v)
    const safe = Number.isFinite(num) && num > 0 ? Math.floor(num) : 1
    emit('gotoPage', safe)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB-DEBUG] toolbar page-input threw', err)
  }
}

const onGotoLast = () => {
  try {
    // eslint-disable-next-line no-console
    console.log('[DB-DEBUG] toolbar gotoLastPage click')
    emit('gotoLastPage')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB-DEBUG] toolbar gotoLastPage threw', err)
  }
}

const onPageSizeChange = (v: unknown) => {
  try {
    // eslint-disable-next-line no-console
    console.log('[DB-DEBUG] toolbar pageSize change', { rawValue: v, rawType: typeof v })
    const num = typeof v === 'number' ? v : Number(v)
    const safe = Number.isFinite(num) && num > 0 ? Math.floor(num) : 100
    emit('changePageSize', safe)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB-DEBUG] toolbar pageSize threw', err)
  }
}

const onRefreshTotal = () => {
  try {
    // eslint-disable-next-line no-console
    console.log('[DB-DEBUG] toolbar refreshTotal click')
    emit('refreshTotal')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB-DEBUG] toolbar refreshTotal threw', err)
  }
}

const onRefresh = () => {
  try {
    // eslint-disable-next-line no-console
    console.log('[DB-DEBUG] toolbar refresh click')
    emit('refresh')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB-DEBUG] toolbar refresh threw', err)
  }
}

const onAddRow = () => {
  emit('add-row')
}

const onDeleteRow = () => {
  emit('delete-row')
}

const onUndo = () => {
  emit('undo')
}

const onSave = () => {
  emit('save')
}
</script>

<style lang="less" scoped>
.db-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  font-size: 12px;
  color: var(--text-color);

  &__group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  &__spacer {
    flex: 1;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    font-size: 12px;
    color: var(--text-color);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--hover-bg-color);
    }

    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    &--export {
      padding: 0 10px;
    }

    &--save:not(:disabled) {
      color: #1890ff;
    }
  }

  &__page-input {
    width: 56px;
  }

  &__total {
    margin-left: 10px;
    cursor: pointer;
    color: var(--text-color-secondary, #8a94a6);

    &:hover {
      color: var(--text-color);
      text-decoration: underline;
    }
  }

  &__total-unknown {
    color: var(--text-color-secondary, #8a94a6);
  }
}
</style>
