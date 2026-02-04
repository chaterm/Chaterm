<template>
  <div
    v-if="visible"
    class="command-interaction-input"
  >
    <!-- Header: Icon + Hint + Tertiary Actions -->
    <div class="interaction-header">
      <div class="header-main">
        <span class="interaction-hint">{{ promptHint }}</span>
      </div>

      <div class="interaction-actions">
        <!-- Exit/Cancel Button - dynamic based on exitKey -->
        <a-tooltip :title="exitButtonTooltip">
          <a-button
            v-if="!isSuppressed"
            size="small"
            danger
            class="header-cancel-btn"
            @click="handleExit"
          >
            <span class="ctrl-c-text">{{ exitButtonLabel }}</span>
          </a-button>
        </a-tooltip>

        <!-- Dismiss / Suppress actions (Tertiary) -->
        <a-dropdown :trigger="['click']">
          <a-button
            type="text"
            size="small"
            class="more-btn"
          >
            <EllipsisOutlined />
          </a-button>
          <template #overlay>
            <a-menu>
              <a-menu-item
                v-if="!isSuppressed"
                key="dismiss"
                @click="handleDismiss"
              >
                {{ t('interaction.dismiss') }}
              </a-menu-item>
              <a-menu-item
                v-if="!isSuppressed"
                key="suppress"
                @click="handleSuppress"
              >
                {{ t('interaction.suppress') }}
              </a-menu-item>
              <a-menu-item
                v-if="isSuppressed"
                key="restore"
                @click="handleUnsuppress"
              >
                {{ t('interaction.restore') }}
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>

    <!-- Suppressed state -->
    <div
      v-if="isSuppressed"
      class="suppressed-notice"
    >
      <span class="suppressed-text">{{ t('interaction.suppressed') }}</span>
      <a-button
        size="small"
        type="primary"
        ghost
        @click="handleUnsuppress"
      >
        {{ t('interaction.unsuppress') }}
      </a-button>
    </div>

    <!-- Main Interaction Body -->
    <div
      v-else
      class="interaction-body"
    >
      <!-- Password type -->
      <div
        v-if="interactionType === 'password'"
        class="input-group"
      >
        <a-input-password
          ref="passwordInputRef"
          v-model:value="inputValue"
          size="small"
          :placeholder="t('interaction.inputPlaceholder')"
          class="interaction-input"
          @press-enter="handleSubmit(inputValue, true)"
        >
          <template #prefix>
            <LockOutlined class="input-icon" />
          </template>
        </a-input-password>
        <a-button
          type="primary"
          size="small"
          class="action-btn"
          @click="handleSubmit(inputValue, true)"
        >
          {{ t('interaction.send') }}
        </a-button>
      </div>

      <!-- Confirm type -->
      <div
        v-else-if="interactionType === 'confirm'"
        class="confirm-group"
      >
        <template v-if="!isManualMode">
          <div class="option-grid">
            <a-button
              type="primary"
              size="small"
              class="option-btn yes-btn"
              @click="handleSubmit(confirmValues?.yes || 'Y', true)"
            >
              {{ t('interaction.yes') }} <span class="key-hint">({{ confirmValues?.yes || 'Y' }})</span>
            </a-button>
            <a-button
              size="small"
              class="option-btn no-btn"
              @click="handleSubmit(confirmValues?.no || 'N', true)"
            >
              {{ t('interaction.no') }} <span class="key-hint">({{ confirmValues?.no || 'N' }})</span>
            </a-button>
            <a-button
              v-if="confirmValues?.default"
              size="small"
              class="option-btn default-btn"
              @click="handleSubmit('', true)"
            >
              {{ t('interaction.default') }} <span class="key-hint">(Enter)</span>
            </a-button>
            <a-button
              type="dashed"
              size="small"
              class="option-btn manual-btn"
              @click="switchToManual"
            >
              {{ t('interaction.manual') }}
            </a-button>
          </div>
        </template>
        <template v-else>
          <div class="manual-input-wrapper">
            <a-input
              ref="manualInputRef"
              v-model:value="manualInput"
              class="interaction-input"
              :placeholder="t('interaction.inputPlaceholder')"
              @press-enter="handleSubmit(manualInput, true)"
            />
            <div class="manual-actions">
              <a-button
                type="primary"
                size="small"
                @click="handleSubmit(manualInput, true)"
              >
                {{ t('interaction.send') }}
              </a-button>
              <a-button
                size="small"
                @click="switchToOptions"
              >
                {{ t('interaction.backToOptions') }}
              </a-button>
            </div>
          </div>
        </template>
      </div>

      <!-- Select type -->
      <div
        v-else-if="interactionType === 'select'"
        class="select-group"
      >
        <template v-if="!isManualMode">
          <div class="option-grid">
            <a-button
              v-for="(option, index) in options"
              :key="index"
              size="small"
              class="option-btn"
              @click="handleSubmit(optionValues?.[index] || String(index + 1), true)"
            >
              {{ option }}
            </a-button>
            <a-button
              type="dashed"
              size="small"
              class="option-btn manual-btn"
              @click="switchToManual"
            >
              {{ t('interaction.manual') }}
            </a-button>
          </div>
        </template>
        <template v-else>
          <div class="manual-input-wrapper">
            <a-input
              ref="manualInputRef"
              v-model:value="manualInput"
              size="small"
              class="interaction-input"
              :placeholder="t('interaction.inputPlaceholder')"
              @press-enter="handleSubmit(manualInput, true)"
            >
              <template #prefix>
                <EditOutlined class="input-icon" />
              </template>
            </a-input>
            <div class="manual-actions">
              <a-button
                type="primary"
                @click="handleSubmit(manualInput, true)"
              >
                {{ t('interaction.send') }}
              </a-button>
              <a-button @click="switchToOptions">
                {{ t('interaction.backToOptions') }}
              </a-button>
            </div>
          </div>
        </template>
      </div>

      <!-- Pager type -->
      <div
        v-else-if="interactionType === 'pager'"
        class="pager-group"
      >
        <div class="pager-toolbar">
          <a-tooltip :title="t('interaction.pagerPrev')">
            <a-button
              size="small"
              @click="handleSubmit('b', false)"
            >
              <LeftOutlined /> Back (b)
            </a-button>
          </a-tooltip>
          <a-tooltip :title="t('interaction.pagerNext')">
            <a-button
              type="primary"
              size="small"
              @click="handleSubmit(' ', false)"
            >
              Next (Space) <RightOutlined />
            </a-button>
          </a-tooltip>
          <a-dropdown>
            <template #overlay>
              <a-menu>
                <a-menu-item @click="handleSubmit('g', false)">Home (g)</a-menu-item>
                <a-menu-item @click="handleSubmit('G', false)">End (G)</a-menu-item>
                <a-menu-item @click="switchToManual">{{ t('interaction.manualInput') }}</a-menu-item>
              </a-menu>
            </template>
            <a-button size="small"> More <DownOutlined /> </a-button>
          </a-dropdown>
          <a-button
            danger
            size="small"
            @click="handleSubmit('q', false)"
          >
            {{ t('interaction.pagerQuit') }} (q)
          </a-button>
        </div>

        <template v-if="isManualMode">
          <div class="manual-input-wrapper mt-2">
            <a-input
              ref="manualInputRef"
              v-model:value="manualInput"
              size="small"
              class="interaction-input"
              :placeholder="t('interaction.inputPlaceholder')"
              style="width: 120px"
              @press-enter="handleSubmit(manualInput, false)"
            />
            <a-button
              type="primary"
              size="small"
              @click="handleSubmit(manualInput, false)"
            >
              {{ t('interaction.send') }}
            </a-button>
          </div>
        </template>
      </div>

      <!-- Enter type -->
      <div
        v-else-if="interactionType === 'enter'"
        class="enter-group"
      >
        <a-button
          type="primary"
          size="small"
          class="action-btn wide-btn"
          @click="handleSubmit('', true)"
        >
          <EnterOutlined /> {{ t('interaction.pressEnter') }}
        </a-button>
        <a-button
          type="link"
          size="small"
          @click="switchToManual"
        >
          {{ t('interaction.manual') }}
        </a-button>
        <template v-if="isManualMode">
          <div class="manual-input-wrapper">
            <a-input
              ref="manualInputRef"
              v-model:value="manualInput"
              class="interaction-input"
              :placeholder="t('interaction.inputPlaceholder')"
              @press-enter="handleSubmit(manualInput, true)"
            />
            <a-button
              type="primary"
              size="small"
              @click="handleSubmit(manualInput, true)"
            >
              {{ t('interaction.send') }}
            </a-button>
          </div>
        </template>
      </div>

      <!-- Freeform type -->
      <div
        v-else
        class="freeform-group"
      >
        <a-input
          ref="freeformInputRef"
          v-model:value="inputValue"
          size="small"
          :placeholder="t('interaction.inputPlaceholder')"
          class="interaction-input"
          @press-enter="handleSubmit(inputValue, true)"
        >
          <template #prefix>
            <QuestionCircleOutlined class="input-icon" />
          </template>
        </a-input>
        <a-button
          type="primary"
          size="small"
          class="action-btn"
          @click="handleSubmit(inputValue, true)"
        >
          {{ t('interaction.send') }}
        </a-button>
      </div>
    </div>

    <!-- Error message display -->
    <div
      v-if="errorMessage"
      class="interaction-error"
    >
      <CloseCircleOutlined />
      <span class="error-text">{{ errorMessage }}</span>
      <a-button
        type="text"
        size="small"
        class="error-dismiss-btn"
        @click="handleClearError"
      >
        <CloseOutlined />
      </a-button>
    </div>

    <!-- Loading state -->
    <div
      v-if="isSubmitting"
      class="interaction-loading"
    >
      <LoadingOutlined spin />
      <span>{{ t('interaction.sending') }}</span>
    </div>

    <!-- Footer removed (Cancel moved to header) -->
  </div>

  <!-- TUI detected notice -->
  <div
    v-if="tuiDetected"
    class="tui-notice"
  >
    <WarningOutlined />
    <span>{{ tuiMessage }}</span>
    <a-button
      size="small"
      type="link"
      @click="handleFocusTerminal"
    >
      {{ t('interaction.switchToTerminal') }}
    </a-button>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  QuestionCircleOutlined,
  LockOutlined,
  DownOutlined,
  EnterOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  EllipsisOutlined,
  RightOutlined,
  LeftOutlined,
  CloseOutlined,
  EditOutlined
} from '@ant-design/icons-vue'
import type { InteractionType, ConfirmValues } from '../../../../preload/index.d'

const { t } = useI18n()

interface Props {
  visible?: boolean
  commandId?: string
  interactionType?: InteractionType
  promptHint?: string
  options?: string[]
  optionValues?: string[]
  confirmValues?: ConfirmValues
  /** Exit key/command for the interactive program (e.g., 'q', 'quit', 'exit') */
  exitKey?: string
  /** Whether to append newline when sending exit key (default: true) */
  exitAppendNewline?: boolean
  isSuppressed?: boolean
  tuiDetected?: boolean
  tuiMessage?: string
  errorMessage?: string
  isSubmitting?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  commandId: '',
  interactionType: 'freeform',
  promptHint: '',
  options: () => [],
  optionValues: () => [],
  confirmValues: undefined,
  exitKey: undefined,
  exitAppendNewline: undefined,
  isSuppressed: false,
  tuiDetected: false,
  tuiMessage: '',
  errorMessage: '',
  isSubmitting: false
})

const emit = defineEmits<{
  submit: [commandId: string, input: string, appendNewline: boolean, interactionType: InteractionType]
  cancel: [commandId: string]
  dismiss: [commandId: string]
  suppress: [commandId: string]
  unsuppress: [commandId: string]
  focusTerminal: []
  clearError: [commandId: string]
}>()

// State
const inputValue = ref('')
const manualInput = ref('')
const isManualMode = ref(false)

// Computed properties for exit button
const hasCustomExitKey = computed(() => {
  // For pager type, Exit button should always be Ctrl+C (force interrupt)
  // because pager already has a dedicated Quit(q) button for normal exit
  if (props.interactionType === 'pager') return false

  if (!props.exitKey) return false
  // Normalize: treat Ctrl+C variants as default behavior
  const normalized = props.exitKey.toLowerCase().replace(/[\s\-_]/g, '')
  const ctrlCVariants = ['\x03', 'ctrlc', 'ctrl+c', '^c']
  return !ctrlCVariants.includes(normalized)
})

const exitButtonLabel = computed(() => {
  if (hasCustomExitKey.value) {
    return `${t('interaction.exit')} (${props.exitKey})`
  }
  return 'Ctrl + C'
})

const exitButtonTooltip = computed(() => {
  if (hasCustomExitKey.value) {
    return t('interaction.exitKeyTip', { key: props.exitKey })
  }
  return t('interaction.cancelTip') || 'Send Ctrl+C'
})

// Refs
const passwordInputRef = ref<any>(null)
const manualInputRef = ref<any>(null)
const freeformInputRef = ref<any>(null)

// Watch for visibility changes to focus input
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      nextTick(() => {
        focusInput()
      })
    }
  }
)

// Watch for interaction type changes to reset state
watch(
  () => props.interactionType,
  () => {
    inputValue.value = ''
    manualInput.value = ''
    isManualMode.value = false
  }
)

onMounted(() => {
  if (props.visible) {
    nextTick(() => {
      focusInput()
    })
  }
})

// Methods
function focusInput(): void {
  if (props.interactionType === 'password' && passwordInputRef.value) {
    passwordInputRef.value.focus()
  } else if (props.interactionType === 'freeform' && freeformInputRef.value) {
    freeformInputRef.value.focus()
  } else if (isManualMode.value && manualInputRef.value) {
    manualInputRef.value.focus()
  }
}

function handleSubmit(input: string, appendNewline: boolean): void {
  emit('submit', props.commandId, input, appendNewline, props.interactionType)
  // Clear input after submit
  inputValue.value = ''
  manualInput.value = ''
}

/**
 * Handle exit button click
 * If exitKey is set, send exitKey via submit; otherwise send Ctrl+C via cancel
 */
function handleExit(): void {
  if (hasCustomExitKey.value && props.exitKey) {
    // Send exit key via submit
    const appendNewline = props.exitAppendNewline ?? true
    emit('submit', props.commandId, props.exitKey, appendNewline, props.interactionType)
  } else {
    // Send Ctrl+C via cancel
    emit('cancel', props.commandId)
  }
}

function handleDismiss(): void {
  emit('dismiss', props.commandId)
}

function handleSuppress(): void {
  emit('suppress', props.commandId)
}

function handleUnsuppress(): void {
  emit('unsuppress', props.commandId)
}

function handleFocusTerminal(): void {
  emit('focusTerminal')
}

function handleClearError(): void {
  emit('clearError', props.commandId)
}

function switchToManual(): void {
  isManualMode.value = true
  nextTick(() => {
    if (manualInputRef.value) {
      manualInputRef.value.focus()
    }
  })
}

function switchToOptions(): void {
  isManualMode.value = false
  manualInput.value = ''
}
</script>

<style scoped>
.command-interaction-input {
  /* Updated to match AI Tab card style - solid background, no glassmorphism */
  background-color: var(--bg-color-secondary, #fafafa);
  border: 1px solid var(--border-color, #f0f0f0);
  border-radius: 12px;
  padding: 16px;
  margin: 12px 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
}

[data-theme='dark'] .command-interaction-input {
  background-color: var(--bg-color-elevated, #1f1f1f);
  border-color: var(--border-color, #303030);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.interaction-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.header-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.interaction-icon {
  color: var(--primary-color);
  font-size: 18px;
  display: flex;
  align-items: center;
}

.interaction-hint {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  line-height: 1.4;
  word-break: break-word;
}

.interaction-actions {
  margin-left: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-cancel-btn {
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-family: monospace;
  font-size: 11px;
  font-weight: 500;
  height: 22px;
  border-radius: 4px;
  background-color: rgba(255, 77, 79, 0.1);
  border: 1px solid rgba(255, 77, 79, 0.2);
  color: var(--error-color, #ff4d4f);
}

.header-cancel-btn:hover {
  background-color: rgba(255, 77, 79, 0.2);
  border-color: rgba(255, 77, 79, 0.4);
}

.more-btn {
  color: var(--text-color-secondary);
}

.interaction-body {
  margin-bottom: 4px;
}

/* Common input styles */
.interaction-input {
  border-radius: 6px;
  /* Ensure alignment with button */
  line-height: 1.5;
}

.input-icon {
  color: var(--text-color-secondary);
  margin-right: 4px;
}

.input-group,
.freeform-group {
  display: flex;
  gap: 10px;
  align-items: center; /* Critical for vertical alignment */
}

/* Ensure manual input wrapper aligns correctly */
.manual-input-wrapper {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.action-btn {
  border-radius: 6px;
  padding: 0 12px;
}

.wide-btn {
  min-width: 120px;
}

/* Confirm & Select Grid Layout */
.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.option-btn {
  border-radius: 6px;
  min-width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.key-hint {
  font-size: 12px;
  opacity: 0.8;
  font-weight: normal;
}

.yes-btn {
  /* Primary color handled by type="primary" */
}

.no-btn {
  /* Defaults */
}

.manual-input-wrapper {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.manual-actions {
  display: flex;
  gap: 8px;
}

/* Pager Toolbar */
.pager-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  background-color: var(--bg-color-tertiary, rgba(0, 0, 0, 0.02));
  border-radius: 8px;
}

[data-theme='dark'] .pager-toolbar {
  background-color: rgba(255, 255, 255, 0.04);
}

/* Error Message */
.interaction-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--error-bg-color, rgba(255, 77, 79, 0.1));
  border: 1px solid var(--error-border-color, rgba(255, 77, 79, 0.2));
  border-radius: 6px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--error-color, #ff4d4f);
}

.error-text {
  flex: 1;
}

/* Loading */
.interaction-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 13px;
  color: var(--text-color-secondary);
  justify-content: center;
}

/* Footer styles removed */

/* Suppressed Notice */
.suppressed-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--warning-bg-color, rgba(250, 173, 20, 0.1));
  border-radius: 8px;
}

.suppressed-text {
  color: var(--text-color-secondary);
  font-size: 13px;
}

/* TUI Notice (External) */
.tui-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background-color: var(--warning-bg-color, rgba(250, 173, 20, 0.1));
  border: 1px solid var(--warning-border-color, rgba(250, 173, 20, 0.2));
  border-radius: 8px;
  margin: 12px 0;
  font-size: 13px;
  color: var(--warning-color, #faad14);
}
</style>
