<template>
  <div class="sql-toolbar">
    <button
      class="sql-toolbar__btn sql-toolbar__run"
      :disabled="!canRun"
      :title="$t('database.runAll')"
      @click="emit('run', 'all')"
    >
      <CaretRightOutlined />
    </button>
    <button
      class="sql-toolbar__btn sql-toolbar__run-current"
      :disabled="!canRun"
      :title="$t('database.runCurrentStatement')"
      @click="emit('run', 'currentStatement')"
    >
      <VerticalAlignBottomOutlined />
    </button>
    <button
      class="sql-toolbar__btn sql-toolbar__explain"
      :disabled="!canRun"
      :title="$t('database.explain')"
      @click="emit('run', 'explain')"
    >
      <BulbOutlined />
    </button>
    <span class="sql-toolbar__sep" />
    <button
      class="sql-toolbar__btn"
      disabled
      :title="$t('database.save')"
    >
      <SaveOutlined />
    </button>
    <button
      class="sql-toolbar__btn"
      disabled
      :title="$t('database.saveAs')"
    >
      <SaveOutlined style="opacity: 0.7" />
    </button>
    <button
      class="sql-toolbar__btn"
      disabled
      :title="$t('database.format')"
    >
      <AlignLeftOutlined />
    </button>
    <span class="sql-toolbar__spacer" />
    <ConnectionPicker
      :model-value="assetId"
      :tree="tree"
      :connection-statuses="connectionStatuses"
      @update:model-value="(v: string) => emit('update:assetId', v)"
    />
    <DatabasePicker
      :model-value="databaseName"
      :tree="tree"
      :asset-id="assetId"
      @update:model-value="(v: string) => emit('update:databaseName', v)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { AlignLeftOutlined, BulbOutlined, CaretRightOutlined, SaveOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons-vue'
import ConnectionPicker from './ConnectionPicker.vue'
import DatabasePicker from './DatabasePicker.vue'
import type { DatabaseTreeNode } from '../types'

const props = defineProps<{
  assetId?: string
  databaseName?: string
  tree: DatabaseTreeNode[]
  connectionStatuses: Record<string, 'idle' | 'testing' | 'connected' | 'failed'>
}>()

const emit = defineEmits<{
  (e: 'run', mode: 'all' | 'currentStatement' | 'explain'): void
  (e: 'update:assetId', v: string): void
  (e: 'update:databaseName', v: string): void
}>()

const canRun = computed(() => !!props.assetId && !!props.databaseName)
</script>

<style scoped lang="less">
.sql-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  height: 36px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-secondary);

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-color);

    &:hover:not(:disabled) {
      background: var(--hover-bg-color);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__run {
    color: #22c55e;
  }

  &__sep {
    width: 1px;
    height: 18px;
    background: var(--border-color);
    margin: 0 4px;
  }

  &__spacer {
    flex: 1;
  }
}
</style>
