<template>
  <teleport to="body">
    <div
      v-if="showCommandPopup"
      class="command-select-popup"
      :class="popupClass"
      :style="popupStyle"
    >
      <!-- Header: Search -->
      <div class="popup-header">
        <a-input
          ref="searchInputRef"
          v-model:value="searchValue"
          :placeholder="$t('ai.searchCommand')"
          size="small"
          class="popup-search-input"
          allow-clear
          @keydown="handleSearchKeyDown"
        />
      </div>

      <!-- Commands List -->
      <div class="select-list">
        <div
          v-for="(cmd, index) in filteredCommandOptions"
          :key="cmd.absPath"
          class="select-item"
          :class="{
            hovered: hovered === cmd.absPath,
            'keyboard-selected': keyboardSelectedIndex === index
          }"
          @mouseover="handleMouseOver(cmd.absPath, index)"
          @mouseleave="hovered = null"
          @click="onCommandClick(cmd)"
        >
          <CodeOutlined class="item-icon" />
          <span class="item-label">{{ cmd.name }}</span>
        </div>
        <div
          v-if="commandOptionsLoading"
          class="select-loading"
        >
          {{ $t('ai.loading') }}...
        </div>
        <div
          v-if="filteredCommandOptions.length === 0 && !commandOptionsLoading"
          class="select-empty"
        >
          {{ $t('ai.noMatchingCommands') }}
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { CSSProperties } from 'vue'
import { CodeOutlined } from '@ant-design/icons-vue'
import { commandSelectInjectionKey } from '../composables/useCommandSelect'

// Inject context from parent component (InputSendContainer)
const context = inject(commandSelectInjectionKey)
if (!context) {
  throw new Error('CommandSelectPopup must be used within a component that provides command select context')
}

const {
  showCommandPopup,
  searchValue,
  keyboardSelectedIndex,
  popupPosition,
  popupReady,
  searchInputRef,
  filteredCommandOptions,
  commandOptionsLoading,
  onCommandClick,
  handleSearchKeyDown
} = context

// Suppress unused var warning for template ref
void searchInputRef

// Local hover state
const hovered = ref<string | null>(null)

const handleMouseOver = (absPath: string, index: number) => {
  hovered.value = absPath
  keyboardSelectedIndex.value = index
}

const popupStyle = computed<CSSProperties>(() => {
  if (!popupPosition.value) {
    return {}
  }
  const style: CSSProperties = {
    left: `${popupPosition.value.left}px`
  }
  if (popupPosition.value.bottom !== undefined) {
    style.bottom = `${popupPosition.value.bottom}px`
  } else if (popupPosition.value.top !== undefined) {
    style.top = `${popupPosition.value.top}px`
  }
  return style
})

const popupClass = computed(() => ({
  'is-positioning': !popupReady.value
}))
</script>

<style lang="less" scoped>
.command-select-popup {
  --popup-bg-color: var(--bg-color);

  width: 260px;
  border-radius: 6px;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  max-height: 280px;
  z-index: 1000;
  position: fixed;
  overflow: hidden;
  background: var(--popup-bg-color);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  &.is-positioning {
    opacity: 0;
    pointer-events: none;
    transition: none;
  }
}

.popup-header {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
  gap: 6px;

  .popup-search-input {
    flex: 1;
    background-color: var(--bg-color-secondary) !important;
    border: 1px solid var(--border-color) !important;

    :deep(.ant-input) {
      height: 24px !important;
      font-size: 12px !important;
      background-color: var(--bg-color-secondary) !important;
      color: var(--text-color-secondary) !important;

      &::placeholder {
        color: var(--text-color-tertiary) !important;
      }
    }
  }
}

.select-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-color-quinary) var(--bg-color-senary);

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
    border-radius: 3px;

    &:hover {
      background-color: var(--scrollbar-thumb-hover);
    }
  }
}

.select-item {
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 4px;
  margin: 2px 4px;
  background: transparent;
  color: var(--text-color);
  font-size: 12px;
  line-height: 18px;
  transition: all 0.15s;
  display: flex;
  align-items: center;

  .item-icon {
    font-size: 12px;
    color: var(--text-color-secondary);
    margin-right: 8px;
    flex-shrink: 0;
  }

  .item-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.hovered,
  &:hover {
    background: var(--hover-bg-color);
  }

  &.keyboard-selected {
    background: var(--hover-bg-color);
    outline: 2px solid rgba(24, 144, 255, 0.4);
    outline-offset: -2px;
  }
}

.select-empty,
.select-loading {
  color: var(--text-color-tertiary);
  text-align: center;
  padding: 16px 12px;
  font-size: 12px;
}
</style>
