<template>
  <div class="db-where-order">
    <div class="db-where-order__header">
      <button
        class="db-where-order__tab"
        :class="{ 'db-where-order__tab--active': whereOpen }"
        @click="whereOpen = !whereOpen"
        >▽ WHERE</button
      >
      <button
        class="db-where-order__tab"
        :class="{ 'db-where-order__tab--active': orderOpen }"
        @click="orderOpen = !orderOpen"
        >⇅ ORDER BY</button
      >
    </div>
    <div
      v-if="whereOpen"
      class="db-where-order__body"
    >
      <a-input
        :value="whereDraft"
        :placeholder="$t('database.wherePlaceholder')"
        size="small"
        @update:value="(v: string) => (whereDraft = v)"
        @press-enter="applyWhere"
      />
      <a-button
        size="small"
        type="primary"
        style="margin-left: 6px"
        @click="applyWhere"
        >{{ $t('database.filterApply') }}</a-button
      >
    </div>
    <div
      v-if="orderOpen"
      class="db-where-order__body"
    >
      <a-input
        :value="orderDraft"
        :placeholder="$t('database.orderByPlaceholder')"
        size="small"
        @update:value="(v: string) => (orderDraft = v)"
        @press-enter="applyOrder"
      />
      <a-button
        size="small"
        type="primary"
        style="margin-left: 6px"
        @click="applyOrder"
        >{{ $t('database.filterApply') }}</a-button
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  whereRaw: string | null | undefined
  orderByRaw: string | null | undefined
}>()

const emit = defineEmits<{
  (e: 'applyWhere', raw: string | null): void
  (e: 'applyOrderBy', raw: string | null): void
}>()

const whereOpen = ref(false)
const orderOpen = ref(false)
const whereDraft = ref(props.whereRaw ?? '')
const orderDraft = ref(props.orderByRaw ?? '')

watch(
  () => props.whereRaw,
  (v) => (whereDraft.value = v ?? '')
)
watch(
  () => props.orderByRaw,
  (v) => (orderDraft.value = v ?? '')
)

const applyWhere = () => {
  const v = whereDraft.value.trim()
  emit('applyWhere', v.length > 0 ? v : null)
}

const applyOrder = () => {
  const v = orderDraft.value.trim()
  emit('applyOrderBy', v.length > 0 ? v : null)
}
</script>

<style lang="less" scoped>
.db-where-order {
  display: flex;
  flex-direction: column;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color);

  &__header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    font-size: 11px;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__tab {
    padding: 2px 10px;
    font-size: 11px;
    color: var(--text-color-secondary, #8a94a6);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;

    &:hover {
      background: var(--hover-bg-color);
      color: var(--text-color);
    }

    &--active {
      color: #a78bfa;
    }
  }

  &__body {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border-top: 1px solid var(--border-color);
  }
}
</style>
