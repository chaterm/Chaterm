<template>
  <div class="followup-options">
    <button
      v-for="(option, optionIndex) in options"
      :key="`option-${optionIndex}-${option}`"
      type="button"
      class="followup-option"
      :disabled="message.partial"
      @click="handleOptionChoose(message, option)"
    >
      <span class="followup-option-index">{{ optionIndex + 1 }}</span>
      <span class="followup-option-label">{{ option }}</span>
    </button>
    <div class="followup-custom">
      <EditOutlined class="followup-custom-icon" />
      <a-textarea
        :value="getCustomInput(message)"
        :placeholder="$t('ai.enterCustomOption')"
        :auto-size="{ minRows: 1, maxRows: 4 }"
        :disabled="message.partial"
        class="followup-custom-input"
        @input="(e) => handleCustomInputChange(message, (e.target as HTMLTextAreaElement).value || '')"
        @keydown="(e: KeyboardEvent) => handleCustomInputKeydown(message, e)"
      />
      <a-button
        v-if="hasCustomInput(message)"
        type="primary"
        size="small"
        class="followup-action-btn"
        :disabled="message.partial"
        @click="handleOptionSubmit(message)"
      >
        {{ $t('ai.submit') }}
      </a-button>
      <a-button
        v-else
        type="text"
        size="small"
        class="followup-action-btn followup-skip-btn"
        :disabled="message.partial"
        @click="handleOptionSkip(message)"
      >
        {{ $t('ai.skip') }}
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EditOutlined } from '@ant-design/icons-vue'
import type { ChatMessage, MessageContent } from '../types'
import { useMessageOptions } from '../composables/useMessageOptions'

const props = defineProps<{
  message: ChatMessage
}>()

const options = computed(() => (props.message.content as MessageContent).options ?? [])

const {
  handleCustomInputChange,
  getCustomInput,
  hasCustomInput,
  handleOptionChoose,
  handleOptionSubmit,
  handleOptionSkip,
  handleCustomInputKeydown
} = useMessageOptions()
</script>

<style lang="less" scoped>
.followup-options {
  display: flex;
  flex-direction: column;
  // Same surface as the input box below so the card follows the theme and any custom background.
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  width: calc(100% - 16px);
  margin: 4px 8px 0 8px;
  overflow: hidden;

  .followup-option {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-bottom: 1px solid var(--border-color-light);
    background: transparent;
    color: var(--text-color);
    font-size: 12px;
    line-height: 1.5;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover:not(:disabled) {
      background-color: var(--hover-bg-color);
    }

    &:disabled {
      cursor: default;
    }

    .followup-option-index {
      flex-shrink: 0;
      min-width: 18px;
      height: 18px;
      line-height: 18px;
      border-radius: 4px;
      background-color: var(--bg-color-quaternary);
      color: var(--text-color-tertiary);
      font-size: 11px;
      text-align: center;
    }

    .followup-option-label {
      flex: 1;
      min-width: 0;
      white-space: normal;
      word-break: break-word;
    }
  }

  .followup-custom {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 8px 12px;

    .followup-custom-icon {
      flex-shrink: 0;
      margin-top: 3px;
      color: var(--text-color-tertiary);
    }

    .followup-custom-input {
      flex: 1;
      min-width: 0;
      padding: 0;
      border: none;
      background-color: transparent;
      box-shadow: none;
      color: var(--text-color);
      font-size: 12px;
      line-height: 1.5;
      resize: none;

      &:focus {
        border: none;
        box-shadow: none;
      }

      &::placeholder {
        color: var(--text-color-tertiary);
      }
    }

    .followup-action-btn {
      flex-shrink: 0;
      font-size: 12px;
      border-radius: 6px;

      &.ant-btn-primary {
        background-color: var(--button-bg-color);
        border-color: var(--button-bg-color);
        color: #fff;

        &:hover:not(:disabled) {
          background-color: var(--button-hover-bg);
          border-color: var(--button-hover-bg);
        }
      }
    }

    .followup-skip-btn {
      color: var(--text-color-secondary);
    }
  }
}
</style>
