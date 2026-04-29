<template>
  <a-modal
    :open="visible"
    :title="$t('database.newConnection')"
    :footer="null"
    :width="640"
    class="db-connection-modal"
    @cancel="handleCancel"
  >
    <div
      v-if="draft"
      class="db-connection-modal__body"
    >
      <div class="db-connection-modal__row">
        <label class="db-connection-modal__label">{{ $t('database.fields.name') }}</label>
        <a-input
          :value="draft.name"
          :status="errors.includes('name') ? 'error' : undefined"
          @update:value="(v: string) => update({ name: v })"
        />
      </div>
      <div class="db-connection-modal__row-grid">
        <div class="db-connection-modal__row">
          <label class="db-connection-modal__label">{{ $t('database.fields.env') }}</label>
          <a-input
            :value="draft.env"
            @update:value="(v: string) => update({ env: v })"
          />
        </div>
        <div class="db-connection-modal__row">
          <label class="db-connection-modal__label">{{ $t('database.fields.dbType') }}</label>
          <a-select
            :value="draft.dbType"
            style="width: 100%"
            @update:value="(v: 'MySQL' | 'PostgreSQL') => update({ dbType: v })"
          >
            <a-select-option value="MySQL">MySQL</a-select-option>
            <a-select-option value="PostgreSQL">PostgreSQL</a-select-option>
          </a-select>
        </div>
      </div>
      <div class="db-connection-modal__row-grid">
        <div class="db-connection-modal__row">
          <label class="db-connection-modal__label">{{ $t('database.fields.host') }}</label>
          <a-input
            :value="draft.host"
            :status="errors.includes('host') ? 'error' : undefined"
            @update:value="(v: string) => update({ host: v })"
          />
        </div>
        <div class="db-connection-modal__row">
          <label class="db-connection-modal__label">{{ $t('database.fields.port') }}</label>
          <a-input-number
            :value="draft.port"
            :min="1"
            :max="65535"
            style="width: 100%"
            :status="errors.includes('port') ? 'error' : undefined"
            @update:value="(v: number | null) => update({ port: Number(v ?? 0) })"
          />
        </div>
      </div>
      <div class="db-connection-modal__row">
        <label class="db-connection-modal__label">{{ $t('database.authentication') }}</label>
        <a-select
          :value="draft.authentication"
          style="width: 100%"
          @update:value="(v: 'UserAndPassword') => update({ authentication: v })"
        >
          <a-select-option value="UserAndPassword">{{ $t('database.authUserAndPassword') }}</a-select-option>
        </a-select>
      </div>
      <div class="db-connection-modal__row-grid">
        <div class="db-connection-modal__row">
          <label class="db-connection-modal__label">{{ $t('database.fields.user') }}</label>
          <a-input
            :value="draft.user"
            :status="errors.includes('user') ? 'error' : undefined"
            @update:value="(v: string) => update({ user: v })"
          />
        </div>
        <div class="db-connection-modal__row">
          <label class="db-connection-modal__label">{{ $t('database.fields.password') }}</label>
          <a-input-password
            :value="draft.password"
            @update:value="(v: string) => update({ password: v })"
          />
        </div>
      </div>
      <div class="db-connection-modal__row-grid">
        <div class="db-connection-modal__row">
          <label class="db-connection-modal__label">{{ $t('database.fields.database') }}</label>
          <a-input
            :value="draft.database"
            @update:value="(v: string) => update({ database: v })"
          />
        </div>
        <div class="db-connection-modal__row">
          <label class="db-connection-modal__label">{{ $t('database.fields.url') }}</label>
          <a-input
            :value="draft.url"
            @update:value="(v: string) => update({ url: v })"
          />
        </div>
      </div>

      <div class="db-connection-modal__section">
        <div class="db-connection-modal__section-title">{{ $t('database.driver') }}</div>
        <div class="db-connection-modal__section-placeholder">
          {{ $t('database.driverPlaceholder') }}
        </div>
      </div>
      <div class="db-connection-modal__section">
        <div class="db-connection-modal__section-title">{{ $t('database.sshConfiguration') }}</div>
        <div class="db-connection-modal__section-placeholder">
          {{ $t('database.sshConfigurationPlaceholder') }}
        </div>
      </div>
      <div class="db-connection-modal__section">
        <div class="db-connection-modal__section-title">{{ $t('database.advancedConfiguration') }}</div>
        <div class="db-connection-modal__section-placeholder">
          {{ $t('database.advancedConfigurationPlaceholder') }}
        </div>
      </div>

      <div
        v-if="feedback"
        class="db-connection-modal__feedback"
        :class="{ 'db-connection-modal__feedback--error': feedback.kind === 'error' }"
      >
        {{ feedback.message }}
      </div>

      <div class="db-connection-modal__actions">
        <a-button @click="handleTest">{{ $t('database.testConnection') }}</a-button>
        <div class="db-connection-modal__actions-right">
          <a-button @click="handleCancel">{{ $t('common.cancel') }}</a-button>
          <a-button
            type="primary"
            @click="handleSave"
            >{{ $t('common.save') }}</a-button
          >
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DatabaseConnectionDraft } from '../types'

const props = defineProps<{
  visible: boolean
  draft: DatabaseConnectionDraft | null
  lastTestResult?: { ok: boolean; message: string } | null
}>()

const emit = defineEmits<{
  (e: 'update', patch: Partial<DatabaseConnectionDraft>): void
  (e: 'cancel'): void
  (e: 'test'): void
  (e: 'save', draft: DatabaseConnectionDraft): void
}>()

const { t } = useI18n()
const errors = ref<string[]>([])
const feedback = ref<{ kind: 'info' | 'error'; message: string } | null>(null)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      errors.value = []
      feedback.value = null
    }
  }
)

watch(
  () => props.lastTestResult,
  (result) => {
    if (!result) return
    feedback.value = result.ok
      ? { kind: 'info', message: t('database.testConnectionPassed') + (result.message ? ` (${result.message})` : '') }
      : { kind: 'error', message: result.message || t('database.fixRequiredFields') }
  }
)

const validate = (): { valid: boolean; errors: string[] } => {
  const errs: string[] = []
  const draft = props.draft
  if (!draft) return { valid: false, errors: ['draft'] }
  if (!draft.name.trim()) errs.push('name')
  if (!draft.host.trim()) errs.push('host')
  if (!draft.port || draft.port <= 0) errs.push('port')
  if (!draft.user.trim()) errs.push('user')
  return { valid: errs.length === 0, errors: errs }
}

const update = (patch: Partial<DatabaseConnectionDraft>) => {
  emit('update', patch)
}

const handleCancel = () => {
  emit('cancel')
}

const handleTest = () => {
  const result = validate()
  errors.value = result.errors
  if (!result.valid) {
    feedback.value = { kind: 'error', message: t('database.fixRequiredFields') }
    return
  }
  feedback.value = { kind: 'info', message: t('database.testConnectionInFlight') }
  emit('test')
}

const handleSave = () => {
  const result = validate()
  errors.value = result.errors
  if (!result.valid || !props.draft) {
    feedback.value = { kind: 'error', message: t('database.fixRequiredFields') }
    return
  }
  emit('save', props.draft)
}
</script>

<style lang="less" scoped>
.db-connection-modal {
  &__body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__row-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  &__label {
    font-size: 12px;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__section {
    padding: 10px 12px;
    border: 1px dashed var(--border-color);
    border-radius: 4px;
  }

  &__section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 4px;
  }

  &__section-placeholder {
    font-size: 12px;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__feedback {
    font-size: 12px;
    color: var(--text-color);

    &--error {
      color: #ef4444;
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
  }

  &__actions-right {
    display: flex;
    gap: 8px;
  }
}
</style>
