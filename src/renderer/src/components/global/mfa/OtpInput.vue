<template>
  <div class="otp-input-container">
    <div class="otp-inputs">
      <input
        v-for="(digit, index) in digits"
        :key="index"
        ref="inputRefs"
        v-model="digits[index]"
        type="text"
        class="otp-digit-input"
        :class="{
          error: hasError,
          filled: digits[index] !== ''
        }"
        maxlength="1"
        @input="handleInput(index, $event)"
        @keydown="handleKeydown(index, $event)"
        @focus="handleFocus(index)"
        @paste="handlePaste($event)"
      />
    </div>
    <div
      v-if="hasError"
      class="error-message"
    >
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'

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
const digits = ref<string[]>(new Array(props.length).fill(''))
const inputRefs = ref<HTMLInputElement[]>([])

// Computed
const otpValue = computed(() => digits.value.join(''))

// Watch for external value changes
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== otpValue.value) {
      setDigitsFromValue(newValue)
    }
  }
)

// Initialize digits from modelValue
onMounted(() => {
  if (props.modelValue) {
    setDigitsFromValue(props.modelValue)
  }
  if (props.autoFocus && inputRefs.value[0]) {
    inputRefs.value[0].focus()
  }
})

// Methods
function setDigitsFromValue(value: string) {
  const valueArray = value.split('')
  for (let i = 0; i < props.length; i++) {
    digits.value[i] = valueArray[i] || ''
  }
}

function handleInput(index: number, event: Event) {
  const target = event.target as HTMLInputElement
  let value = target.value

  // Only allow digits
  value = value.replace(/[^0-9]/g, '')

  if (value.length > 1) {
    // Handle pasted multiple digits
    const pastedDigits = value.split('')
    for (let i = 0; i < Math.min(pastedDigits.length, props.length - index); i++) {
      digits.value[index + i] = pastedDigits[i]
    }

    // Move focus to next empty input or last input
    const nextEmptyIndex = digits.value.findIndex((digit, i) => i > index && digit === '')
    const targetIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : Math.min(index + pastedDigits.length, props.length - 1)
    focusInput(targetIndex)
  } else {
    // Single digit input
    digits.value[index] = value

    if (value && index < props.length - 1) {
      // Move to next input
      focusInput(index + 1)
    }
  }

  emitChange()
}

function handleKeydown(index: number, event: KeyboardEvent) {
  const { key } = event

  if (key === 'Backspace') {
    event.preventDefault()

    if (digits.value[index]) {
      // Clear current digit
      digits.value[index] = ''
    } else if (index > 0) {
      // Move to previous input and clear it
      digits.value[index - 1] = ''
      focusInput(index - 1)
    }

    emitChange()
  } else if (key === 'ArrowLeft' && index > 0) {
    event.preventDefault()
    focusInput(index - 1)
  } else if (key === 'ArrowRight' && index < props.length - 1) {
    event.preventDefault()
    focusInput(index + 1)
  } else if (key === 'Home') {
    event.preventDefault()
    focusInput(0)
  } else if (key === 'End') {
    event.preventDefault()
    focusInput(props.length - 1)
  } else if (/^[0-9]$/.test(key)) {
    // Allow digit input (will be handled by input event)
  } else if (key.length === 1 && !event.ctrlKey && !event.metaKey) {
    // Prevent non-digit characters while still allowing paste shortcuts
    event.preventDefault()
  }
}

function handleFocus(index: number) {
  // Select all text when focusing
  nextTick(() => {
    if (inputRefs.value[index]) {
      inputRefs.value[index].select()
    }
  })
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault()

  const pasteData = event.clipboardData?.getData('text') || ''
  const cleanData = pasteData.replace(/[^0-9]/g, '').substring(0, props.length)

  if (cleanData) {
    const pastedDigits = cleanData.split('')
    for (let i = 0; i < props.length; i++) {
      digits.value[i] = pastedDigits[i] || ''
    }

    // Focus on the next empty input or last input
    const nextEmptyIndex = digits.value.findIndex((digit) => digit === '')
    const targetIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : props.length - 1
    focusInput(targetIndex)

    emitChange()
  }
}

function focusInput(index: number) {
  nextTick(() => {
    if (inputRefs.value[index]) {
      inputRefs.value[index].focus()
    }
  })
}

function emitChange() {
  const value = otpValue.value
  emit('update:modelValue', value)
  emit('change', value)

  // Check if complete
  if (value.length === props.length) {
    emit('complete', value)
  }
}

// Public methods (exposed for parent component)
function clear() {
  digits.value = new Array(props.length).fill('')
  if (inputRefs.value[0]) {
    inputRefs.value[0].focus()
  }
  emitChange()
}

function focus() {
  if (inputRefs.value[0]) {
    inputRefs.value[0].focus()
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
}

.otp-inputs {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.otp-digit-input {
  width: 48px;
  height: 48px;
  border: 1px solid var(--border-color-light);
  border-radius: 6px;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-size: 20px;
  font-weight: 600;
  text-align: center;
  transition: all 0.2s;
  outline: none;
}

.otp-digit-input:focus {
  border-color: #4096ff;
  box-shadow: 0 0 0 2px rgba(5, 145, 255, 0.2);
}

.otp-digit-input:hover:not(:focus) {
  border-color: #4096ff;
}

.otp-digit-input.filled {
  border-color: #4096ff;
  background-color: var(--bg-color);
}

.otp-digit-input.error {
  border-color: #ff4d4f;
  background-color: var(--bg-color);
}

.otp-digit-input.error:focus {
  border-color: #ff4d4f;
  box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.2);
}

.error-message {
  color: #ff4d4f;
  font-size: 12px;
  text-align: center;
  margin-top: -4px;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .otp-digit-input {
    width: 42px;
    height: 42px;
    font-size: 18px;
  }

  .otp-inputs {
    gap: 6px;
  }

  .otp-input-container {
    gap: 8px;
  }
}
</style>
