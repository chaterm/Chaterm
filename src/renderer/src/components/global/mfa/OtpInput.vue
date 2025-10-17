<template>
  <div class="otp-input-container">
    <input
      ref="inputRef"
      :value="inputValue"
      type="text"
      class="otp-text-input"
      :class="{ error: hasError }"
      :disabled="disabled"
      @input="handleInput"
      @keydown="handleKeydown"
      @focus="handleFocus"
      @paste="handlePaste"
    />
    <div
      v-if="hasError"
      class="error-message"
    >
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, watch } from 'vue'

// Props
interface Props {
  modelValue?: string
  length?: number
  hasError?: boolean
  errorMessage?: string
  disabled?: boolean
  autoFocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  length: 6,
  hasError: false,
  errorMessage: '',
  disabled: false,
  autoFocus: true
})

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
  complete: [value: string]
  change: [value: string]
}>()

// State
const inputValue = ref(props.modelValue)
const inputRef = ref<HTMLInputElement | null>(null)

// Watch for external value changes
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== inputValue.value) {
      inputValue.value = newValue
    }
  }
)

// Initialize digits from modelValue
onMounted(() => {
  if (props.autoFocus && inputRef.value && !props.disabled) {
    inputRef.value.focus()
  }
})

// Methods
function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = target.value
  inputValue.value = value
  emitChange()
}

function handleKeydown(event: KeyboardEvent) {
  const { key } = event

  if (key === 'Enter') {
    emit('complete', inputValue.value)
  }
}

function handleFocus() {
  // Select all text when focusing for quick replace
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.select()
    }
  })
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault()
  const pasteData = event.clipboardData?.getData('text') || ''
  inputValue.value = pasteData
  emitChange()
}

function emitChange() {
  emit('update:modelValue', inputValue.value)
  emit('change', inputValue.value)
}

// Public methods (exposed for parent component)
function clear() {
  inputValue.value = ''
  if (inputRef.value) {
    inputRef.value.focus()
  }
  emitChange()
}

function focus() {
  if (inputRef.value) {
    inputRef.value.focus()
  }
}

defineExpose({
  clear,
  focus
})
</script>

<style>
.otp-input-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.otp-text-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--border-color-light);
  border-radius: 6px;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-size: 16px;
  transition: all 0.2s;
  outline: none;
}

.otp-text-input:focus {
  border-color: #4096ff;
  box-shadow: 0 0 0 2px rgba(5, 145, 255, 0.2);
}

.otp-text-input:hover:not(:focus) {
  border-color: #4096ff;
}

.otp-text-input.error {
  border-color: #ff4d4f;
  background-color: var(--bg-color);
}

.otp-text-input.error:focus {
  border-color: #ff4d4f;
  box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.2);
}

.otp-text-input:disabled {
  cursor: not-allowed;
  background-color: var(--bg-color-secondary);
  color: var(--text-color-secondary-light);
}

.error-message {
  color: #ff4d4f;
  font-size: 12px;
  text-align: center;
  margin-top: -4px;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .otp-input-container {
    gap: 8px;
  }

  .otp-text-input {
    padding: 10px 14px;
    font-size: 15px;
  }
}
</style>
