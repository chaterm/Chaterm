<template>
  <div class="search-bar">
    <div class="search-input-container">
      <input
        ref="searchInput"
        v-model="searchTerm"
        class="search-input"
        placeholder="搜索"
        @keydown.enter.prevent="findNext"
        @keydown.esc.prevent="closeSearch"
      />
      <div
        v-if="searchTerm && searchResultsCount > 0"
        class="search-results"
      >
        {{ currentResultIndex }}/{{ searchResultsCount }}
      </div>
    </div>
    <button
      class="search-button"
      title="上一个 (Shift+Enter)"
      :disabled="searchResultsCount === 0"
      @click="findPrevious"
    >
      ▲
    </button>
    <button
      class="search-button"
      title="下一个 (Enter)"
      :disabled="searchResultsCount === 0"
      @click="findNext"
    >
      ▼
    </button>
    <div class="separator"></div>
    <button
      class="search-button close-button"
      :title="`${t('common.close')} (Esc)`"
      @click="closeSearch"
    >
      ✕
    </button>
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
  top: 8px;
  right: 8px;
  z-index: 1000;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 6px 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  min-width: 280px;
  backdrop-filter: blur(10px);
}

.search-input-container {
  position: relative;
  display: flex;
  align-items: center;
  margin-right: 6px;
}

.search-input {
  background: #2d2d30;
  border: 1px solid #3c3c3c;
  color: #cccccc;
  outline: none;
  padding: 4px 8px;
  border-radius: 3px;
  min-width: 160px;
  font-size: 13px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;

  &:focus {
    border-color: #007acc;
    box-shadow: 0 0 0 1px rgba(0, 122, 204, 0.3);
  }

  &::placeholder {
    color: #6a6a6a;
  }
}

.search-results {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  font-size: 11px;
  color: #6a6a6a;
  pointer-events: none;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.search-button {
  background: transparent;
  border: 1px solid transparent;
  color: #cccccc;
  cursor: pointer;
  min-width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: #3c3c3c;
    border-color: #5a5a5a;
  }

  &:active:not(:disabled) {
    background: #4c4c4c;
  }

  &:focus {
    outline: none;
    border-color: #007acc;
    box-shadow: 0 0 0 1px rgba(0, 122, 204, 0.3);
  }

  &:disabled {
    color: #6a6a6a;
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.separator {
  width: 1px;
  height: 16px;
  background: #3c3c3c;
  margin: 0 4px;
}

.close-button {
  color: #888888;

  &:hover:not(:disabled) {
    background: #c42b1c;
    border-color: #c42b1c;
    color: white;
  }

  &:active:not(:disabled) {
    background: #a91f1f;
  }
}
</style>
