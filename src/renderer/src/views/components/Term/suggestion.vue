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
    >
      {{ suggestion }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue'
const props = defineProps({
  suggestions: {
    type: Array,
    default: () => {
      return []
    }
  },
  uniqueKey: {
    type: String,
    default: () => {
      return ''
    }
  },
  activeSuggestion: {
    type: Number,
    default: () => {
      return 0
    }
  }
})
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
  background: #333;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: monospace;
  z-index: 1000;
  /* 确保提示框在终端内容上方 */
}

.suggestions div {
  padding: 5px;
  cursor: pointer;
}

.suggestions div.active {
  background: #555;
}
</style>
