<template>
  <div
    v-if="suggestions.length"
    :id="uniqueKey"
    :class="['suggestions', { 'selection-mode': selectionMode }]"
  >
    <div
      v-for="(suggestion, index) in suggestions"
      :key="index"
      :class="{ active: index === activeSuggestion }"
      class="suggestion-item"
    >
      <!-- 图标 -->
      <span
        class="icon"
        :class="suggestion.source"
      ></span>
      <!-- 命令文本 -->
      <span class="text">{{ suggestion.command }}</span>
      <span
        v-if="index === activeSuggestion"
        class="arrow-icon"
        title="按回车键补全命令"
      ></span>
    </div>
    <div class="keyboard-hints">
      <div class="hint-item">
        <kbd class="key esc-key">Esc</kbd>
        {{ $t('common.close') }}
      </div>
      <!-- 未进入选择模式：不允许确认，提示右键选中 -->
      <div
        v-if="!selectionMode"
        class="hint-item"
      >
        <div class="key-group">
          <kbd class="key">→</kbd>
        </div>
        {{ $t('common.rightArrowKey') }}
      </div>
      <div
        v-if="selectionMode"
        class="hint-item"
      >
        <div class="key-group">
          <kbd class="key">↑</kbd>
          <kbd class="key">↓</kbd>
        </div>
        {{ $t('common.select') }}
      </div>
      <!-- 仅当已有选中项时才显示确认 -->
      <div
        v-if="selectionMode && activeSuggestion >= 0"
        class="hint-item"
      >
        <kbd class="key enter-key">↵</kbd>
        {{ $t('common.confirm') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface CommandSuggestion {
  command: string
  source: 'base' | 'history'
}

const props = defineProps<{
  suggestions: CommandSuggestion[]
  uniqueKey: string
  activeSuggestion: number
  selectionMode: boolean
}>()

const updateSuggestionsPosition = (term) => {
  const hintBox = document.getElementById(props.uniqueKey)
  if (!hintBox) return
  const cursorX = term.buffer.active.cursorX
  const cursorY = term.buffer.active.cursorY
  // 获取终端字符的像素尺寸
  const charWidth = term._core._renderService.dimensions.css.cell.width
  const charHeight = term._core._renderService.dimensions.css.cell.height

  // 获取终端容器的尺寸
  const termContainer = term.element
  const containerHeight = termContainer.clientHeight

  // 计算光标在终端容器中的像素坐标
  const x = cursorX * charWidth
  const y = cursorY * charHeight

  // 计算提示框的高度
  const hintBoxHeight = hintBox.offsetHeight

  // 设置缓冲距离，避免遮挡命令内容
  const bufferDistance = charHeight * 0.2 // 0.2个字符高度的缓冲距离

  // 判断是否应该显示在光标上方（考虑缓冲距离）
  const shouldShowAbove = y + hintBoxHeight + bufferDistance > containerHeight

  // 设置提示框位置
  hintBox.style.left = `${x}px`
  hintBox.style.top = shouldShowAbove
    ? `${y - hintBoxHeight - bufferDistance}px` // 显示在光标上方，增加缓冲距离
    : `${y + charHeight + bufferDistance}px` // 显示在光标下方，增加缓冲距离
}
defineExpose({ updateSuggestionsPosition })
</script>
<style scoped lang="less">
.suggestions {
  position: absolute;
  /* 绝对定位 */
  background: var(--bg-color-quinary);
  color: var(--text-color-secondary);
  padding: 6px 8px 0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  font-family: monospace;
  z-index: 1000;
  max-width: 500px;
  border: 2px solid transparent;
  transition: border-color 0.2s ease-in-out;
  /* 确保提示框在终端内容上方 */
}

.suggestions.selection-mode {
  border-color: #52c41a;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
}

.suggestions div {
  padding: 0px;
  cursor: pointer;
  line-height: 1.2;
  font-size: 16px;
  height: auto;
  margin: 0;
}

.suggestions div.active {
  background: var(--bg-color-suggestion);
  border-radius: 4px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  min-width: 160px;
  min-height: 30px;
  margin: 0;
  padding: 0;
}

.suggestion-item:last-of-type {
  margin-bottom: -2px;
}

.suggestion-item .icon {
  width: 18px;
  height: 18px;
  margin-right: 8px;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 6px;
}

.suggestion-item .icon.base {
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FADB14"><path d="M4 4h16v2H4zm0 6h16v2H4zm0 6h16v2H4z"/></svg>')
    no-repeat center/contain;
}

.suggestion-item .icon.history {
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2374C0FC"><path d="M13 3a9 9 0 1 0 8.94 8H19.9A7 7 0 1 1 13 5v2l3-3-3-3v2zM12 8h1v6l5 3-.5.87L12 15V8z"/></svg>')
    no-repeat center/contain;
}

.text {
  flex: 1;
  font-size: 14px;
  color: var(--text-color-secondary) !important;
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
  max-width: 400px;
  line-height: 1.4;
  padding: 2px 0;
}

.arrow-icon {
  width: 20px;
  height: 20px;
  margin-left: 8px;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 5px;
  background: url('@/assets/icons/return-left.svg') no-repeat center/contain;
  filter: brightness(0) saturate(100%) invert(47%) sepia(79%) saturate(2476%) hue-rotate(86deg) brightness(118%) contrast(119%);
  opacity: 0.9;
  transition: all 0.15s ease;
}

.arrow-icon:hover {
  opacity: 1;
  transform: scale(1.05);
}

.keyboard-hints {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 0;
  margin: -4px 0 0 0;
  background: var(--bg-color-quinary);
  border-top: 1px solid var(--border-color-light);
  border-radius: 0 0 6px 6px;
  backdrop-filter: blur(8px);
  position: relative;
  height: 16px;
  line-height: 1;
}

.keyboard-hints::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--text-color-secondary);
  font-weight: 500;
  letter-spacing: 0.1px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  line-height: 1;
  transform: scale(0.6);
  transform-origin: center;
  margin: 0;
  padding: 0;
}

.hint-item:hover {
  color: var(--text-color-secondary-light);
}

.key-group {
  display: flex;
  gap: 1px;
}

.key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 4px;
  min-width: 16px;
  height: 14px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 9px;
  font-weight: 500;
  line-height: 1;
  text-align: center;
  color: var(--text-color-secondary);
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.key:hover {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.08) 100%);
  border-color: rgba(255, 255, 255, 0.18);
  color: var(--text-color-secondary-light);
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.key.enter-key {
  background: linear-gradient(145deg, rgba(82, 196, 26, 0.15) 0%, rgba(82, 196, 26, 0.08) 100%);
  border-color: rgba(82, 196, 26, 0.25);
  color: rgba(82, 196, 26, 0.85);
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(82, 196, 26, 0.1);
}

.key.enter-key:hover {
  background: linear-gradient(145deg, rgba(82, 196, 26, 0.22) 0%, rgba(82, 196, 26, 0.12) 100%);
  border-color: rgba(82, 196, 26, 0.35);
  color: rgba(82, 196, 26, 0.95);
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(82, 196, 26, 0.15);
}

.key.esc-key {
  background: linear-gradient(145deg, rgba(255, 77, 79, 0.12) 0%, rgba(255, 77, 79, 0.06) 100%);
  border-color: rgba(255, 77, 79, 0.2);
  color: rgba(255, 77, 79, 0.85);
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 77, 79, 0.08);
}

.key.esc-key:hover {
  background: linear-gradient(145deg, rgba(255, 77, 79, 0.18) 0%, rgba(255, 77, 79, 0.1) 100%);
  border-color: rgba(255, 77, 79, 0.3);
  color: rgba(255, 77, 79, 0.95);
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 77, 79, 0.12);
}
</style>
