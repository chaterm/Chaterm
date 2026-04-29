<template>
  <div
    class="db-status-bar"
    :class="{ 'db-status-bar--error': hasError }"
  >
    <span v-if="hasError">
      <span class="db-status-bar__label">【{{ $t('database.statusResult') }}】</span>
      <span>{{ error }}</span>
    </span>
    <template v-else>
      <span class="db-status-bar__item">
        <span class="db-status-bar__label">【{{ $t('database.statusResult') }}】</span>
        <span>{{ $t('database.statusExecutionOk') }}</span>
      </span>
      <span class="db-status-bar__item">
        <span class="db-status-bar__label">【{{ $t('database.statusTime') }}】</span>
        <span>{{ durationMs ?? 0 }}ms</span>
      </span>
      <span class="db-status-bar__item">
        <span class="db-status-bar__label">【{{ $t('database.statusRows') }}】</span>
        <span>{{ rowCount ?? 0 }} row</span>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  error?: string | null
  durationMs?: number
  rowCount?: number
}>()

const hasError = computed(() => !!props.error)
</script>

<style lang="less" scoped>
.db-status-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 4px 12px;
  font-size: 12px;
  color: #ef4444;
  background: var(--bg-color-secondary);
  border-top: 1px solid var(--border-color);

  &--error {
    color: #ef4444;
  }

  &__label {
    color: var(--text-color-secondary, #8a94a6);
  }

  &__item {
    display: inline-flex;
    gap: 2px;
  }
}
</style>
