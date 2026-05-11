<template>
  <div class="db-filter-bar">
    <span class="db-filter-bar__table-name">
      <span class="db-filter-bar__table-icon">&#9707;</span>
      {{ tableName }}
    </span>
    <span class="db-filter-bar__divider" />
    <input
      v-model="draft"
      class="db-filter-bar__input"
      :placeholder="$t('database.sqlFilterPlaceholder')"
      @keydown.enter="apply"
    />
    <button
      class="db-filter-bar__run-btn"
      :title="$t('database.filterApply')"
      @click="apply"
      >&#9658;</button
    >
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  tableName?: string | null | undefined
  whereRaw: string | null | undefined
  orderByRaw?: string | null | undefined
}>()

const emit = defineEmits<{
  (e: 'applyWhere', raw: string | null): void
  (e: 'applyOrderBy', raw: string | null): void
}>()

const draft = ref(props.whereRaw ?? '')

watch(
  () => props.whereRaw,
  (v) => (draft.value = v ?? '')
)

const apply = () => {
  const v = draft.value.trim()
  emit('applyWhere', v.length > 0 ? v : null)
}
</script>

<style lang="less" scoped>
.db-filter-bar {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 8px;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color);
  gap: 6px;

  &__table-icon {
    font-size: 12px;
    margin-right: 4px;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__table-name {
    display: flex;
    align-items: center;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-color);
    flex-shrink: 0;
  }

  &__divider {
    width: 1px;
    height: 16px;
    background: var(--border-color);
    flex-shrink: 0;
  }

  &__input {
    flex: 1;
    height: 22px;
    padding: 0 8px;
    font-size: 12px;
    font-style: italic;
    color: var(--text-color-secondary, #8a94a6);
    background: transparent;
    border: none;
    outline: none;

    &::placeholder {
      color: var(--text-color-secondary, #8a94a6);
      font-style: italic;
    }
  }

  &__run-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    font-size: 11px;
    color: var(--text-color-secondary, #8a94a6);
    background: transparent;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;

    &:hover {
      background: var(--hover-bg-color);
      color: var(--text-color);
    }
  }
}
</style>
