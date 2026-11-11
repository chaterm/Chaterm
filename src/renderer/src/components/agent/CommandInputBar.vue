<template>
  <div
    v-if="revealed"
    class="command-input-bar"
  >
    <a-input
      ref="inputRef"
      v-model:value="inputValue"
      size="small"
      class="command-input"
      :placeholder="t('interaction.inputPlaceholder')"
      :aria-label="t('interaction.inputCommand')"
      @press-enter="submit"
    />
    <a-button
      size="small"
      class="submit-btn"
      @click="submit"
    >
      {{ t('interaction.inputCommand') }}
    </a-button>
    <a-tooltip :title="t('interaction.cancelTip')">
      <a-button
        size="small"
        class="interrupt-btn"
        @click="emit('cancel', commandId)"
      >
        Ctrl + C
      </a-button>
    </a-tooltip>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// Same delay as the former long-silence prompt: show the bar once the command has been quiet this long
const REVEAL_AFTER_SILENCE_MS = 30000

const props = defineProps<{
  commandId: string
  startedAt: number
  lastOutputAt: number | null
  /** Detection found a prompt: show the bar now and focus the input */
  forceVisible?: boolean
}>()

const emit = defineEmits<{
  submit: [commandId: string, input: string]
  cancel: [commandId: string]
}>()

const { t } = useI18n()

const inputValue = ref('')
const inputRef = ref<{ focus: () => void } | null>(null)
// Once shown, the bar stays until the command ends so typing is never interrupted
const revealed = ref(false)

let ticker: ReturnType<typeof setInterval> | undefined

const stopTicker = () => {
  clearInterval(ticker)
  ticker = undefined
}

const checkSilence = () => {
  if (Date.now() - (props.lastOutputAt ?? props.startedAt) >= REVEAL_AFTER_SILENCE_MS) {
    revealed.value = true
    stopTicker()
  }
}

checkSilence()
if (!revealed.value) {
  ticker = setInterval(checkSilence, 1000)
}

watch(
  () => props.forceVisible,
  (force) => {
    if (!force) return
    revealed.value = true
    stopTicker()
    nextTick(() => inputRef.value?.focus())
  },
  { immediate: true }
)

onUnmounted(stopTicker)

function submit(): void {
  emit('submit', props.commandId, inputValue.value)
  inputValue.value = ''
}
</script>

<style scoped>
.command-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% - 16px);
  margin: 4px 8px 0;
  padding: 6px 8px;
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
}

.command-input {
  flex: 1;
  min-width: 0;
}

.command-input-bar :deep(.ant-input),
.command-input-bar :deep(.ant-input-affix-wrapper) {
  background-color: transparent;
  border-color: var(--border-color-light);
  color: var(--text-color);
}

.command-input-bar :deep(.ant-input::placeholder) {
  color: var(--text-color-secondary);
}

.command-input-bar :deep(.ant-btn) {
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  border-radius: 4px;
  flex-shrink: 0;
  background-color: transparent;
  border-color: var(--border-color-light);
  color: var(--text-color-secondary);
}

.command-input-bar :deep(.ant-btn:hover) {
  border-color: var(--text-color-secondary);
  color: var(--text-color);
}

.interrupt-btn {
  font-family: monospace;
}
</style>
