<template>
  <Teleport to="body">
    <Transition name="db-conn-fade">
      <div
        v-if="visible && draft && schema"
        class="db-conn-overlay"
        @click.self="handleOverlayClick"
      >
        <div
          class="db-conn-panel"
          role="dialog"
          aria-modal="true"
        >
          <button
            class="db-conn-panel__close"
            type="button"
            :aria-label="$t('common.cancel')"
            @click="handleCancel"
            >×</button
          >

          <header class="db-conn-panel__header">
            <img
              v-if="typeOption"
              class="db-conn-panel__header-icon"
              :src="typeOption.iconUrl"
              :alt="typeOption.name"
              width="40"
              height="40"
            />
            <div class="db-conn-panel__header-title">{{ typeOption?.name ?? draft.dbType }}</div>
          </header>

          <div class="db-conn-panel__body">
            <div class="db-conn-row">
              <label
                class="db-conn-row__label"
                :for="fieldId('name')"
                >{{ $t('database.fields.name') }}</label
              >
              <input
                :id="fieldId('name')"
                class="db-conn-input"
                :class="{ 'db-conn-input--error': errors.includes('name') }"
                type="text"
                :value="draft.name"
                @input="onInput('name', $event)"
              />
            </div>

            <div class="db-conn-row">
              <label class="db-conn-row__label">{{ $t('database.fields.env') }}</label>
              <select
                class="db-conn-input"
                :value="draft.env"
                @change="onSelect('env', $event)"
              >
                <option value="Development">Development</option>
                <option value="TEST">TEST</option>
                <option value="Staging">Staging</option>
                <option value="Production">Production</option>
              </select>
            </div>

            <div class="db-conn-row">
              <label class="db-conn-row__label">{{ $t('database.group') }}</label>
              <select
                class="db-conn-input"
                :value="draft.groupId ?? ''"
                @change="onSelect('groupId', $event)"
              >
                <option
                  v-for="group in groups ?? []"
                  :key="group.id"
                  :value="group.id"
                  >{{ group.name }}</option
                >
              </select>
            </div>

            <div class="db-conn-row">
              <label
                class="db-conn-row__label"
                :for="fieldId('host')"
                >{{ $t('database.fields.host') }}</label
              >
              <div class="db-conn-host-port">
                <input
                  :id="fieldId('host')"
                  class="db-conn-input db-conn-host-port__host"
                  :class="{ 'db-conn-input--error': errors.includes('host') }"
                  type="text"
                  :value="draft.host"
                  @input="onInput('host', $event)"
                />
                <label
                  class="db-conn-host-port__port-label"
                  :for="fieldId('port')"
                  >{{ $t('database.fields.port') }}</label
                >
                <input
                  :id="fieldId('port')"
                  class="db-conn-input db-conn-host-port__port"
                  :class="{ 'db-conn-input--error': errors.includes('port') }"
                  type="number"
                  min="1"
                  max="65535"
                  :value="draft.port"
                  @input="onNumberInput('port', $event)"
                />
              </div>
            </div>

            <div class="db-conn-row">
              <label class="db-conn-row__label">{{ $t('database.authentication') }}</label>
              <select
                class="db-conn-input"
                :value="draft.authentication"
                @change="onSelect('authentication', $event)"
              >
                <option value="UserAndPassword">{{ $t('database.authUserAndPassword') }}</option>
              </select>
            </div>

            <div class="db-conn-row">
              <label
                class="db-conn-row__label"
                :for="fieldId('user')"
                >{{ $t('database.fields.user') }}</label
              >
              <input
                :id="fieldId('user')"
                class="db-conn-input"
                :class="{ 'db-conn-input--error': errors.includes('user') }"
                type="text"
                :value="draft.user"
                @input="onInput('user', $event)"
              />
            </div>

            <div class="db-conn-row">
              <label
                class="db-conn-row__label"
                :for="fieldId('password')"
                >{{ $t('database.fields.password') }}</label
              >
              <div class="db-conn-password">
                <input
                  :id="fieldId('password')"
                  class="db-conn-input db-conn-password__input"
                  :type="passwordVisible ? 'text' : 'password'"
                  :value="draft.password"
                  autocomplete="new-password"
                  @input="onInput('password', $event)"
                />
                <button
                  type="button"
                  class="db-conn-password__toggle"
                  :aria-label="passwordVisible ? 'hide' : 'show'"
                  @click="passwordVisible = !passwordVisible"
                  >{{ passwordVisible ? '⊘' : '◉' }}</button
                >
              </div>
            </div>

            <div class="db-conn-row">
              <label
                class="db-conn-row__label"
                :for="fieldId('database')"
                >{{ $t('database.fields.database') }}</label
              >
              <input
                :id="fieldId('database')"
                class="db-conn-input"
                type="text"
                :value="draft.database"
                @input="onInput('database', $event)"
              />
            </div>

            <div
              v-if="hasSslMode"
              class="db-conn-row"
            >
              <label class="db-conn-row__label">{{ $t('database.fields.sslMode') }}</label>
              <select
                class="db-conn-input"
                :value="draft.sslMode ?? ''"
                @change="onSelect('sslMode', $event)"
              >
                <option value="">—</option>
                <option
                  v-for="opt in sslModeOptions"
                  :key="opt.value"
                  :value="opt.value"
                  >{{ opt.label }}</option
                >
              </select>
            </div>

            <div class="db-conn-row">
              <label
                class="db-conn-row__label"
                :for="fieldId('url')"
                >{{ $t('database.fields.url') }}</label
              >
              <input
                :id="fieldId('url')"
                class="db-conn-input"
                type="text"
                :value="urlDisplay"
                @input="onUrlInput($event)"
              />
            </div>

            <section class="db-conn-section">
              <button
                type="button"
                class="db-conn-section__header"
                :aria-expanded="driverOpen"
                @click="driverOpen = !driverOpen"
              >
                <span class="db-conn-section__caret">{{ driverOpen ? '▾' : '▸' }}</span>
                {{ $t('database.driver') }}
              </button>
              <div
                v-if="driverOpen"
                class="db-conn-section__body"
              >
                <div class="db-conn-row">
                  <label class="db-conn-row__label">{{ $t('database.driver') }}</label>
                  <input
                    class="db-conn-input"
                    type="text"
                    :value="driverStub.jar"
                    disabled
                  />
                </div>
                <div class="db-conn-row">
                  <label class="db-conn-row__label">{{ $t('database.driverClass') }}</label>
                  <input
                    class="db-conn-input"
                    type="text"
                    :value="driverStub.className"
                    disabled
                  />
                </div>
                <div class="db-conn-section__actions">
                  <button
                    type="button"
                    class="db-conn-btn"
                    disabled
                    >{{ $t('database.uploadDriver') }}</button
                  >
                </div>
              </div>
            </section>

            <section class="db-conn-section">
              <button
                type="button"
                class="db-conn-section__header"
                :aria-expanded="sshOpen"
                @click="sshOpen = !sshOpen"
              >
                <span class="db-conn-section__caret">{{ sshOpen ? '▾' : '▸' }}</span>
                {{ $t('database.sshConfiguration') }}
              </button>
              <div
                v-if="sshOpen"
                class="db-conn-section__body db-conn-section__placeholder"
                >{{ $t('database.sshConfigurationPlaceholder') }}</div
              >
            </section>

            <section class="db-conn-section">
              <button
                type="button"
                class="db-conn-section__header"
                :aria-expanded="advancedOpen"
                @click="advancedOpen = !advancedOpen"
              >
                <span class="db-conn-section__caret">{{ advancedOpen ? '▾' : '▸' }}</span>
                {{ $t('database.advancedConfiguration') }}
              </button>
              <div
                v-if="advancedOpen"
                class="db-conn-section__body db-conn-section__placeholder"
                >{{ $t('database.advancedConfigurationPlaceholder') }}</div
              >
            </section>

            <div
              v-if="feedback"
              class="db-conn-feedback"
              :class="{ 'db-conn-feedback--error': feedback.kind === 'error' }"
              >{{ feedback.message }}</div
            >
          </div>

          <footer class="db-conn-panel__footer">
            <button
              type="button"
              class="db-conn-btn"
              @click="handleTest"
              >{{ $t('database.testConnection') }}</button
            >
            <div class="db-conn-panel__footer-right">
              <button
                type="button"
                class="db-conn-btn"
                @click="handleCancel"
                >{{ $t('common.cancel') }}</button
              >
              <button
                type="button"
                class="db-conn-btn db-conn-btn--primary"
                @click="handleSave"
                >{{ $t('common.save') }}</button
              >
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DatabaseConnectionDraft } from '../types'
import { getConnectionSchema } from '../connectionSchemas'
import { getDatabaseTypeOption } from '../constants/databaseTypes'

const props = defineProps<{
  visible: boolean
  draft: DatabaseConnectionDraft | null
  groups?: Array<{ id: string; name: string }>
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
const urlDirty = ref(false)
const passwordVisible = ref(false)
const driverOpen = ref(false)
const sshOpen = ref(false)
const advancedOpen = ref(false)

const schema = computed(() => (props.draft ? getConnectionSchema(props.draft.dbType) : null))
const typeOption = computed(() => (props.draft ? getDatabaseTypeOption(props.draft.dbType) : undefined))
const hasSslMode = computed(() => !!schema.value?.fields.some((f) => f.key === 'sslMode'))
const sslModeOptions = computed(() => schema.value?.fields.find((f) => f.key === 'sslMode')?.options ?? [])

const autoUrl = computed(() => {
  const d = props.draft
  if (!d) return ''
  const scheme = d.dbType === 'PostgreSQL' ? 'jdbc:postgresql' : 'jdbc:mysql'
  const host = d.host || ''
  const port = d.port ? String(d.port) : ''
  const db = d.database ? `/${d.database}` : ''
  return `${scheme}://${host}${port ? `:${port}` : ''}${db}`
})

const urlDisplay = computed(() => (urlDirty.value && props.draft?.url ? props.draft.url : autoUrl.value))

const driverStub = computed(() => {
  if (props.draft?.dbType === 'PostgreSQL') {
    return { jar: 'postgresql-42.7.3.jar', className: 'org.postgresql.Driver' }
  }
  return { jar: 'mysql-connector-java-8.0.30.jar', className: 'com.mysql.cj.jdbc.Driver' }
})

const fieldId = (key: string): string => `db-conn-${key}-${props.draft?.id ?? 'new'}`

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      errors.value = []
      feedback.value = null
      urlDirty.value = false
      passwordVisible.value = false
      driverOpen.value = false
      sshOpen.value = false
      advancedOpen.value = false
    }
  }
)

watch(
  () => props.draft?.id,
  () => {
    urlDirty.value = !!(props.draft?.url && props.draft.url !== autoUrl.value)
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
  const s = schema.value
  if (!draft || !s) return { valid: false, errors: ['draft'] }
  for (const field of s.fields) {
    if (!field.required) continue
    const raw = draft[field.key]
    if (field.kind === 'number') {
      const n = Number(raw ?? 0)
      if (!n || n <= 0) errs.push(field.key)
    } else {
      const str = typeof raw === 'string' ? raw : ''
      if (!str.trim()) errs.push(field.key)
    }
  }
  return { valid: errs.length === 0, errors: errs }
}

const update = (patch: Partial<DatabaseConnectionDraft>) => {
  emit('update', patch)
}

const onInput = (key: keyof DatabaseConnectionDraft, e: Event) => {
  const value = (e.target as HTMLInputElement).value
  update({ [key]: value } as Partial<DatabaseConnectionDraft>)
}

const onNumberInput = (key: keyof DatabaseConnectionDraft, e: Event) => {
  const value = Number((e.target as HTMLInputElement).value)
  update({ [key]: value } as Partial<DatabaseConnectionDraft>)
}

const onSelect = (key: keyof DatabaseConnectionDraft, e: Event) => {
  const value = (e.target as HTMLSelectElement).value
  update({ [key]: value } as Partial<DatabaseConnectionDraft>)
}

const onUrlInput = (e: Event) => {
  const value = (e.target as HTMLInputElement).value
  urlDirty.value = true
  update({ url: value })
}

const handleOverlayClick = () => {
  emit('cancel')
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

<style lang="less">
// Intentionally NOT scoped: the panel is teleported to <body>, which can
// make Vue's scoped attribute selectors unreliable. All class names are
// prefixed `.db-conn-*` so the rules don't leak into the wider app.
@label-width: 120px;
@row-gap: 12px;

.db-conn-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.db-conn-panel {
  position: relative;
  width: min(780px, calc(100vw - 48px));
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  background: var(--bg-color-secondary, #1e1e1e);
  color: var(--text-color, #e0e0e0);
  border: 1px solid var(--border-color-light, #464647);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  // Whole panel scrolls as one; header/footer flow with content.
  overflow-y: auto;
  overflow-x: hidden;

  // Visible scrollbar tinted with the project's scrollbar CSS variables.
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb-color, #555) transparent;

  &::-webkit-scrollbar {
    width: 10px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb-color, #555);
    border: 2px solid transparent;
    border-radius: 6px;
    background-clip: padding-box;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover-color, #666);
    background-clip: padding-box;
    border: 2px solid transparent;
  }

  &__close {
    // Sticky so it stays visible as the user scrolls the whole panel.
    position: sticky;
    top: 0;
    align-self: flex-end;
    margin: 8px 10px -36px 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-color-secondary, #cbd5e1);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    border-radius: 4px;
    z-index: 2;

    &:hover {
      background: var(--hover-bg-color, rgba(255, 255, 255, 0.1));
      color: var(--text-color, #e0e0e0);
    }
  }

  &__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 24px 12px;
  }

  &__header-icon {
    display: inline-block;
    flex-shrink: 0;
  }

  &__header-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-color, #e0e0e0);
  }

  &__body {
    padding: 8px 24px 16px;
    display: flex;
    flex-direction: column;
    gap: @row-gap;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px 16px;
  }

  &__footer-right {
    display: flex;
    gap: 8px;
  }
}

.db-conn-row {
  display: flex;
  align-items: center;
  gap: 12px;

  &__label {
    flex: 0 0 @label-width;
    font-size: 13px;
    color: var(--text-color, #e0e0e0);
  }
}

.db-conn-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 4px 10px;
  background: var(--bg-color, #141414);
  color: var(--text-color, #e0e0e0);
  border: 1px solid var(--border-color-light, #464647);
  border-radius: 4px;
  font: inherit;
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &::placeholder {
    color: var(--text-color-tertiary, #666);
  }

  &:hover:not(:disabled) {
    border-color: #1890ff;
  }

  &:focus {
    border-color: #1890ff;
    box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.18);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--error {
    border-color: #ef4444;

    &:hover:not(:disabled),
    &:focus {
      border-color: #ef4444;
      box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.22);
    }
  }
}

// Native <select> styling: override OS appearance and draw our own caret.
select.db-conn-input {
  appearance: none;
  -webkit-appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--text-color-secondary, #cbd5e1) 50%),
    linear-gradient(135deg, var(--text-color-secondary, #cbd5e1) 50%, transparent 50%);
  background-position:
    calc(100% - 14px) 14px,
    calc(100% - 9px) 14px;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 28px;
}

.db-conn-host-port {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;

  &__host {
    flex: 1;
    min-width: 0;
  }

  &__port-label {
    font-size: 13px;
    color: var(--text-color, #e0e0e0);
    padding-left: 4px;
  }

  &__port {
    flex: 0 0 120px;
  }
}

.db-conn-password {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  position: relative;

  &__input {
    flex: 1;
    padding-right: 34px;
  }

  &__toggle {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 26px;
    height: 26px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-color-secondary, #cbd5e1);
    cursor: pointer;
    border-radius: 4px;
    font-size: 14px;

    &:hover {
      background: var(--hover-bg-color, rgba(255, 255, 255, 0.1));
    }
  }
}

.db-conn-section {
  border: 1px solid var(--border-color, #1d1d1d);
  border-radius: 6px;
  background: var(--bg-color, #141414);
  overflow: hidden;

  &__header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: transparent;
    border: none;
    color: var(--text-color, #e0e0e0);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    text-align: left;

    &:hover {
      background: var(--hover-bg-color, rgba(255, 255, 255, 0.08));
    }
  }

  &__caret {
    font-size: 11px;
    color: var(--text-color-secondary, #cbd5e1);
    width: 12px;
    display: inline-block;
  }

  &__body {
    padding: 12px 14px;
    border-top: 1px solid var(--border-color, #1d1d1d);
    display: flex;
    flex-direction: column;
    gap: @row-gap;
  }

  &__placeholder {
    color: var(--text-color-secondary, #8a94a6);
    font-size: 12px;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
  }
}

.db-conn-feedback {
  font-size: 12px;
  color: var(--text-color, #e0e0e0);

  &--error {
    color: #ef4444;
  }
}

.db-conn-btn {
  height: 32px;
  padding: 0 14px;
  background: var(--bg-color, #141414);
  color: var(--text-color, #e0e0e0);
  border: 1px solid var(--border-color-light, #464647);
  border-radius: 4px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background-color 0.15s ease;

  &:hover:not(:disabled) {
    border-color: #1890ff;
    color: #1890ff;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--primary {
    background: #1890ff;
    border-color: #1890ff;
    color: #fff;

    &:hover:not(:disabled) {
      background: #40a9ff;
      border-color: #40a9ff;
      color: #fff;
    }
  }
}

// Transition: fade + slight zoom.
.db-conn-fade-enter-active,
.db-conn-fade-leave-active {
  transition: opacity 0.18s ease;

  .db-conn-panel {
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }
}

.db-conn-fade-enter-from,
.db-conn-fade-leave-to {
  opacity: 0;

  .db-conn-panel {
    opacity: 0;
    transform: scale(0.97);
  }
}
</style>
