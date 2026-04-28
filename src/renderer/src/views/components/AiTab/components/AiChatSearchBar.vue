<template>
  <div class="ai-chat-search-bar">
    <div class="search-input-container">
      <div class="search-icon">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M21 21L16.514 16.506L21 21ZM19 10.5C19 15.194 15.194 19 10.5 19C5.806 19 2 15.194 2 10.5C2 5.806 5.806 2 10.5 2C15.194 2 19 5.806 19 10.5Z"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <input
        ref="searchInput"
        :value="searchTerm"
        class="search-input"
        :placeholder="t('ai.searchChatPlaceholder')"
        @input="handleInput"
        @keydown.enter.exact.prevent="$emit('findNext')"
        @keydown.shift.enter.prevent="$emit('findPrevious')"
        @keydown.esc.prevent="$emit('close')"
      />
      <div
        v-if="searchTerm && matchCount > 0"
        class="search-results"
      >
        <span class="results-text">{{ currentMatchIndex }}/{{ matchCount }}</span>
      </div>
      <div
        v-if="searchTerm && matchCount === 0"
        class="search-results no-results"
      >
        <span class="results-text">{{ t('ai.noSearchMatches') }}</span>
      </div>
      <button
        v-if="searchTerm"
        class="clear-button"
        :title="t('common.clear')"
        @click="handleClear"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M18 6L6 18M6 6L18 18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
    <div class="search-controls">
      <button
        class="search-button"
        :title="t('ai.searchChatPrevious')"
        :disabled="matchCount === 0"
        @click="$emit('findPrevious')"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M15 18L9 12L15 6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        class="search-button"
        :title="t('ai.searchChatNext')"
        :disabled="matchCount === 0"
        @click="$emit('findNext')"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9 18L15 12L9 6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <div class="separator"></div>
      <button
        class="search-button close-button"
        :title="`${t('common.close')} (Esc)`"
        @click="$emit('close')"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M18 6L6 18M6 6L18 18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const searchInput = ref<HTMLInputElement | null>(null)

defineProps<{
  searchTerm: string
  matchCount: number
  currentMatchIndex: number
}>()

const emit = defineEmits<{
  'update:searchTerm': [value: string]
  findNext: []
  findPrevious: []
  close: []
}>()

const handleInput = (e: Event) => {
  emit('update:searchTerm', (e.target as HTMLInputElement).value)
}

const handleClear = () => {
  emit('update:searchTerm', '')
  nextTick(() => {
    searchInput.value?.focus()
  })
}

onMounted(() => {
  nextTick(() => {
    searchInput.value?.focus()
  })
})
</script>

<style scoped lang="less">
.ai-chat-search-bar {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1000;
  background: var(--bg-color-secondary);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  display: flex;
  align-items: center;
  padding: 0px 4px;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.2),
    0 2px 8px rgba(0, 0, 0, 0.1);
  min-width: 280px;
  max-width: 400px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:focus-within {
    border-color: #007aff;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.3),
      0 2px 8px rgba(0, 0, 0, 0.2),
      0 0 0 3px rgba(0, 122, 255, 0.2);
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.search-input-container {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  margin-right: 8px;
}

.search-icon {
  position: absolute;
  left: 4px;
  top: 55%;
  transform: translateY(-50%);
  color: var(--text-color-tertiary);
  z-index: 1;
  pointer-events: none;
  transition: color 0.2s ease;
}

.search-input {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--text-color);
  outline: none;
  padding: 6px 8px 6px 28px;
  border-radius: 0;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 24px;

  &:focus {
    background: transparent;
  }

  &::placeholder {
    color: var(--text-color-quaternary);
    font-weight: 400;
  }

  &:hover {
    background: transparent;
  }
}

.search-results {
  position: absolute;
  right: 28px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--bg-color-quaternary);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 10px;
  color: var(--text-color-secondary);
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 500;
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-color-light);
  white-space: nowrap;

  .results-text {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  &.no-results {
    color: var(--text-color-tertiary);
  }
}

.clear-button {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-color-tertiary);
  cursor: pointer;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 2;

  &:hover {
    background: var(--hover-bg-color);
    color: var(--text-color);
  }

  &:active {
    transform: translateY(-50%) scale(0.95);
  }

  svg {
    width: 12px;
    height: 12px;
  }
}

.search-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.search-button {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  min-width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;

  &:hover:not(:disabled) {
    background: var(--hover-bg-color);
    color: var(--text-color);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    background: var(--active-bg-color);
    transform: translateY(0) scale(0.95);
  }

  &:focus {
    outline: none;
    border-color: #007aff;
    box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
  }

  &:disabled {
    color: var(--text-color-quinary);
    cursor: not-allowed;
    opacity: 0.5;
  }

  svg {
    transition: transform 0.2s ease;
  }

  &:hover svg {
    transform: scale(1.1);
  }
}

.separator {
  width: 1px;
  height: 16px;
  background: var(--border-color-light);
  margin: 0 3px;
  opacity: 0.6;
}

.close-button {
  color: var(--text-color-tertiary);

  &:hover:not(:disabled) {
    background: #ff3b30;
    border-color: #ff3b30;
    color: white;
  }

  &:active:not(:disabled) {
    background: #d70015;
    transform: translateY(0) scale(0.95);
  }
}

@media (max-width: 768px) {
  .ai-chat-search-bar {
    min-width: 280px;
    max-width: calc(100vw - 24px);
    right: 12px;
    left: 12px;
  }

  .search-input {
    font-size: 16px;
  }
}
</style>
