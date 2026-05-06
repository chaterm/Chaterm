<template>
  <div class="db-editor">
    <div class="db-editor__toolbar">
      <button
        class="db-editor__action"
        :title="$t('database.run')"
        @click="emit('run')"
      >
        <PlayCircleOutlined />
        <span>{{ $t('database.run') }}</span>
      </button>
      <button
        class="db-editor__action"
        :title="$t('database.stop')"
        disabled
      >
        <PauseCircleOutlined />
        <span>{{ $t('database.stop') }}</span>
      </button>
      <button
        class="db-editor__action"
        :title="$t('database.format')"
        disabled
      >
        <AlignLeftOutlined />
        <span>{{ $t('database.format') }}</span>
      </button>
      <div class="db-editor__spacer" />
      <button
        class="db-editor__action"
        :title="$t('database.settings')"
        disabled
      >
        <SettingOutlined />
      </button>
    </div>
    <textarea
      class="db-editor__textarea"
      :value="modelValue"
      spellcheck="false"
      @input="handleInput"
    />
  </div>
</template>

<script setup lang="ts">
import { AlignLeftOutlined, PauseCircleOutlined, PlayCircleOutlined, SettingOutlined } from '@ant-design/icons-vue'

defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'run'): void
}>()

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}
</script>

<style lang="less" scoped>
.db-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
  color: var(--text-color);
  border-bottom: 1px solid var(--border-color);

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-color-secondary);
  }

  &__action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
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
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__spacer {
    flex: 1;
  }

  &__textarea {
    flex: 1;
    width: 100%;
    padding: 12px 14px;
    margin: 0;
    font-family: 'JetBrains Mono', Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-color);
    background: var(--bg-color);
    border: none;
    outline: none;
    resize: none;
  }
}
</style>
