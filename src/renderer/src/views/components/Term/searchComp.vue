<template>
  <div class="search-bar">
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
        v-model="searchTerm"
        class="search-input"
        :placeholder="t('term.searchPlaceholder')"
        @keydown.enter.prevent="findNext"
        @keydown.esc.prevent="closeSearch"
      />
      <div
        v-if="searchTerm && searchResultsCount > 0"
        class="search-results"
      >
        <span class="results-text">{{ currentResultIndex }}/{{ searchResultsCount }}</span>
      </div>
      <button
        v-if="searchTerm"
        class="clear-button"
        :title="t('common.clear')"
        @click="clearSearch"
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
        :title="t('term.searchPrevious')"
        :disabled="searchResultsCount === 0"
        @click="findPrevious"
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
        :title="t('term.searchNext')"
        :disabled="searchResultsCount === 0"
        @click="findNext"
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
        @click="closeSearch"
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
import { ref, onMounted, nextTick, onBeforeUnmount, defineProps, reactive, watch } from 'vue'
import { SearchAddon } from 'xterm-addon-search'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits(['closeSearch'])
const searchTerm = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const searchResultsCount = ref(0)
const currentResultIndex = ref(0)
const searchResults = ref<any[]>([])
let searchTimeout: NodeJS.Timeout | null = null

const props = defineProps({
  searchAddon: {
    type: Object as () => SearchAddon | null,
    required: true
  },
  terminal: {
    type: Object as () => any,
    required: true
  }
})

// 防抖搜索函数
const debouncedSearch = (callback: () => void, delay: number = 150) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = setTimeout(callback, delay)
}

const findNext = () => {
  if (props.searchAddon && searchTerm.value && searchResultsCount.value > 0) {
    const result = props.searchAddon.findNext(searchTerm.value, {
      caseSensitive: false
    })
    if (result) {
      // 如果找到下一个匹配项，更新索引
      if (currentResultIndex.value < searchResultsCount.value) {
        currentResultIndex.value++
      } else {
        // 如果已经是最后一个，回到第一个
        currentResultIndex.value = 1
      }
    }
  }
}

const findPrevious = () => {
  if (props.searchAddon && searchTerm.value && searchResultsCount.value > 0) {
    const result = props.searchAddon.findPrevious(searchTerm.value, {
      caseSensitive: false
    })
    if (result) {
      // 如果找到上一个匹配项，更新索引
      if (currentResultIndex.value > 1) {
        currentResultIndex.value--
      } else {
        // 如果已经是第一个，跳到最后一个
        currentResultIndex.value = searchResultsCount.value
      }
    }
  }
}

const clearSearch = () => {
  searchTerm.value = ''
  if (props.searchAddon) {
    props.searchAddon.clearDecorations()
  }
  searchResultsCount.value = 0
  currentResultIndex.value = 0
  searchResults.value = []
}

const closeSearch = () => {
  if (props.searchAddon) {
    props.searchAddon.clearDecorations()
  }
  if (searchTimeout) {
    clearTimeout(searchTimeout)
    searchTimeout = null
  }
  searchResultsCount.value = 0
  currentResultIndex.value = 0
  searchResults.value = []
  emit('closeSearch')
}

onMounted(() => {
  nextTick(() => {
    searchInput.value?.focus()
  })
})

onBeforeUnmount(() => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
})

// 计算实际匹配数量
const calculateMatches = () => {
  if (!props.terminal || !searchTerm.value) {
    searchResultsCount.value = 0
    currentResultIndex.value = 0
    return
  }

  try {
    // 尝试从 SearchAddon 获取匹配信息
    if (props.searchAddon && (props.searchAddon as any)._searchResults) {
      const results = (props.searchAddon as any)._searchResults
      if (Array.isArray(results)) {
        searchResultsCount.value = results.length
        currentResultIndex.value = results.length > 0 ? 1 : 0
        return
      }
    }

    // 备用方法：手动计算匹配数量
    const buffer = props.terminal._core._bufferService.buffer
    const lines = buffer.lines
    let totalMatches = 0
    const searchLower = searchTerm.value.toLowerCase()

    // 遍历所有可见行
    for (let i = 0; i < lines.length; i++) {
      const line = lines.get(i).translateToString(true)
      if (line.toLowerCase().includes(searchLower)) {
        // 计算这一行中的匹配次数
        const matches = (line.toLowerCase().match(new RegExp(searchLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
        totalMatches += matches
      }
    }

    searchResultsCount.value = totalMatches
    currentResultIndex.value = totalMatches > 0 ? 1 : 0
  } catch (error) {
    console.error('计算匹配数量时出错:', error)
    // 如果计算失败，尝试从终端内容估算
    try {
      const terminalText = props.terminal.buffer.active.translateToString()
      const searchLower = searchTerm.value.toLowerCase()
      const matches = (terminalText.toLowerCase().match(new RegExp(searchLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      searchResultsCount.value = matches
      currentResultIndex.value = matches > 0 ? 1 : 0
    } catch (fallbackError) {
      console.error('备用计算方法也失败:', fallbackError)
      searchResultsCount.value = 0
      currentResultIndex.value = 0
    }
  }
}

watch(searchTerm, (newTerm) => {
  if (props.searchAddon) {
    if (newTerm) {
      props.searchAddon.findNext(newTerm, {
        incremental: true,
        caseSensitive: false
      })
      // 使用防抖来延迟计算匹配数量
      debouncedSearch(() => {
        calculateMatches()
      }, 200)
    } else {
      props.searchAddon.clearDecorations()
      searchResultsCount.value = 0
      currentResultIndex.value = 0
      searchResults.value = []
    }
  }
})
</script>

<style scoped lang="less">
.search-bar {
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

    & + .search-icon {
      color: #007aff;
    }
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

  .results-text {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;
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

// 响应式设计
@media (max-width: 768px) {
  .search-bar {
    min-width: 280px;
    max-width: calc(100vw - 24px);
    right: 12px;
    left: 12px;
  }

  .search-input {
    font-size: 16px; // 防止iOS缩放
  }
}

// 暗色主题优化
.theme-dark & {
  .search-bar {
    background: rgba(30, 30, 30, 0.95);
    border-color: rgba(65, 65, 65, 0.8);
  }

  .search-input {
    border-color: rgba(65, 65, 65, 0.6);

    &:focus {
      background: rgba(30, 30, 30, 0.95);
    }
  }
}

// 亮色主题优化
.theme-light & {
  .search-bar {
    background: rgba(245, 245, 245, 0.95);
    border-color: rgba(232, 232, 232, 0.8);
  }

  .search-input {
    background: rgba(250, 250, 250, 0.8);
    border-color: rgba(232, 232, 232, 0.6);

    &:focus {
      background: rgba(255, 255, 255, 0.95);
    }
  }
}
</style>
