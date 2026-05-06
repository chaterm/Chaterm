<template>
  <a-modal
    :open="open"
    :title="title"
    :footer="null"
    :width="780"
    @update:open="(v) => emit('update:open', v)"
    @cancel="() => emit('update:open', false)"
  >
    <div class="ddl-viewer-modal">
      <div class="ddl-viewer-modal__toolbar">
        <a-button
          size="small"
          :disabled="!ddl"
          @click="handleCopy"
        >
          {{ t('database.ddlViewerModal.copy') }}
        </a-button>
      </div>
      <div class="ddl-viewer-modal__editor">
        <SqlMonacoEditor
          :model-value="ddl"
          :readonly="true"
        />
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import SqlMonacoEditor from './SqlMonacoEditor.vue'

const props = defineProps<{
  open: boolean
  tableName: string
  ddl: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const { t } = useI18n()

const title = computed(() => t('database.ddlViewerModal.title', { table: props.tableName || '' }))

const handleCopy = async (): Promise<void> => {
  if (!props.ddl) return
  try {
    await navigator.clipboard.writeText(props.ddl)
    message.success(t('database.tableMenu.ddlCopied'))
  } catch {
    message.error(t('database.ddlViewerModal.copyFailed'))
  }
}
</script>

<style lang="less" scoped>
.ddl-viewer-modal {
  &__toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
  }

  &__editor {
    height: 420px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    border-radius: 4px;
    overflow: hidden;
  }
}
</style>
