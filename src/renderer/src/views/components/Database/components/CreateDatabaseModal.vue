<template>
  <a-modal
    :open="open"
    :title="t('database.createDatabaseModal.title')"
    :ok-text="t('database.createDatabaseModal.submit')"
    :cancel-text="t('database.createDatabaseModal.cancel')"
    :ok-button-props="{ disabled: !canSubmit || submitting, loading: submitting }"
    :confirm-loading="submitting"
    @update:open="onUpdateOpen"
    @ok="handleSubmit"
    @cancel="() => emit('update:open', false)"
  >
    <div class="create-db-modal">
      <div class="create-db-modal__row">
        <label class="create-db-modal__label">{{ t('database.createDatabaseModal.nameLabel') }}:</label>
        <a-input
          :value="name"
          class="create-db-modal__name-input"
          @update:value="onNameChange"
        />
      </div>
      <div class="create-db-modal__preview-header">
        {{ t('database.createDatabaseModal.previewLabel') }}
      </div>
      <div class="create-db-modal__editor">
        <SqlMonacoEditor
          :model-value="sql"
          @update:model-value="onSqlChange"
        />
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import SqlMonacoEditor from './SqlMonacoEditor.vue'
import { useDatabaseWorkspaceStore, quoteIdent } from '@/store/databaseWorkspaceStore'

const props = defineProps<{
  open: boolean
  connectionId: string
  dbType: 'mysql' | 'postgresql'
  connectionName?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'created'): void
}>()

const { t } = useI18n()
const store = useDatabaseWorkspaceStore()

// Name input value — bound one-way to the a-input stub via update:value.
const name = ref('')
// SQL text shown in the editor. Starts empty so the editor is blank until
// the user types a Name (which renders the default template).
const sql = ref('')
// True once the user has modified the SQL in the editor. After that, Name
// changes must never overwrite the user's edits.
const userEditedSql = ref(false)
// Last SQL string we auto-applied from renderTemplate. Used to distinguish
// template-driven updates from genuine user edits when the editor emits
// update:modelValue with a value that differs from our template.
const lastAppliedTemplate = ref('')
const submitting = ref(false)

// Identifier-style validation: leading letter/underscore, then alnum/underscore.
// Kept intentionally strict to avoid accidental SQL injection in the template.
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

const canSubmit = computed(() => NAME_PATTERN.test(name.value.trim()) && sql.value.trim().length > 0)

const renderTemplate = (n: string): string => {
  if (!n) return ''
  return `CREATE DATABASE ${quoteIdent(n, props.dbType)};`
}

const onNameChange = (v: string): void => {
  name.value = v
  if (userEditedSql.value) return
  const next = renderTemplate(v.trim())
  lastAppliedTemplate.value = next
  sql.value = next
}

const onSqlChange = (v: string): void => {
  // If the incoming value differs from the last template we applied, it
  // must have been produced by the user editing the editor directly.
  if (v !== lastAppliedTemplate.value) {
    userEditedSql.value = true
  }
  sql.value = v
}

// Reset local state every time the modal is (re)opened so the next open is
// clean regardless of how the previous session ended.
watch(
  () => props.open,
  (opened) => {
    if (!opened) return
    name.value = ''
    sql.value = ''
    userEditedSql.value = false
    lastAppliedTemplate.value = ''
    submitting.value = false
  }
)

const onUpdateOpen = (v: boolean): void => {
  emit('update:open', v)
}

const handleSubmit = async (): Promise<void> => {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  try {
    const res = await store.createDatabase(props.connectionId, sql.value)
    if (res?.ok) {
      message.success(t('database.createDatabaseModal.createdSuccess'))
      emit('created')
      emit('update:open', false)
    } else {
      const err = res?.errorMessage ?? ''
      message.error(`${t('database.createDatabaseModal.executeFailed')}: ${err}`)
    }
  } finally {
    submitting.value = false
  }
}

// Exposed for tests + external interrogation. Runtime parent components do
// not rely on this surface.
defineExpose({ name, sql, canSubmit, userEditedSql })
</script>

<style lang="less" scoped>
.create-db-modal {
  &__row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  &__label {
    min-width: 60px;
    color: var(--text-color);
    font-size: 13px;
  }

  &__name-input {
    flex: 1;
  }

  &__preview-header {
    color: var(--text-color-secondary);
    font-size: 12px;
    padding: 4px 0;
    border-top: 1px solid var(--border-color);
    margin-bottom: 6px;
  }

  &__editor {
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
    height: 220px;
  }
}
</style>
