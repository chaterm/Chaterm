<template>
  <div
    v-if="suggestions.length"
    :id="uniqueKey"
    class="suggestions"
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
      <!-- 右箭头图标，仅在选中时显示 -->
      <span
        v-if="index === activeSuggestion"
        class="arrow-icon"
        title="按右箭头键补全命令"
      ></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, PropType } from 'vue'

interface CommandSuggestion {
  command: string
  source: 'base' | 'history'
}

const props = defineProps<{
  suggestions: CommandSuggestion[]
  uniqueKey: string
  activeSuggestion: number
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

  // 判断是否应该显示在光标上方
  const shouldShowAbove = y + hintBoxHeight > containerHeight

  // 设置提示框位置
  hintBox.style.left = `${x}px`
  hintBox.style.top = shouldShowAbove
    ? `${y - hintBoxHeight}px` // 显示在光标上方
    : `${y + charHeight}px` // 显示在光标下方
}
defineExpose({ updateSuggestionsPosition })
</script>
<style scoped lang="less">
.suggestions {
  position: absolute;
  /* 绝对定位 */
  background: rgba(51, 51, 51, 0.95);
  color: #f2f2f2;
  padding: 6px 8px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  font-family: monospace;
  z-index: 1000;
  /* 确保提示框在终端内容上方 */
}

.suggestions div {
  padding: 4px 8px;
  cursor: pointer;
  line-height: 1.2;
  font-size: 16px;
  height: 30px;
}

.suggestions div.active {
  background: #4a6b8a;
  border-radius: 4px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  min-width: 160px;
  height: 30px;
  min-height: 30px;
}

.suggestion-item .icon {
  width: 18px;
  height: 18px;
  margin-right: 0;
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
}

.arrow-icon {
  width: 22px;
  height: 22px;
  margin-left: 8px;
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2352c41a"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>')
    no-repeat center/contain;
  opacity: 0.9;
}
</style>
