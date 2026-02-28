<template>
  <div
    v-if="suggestions.length || aiLoading"
    :id="uniqueKey"
    :class="['suggestions', { 'selection-mode': selectionMode }]"
    @mousedown.prevent
  >
    <div class="suggestion-list">
      <!-- AI loading indicator - shown at top of list -->
      <div
        v-if="aiLoading"
        class="suggestion-item ai-loading-item"
      >
        <span class="icon ai ai-loading-icon"></span>
        <span class="text ai-text ai-loading-text">AI Thinking</span>
        <span class="ai-loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </span>
      </div>
      <div
        v-for="(suggestion, index) in suggestions"
        :key="index"
        :class="{ active: index === activeSuggestion }"
        class="suggestion-item"
      >
        <!-- Icon -->
        <span
          class="icon"
          :class="suggestion.source"
        ></span>
        <!-- Command text -->
        <span
          class="text"
          :class="{ 'ai-text': suggestion.source === 'ai' }"
          >{{ suggestion.command }}</span
        >
        <span
          v-if="suggestion.source === 'ai' && suggestion.explanation"
          class="text explanation-text"
        >
          - AI: {{ suggestion.explanation }}</span
        >
      </div>
    </div>
    <span
      v-if="activeSuggestion >= 0 && selectionMode"
      class="arrow-icon"
      :style="{ top: `${(activeSuggestion + (aiLoading ? 1 : 0)) * 30 + 3}px` }"
      title="Press Enter to complete command"
    ></span>
    <div class="keyboard-hints">
      <div class="hint-item">
        <kbd class="key esc-key">esc</kbd>
        <span class="hint-label">{{ $t('common.close') }}</span>
      </div>
      <!-- Not in selection mode: confirmation not allowed, prompt to select with right arrow -->
      <div
        v-if="!selectionMode"
        class="hint-item"
      >
        <kbd class="key">→</kbd>
        <span class="hint-label">{{ $t('common.rightArrowKey') }}</span>
      </div>
      <div
        v-if="selectionMode"
        class="hint-item"
      >
        <kbd class="key">↑</kbd>
        <kbd class="key">↓</kbd>
        <span class="hint-label">{{ $t('common.select') }}</span>
      </div>
      <!-- Only show confirmation when there is a selected item -->
      <div
        v-if="selectionMode && activeSuggestion >= 0"
        class="hint-item"
      >
        <kbd class="key enter-key">↵</kbd>
        <span class="hint-label">{{ $t('common.confirm') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CommandSuggestion } from '../types/suggestion'

const props = defineProps<{
  suggestions: CommandSuggestion[]
  uniqueKey: string
  activeSuggestion: number
  selectionMode: boolean
  aiLoading: boolean
}>()

const updateSuggestionsPosition = (term) => {
  const hintBox = document.getElementById(props.uniqueKey)
  if (!hintBox) return
  const cursorX = term.buffer.active.cursorX
  const cursorY = term.buffer.active.cursorY
  // Get terminal character pixel dimensions
  const charWidth = term._core._renderService.dimensions.css.cell.width
  const charHeight = term._core._renderService.dimensions.css.cell.height

  // Get terminal container dimensions
  const termContainer = term.element
  const containerHeight = termContainer.clientHeight

  // Calculate cursor pixel coordinates in terminal container
  const x = cursorX * charWidth
  const y = cursorY * charHeight

  // Calculate hint box height
  const hintBoxHeight = hintBox.offsetHeight

  // Set buffer distance to avoid obscuring command content
  const bufferDistance = charHeight * 0.2 // 0.2 character height buffer distance

  // Determine if should display above cursor (considering buffer distance)
  const shouldShowAbove = y + hintBoxHeight + bufferDistance > containerHeight

  // Set hint box position
  hintBox.style.left = `${x}px`
  hintBox.style.top = shouldShowAbove
    ? `${y - hintBoxHeight - bufferDistance}px` // Display above cursor, add buffer distance
    : `${y + charHeight + bufferDistance}px` // Display below cursor, add buffer distance
}
defineExpose({ updateSuggestionsPosition })
</script>
<style scoped lang="less">
/* Suggestion panel container - positioned absolutely relative to terminal cursor */
.suggestions {
  position: absolute;
  background: var(--bg-color-quinary);
  color: var(--text-color-secondary);
  padding: 0 8px 0px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  font-family: monospace;
  z-index: 1000;
  max-width: 400px;
  overflow: hidden;
  border: 2px solid transparent;
  transition: border-color 0.2s ease-in-out;
}

/* Green border highlight when in keyboard selection mode */
.suggestions.selection-mode {
  border-color: #52c41a;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
}

/* Base styles for suggestion list items */
.suggestion-list div {
  padding: 0px;
  cursor: pointer;
  line-height: 1.2;
  font-size: 16px;
  height: auto;
  margin: 0;
}

/* Highlight background for the currently active/selected item */
.suggestion-list div.active {
  background: var(--bg-color-suggestion);
  border-radius: 4px;
}

/* Scrollable list container - horizontal scroll for long commands, no vertical scroll */
.suggestion-list {
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
}

/* Individual suggestion row layout */
.suggestion-item {
  display: flex;
  align-items: center;
  min-width: 160px;
  min-height: 30px;
  margin: 0;
  padding: 0;
  flex-shrink: 0;
}

/* Last suggestion item - no extra bottom margin */
.suggestion-item:last-of-type {
  margin-bottom: 0;
}

/* Source type icon (base command / history) */
.suggestion-item .icon {
  width: 18px;
  height: 18px;
  margin-right: 8px;
  flex-shrink: 0;
}

/* Icon for base/built-in commands - yellow list icon */
.suggestion-item .icon.base {
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FADB14"><path d="M4 4h16v2H4zm0 6h16v2H4zm0 6h16v2H4z"/></svg>')
    no-repeat center/contain;
}

/* Icon for history commands - blue clock icon */
.suggestion-item .icon.history {
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2374C0FC"><path d="M13 3a9 9 0 1 0 8.94 8H19.9A7 7 0 1 1 13 5v2l3-3-3-3v2zM12 8h1v6l5 3-.5.87L12 15V8z"/></svg>')
    no-repeat center/contain;
}

/* Icon for AI-generated suggestions - sparkle style icon */
.suggestion-item .icon.ai {
  width: 19px;
  height: 19px;
  background-color: #b37feb;
  -webkit-mask: url('@/assets/icons/thinking.svg') no-repeat center/contain;
  mask: url('@/assets/icons/thinking.svg') no-repeat center/contain;
  filter: drop-shadow(0 0 6px rgba(179, 127, 235, 0.55));
}

/* Command text - single line with horizontal scroll instead of wrapping */
.text {
  flex: 1;
  font-size: 14px;
  color: var(--text-color-secondary) !important;
  white-space: nowrap;
  letter-spacing: 0.6px;
  line-height: 1.4;
  padding: 2px 0;
}

.text.ai-text {
  color: #b37feb !important;
}

.text.explanation-text {
  flex: 0;
  font-size: 12px;
  color: var(--text-color-secondary) !important;
  letter-spacing: 0.2px;
}

/* AI loading indicator styles */
.ai-loading-item {
  opacity: 0.8;
}

.ai-loading-icon {
  animation: ai-icon-pulse 1.5s ease-in-out infinite;
}

.ai-loading-text {
  flex: 0 !important;
  margin-right: 2px;
}

.ai-loading-dots {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 2px;
}

.ai-loading-dots .dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #b37feb;
  animation: ai-dot-bounce 1.4s ease-in-out infinite;
}

.ai-loading-dots .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.ai-loading-dots .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes ai-dot-bounce {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes ai-icon-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

/* Enter/return icon - absolutely positioned to stay visible at the right edge
   even when the command text is scrolled horizontally.
   Uses background color to avoid overlap with long command text underneath. */
.arrow-icon {
  position: absolute;
  right: 10px;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  background: var(--bg-color-suggestion);
  border-radius: 4px;
  transition: all 0.15s ease;
  pointer-events: none;
}

/* Pseudo-element for the actual arrow SVG icon.
   Separated from parent so the green color filter does not affect the background. */
.arrow-icon::after {
  content: '';
  position: absolute;
  inset: 2px;
  background: url('@/assets/icons/return-left.svg') no-repeat center/contain;
  filter: brightness(0) saturate(100%) invert(47%) sepia(79%) saturate(2476%) hue-rotate(86deg) brightness(118%) contrast(119%);
  opacity: 0.9;
}

.arrow-icon:hover::after {
  opacity: 1;
  transform: scale(1.05);
}

/* Keyboard shortcuts hint bar at the bottom */
.keyboard-hints {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 5px 10px 3px;
  margin-top: 0;
  background: var(--bg-color-quinary);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0 0 6px 6px;
  position: sticky;
  left: 0;
  height: auto;
  line-height: 1;
}

/* Individual hint item */
.hint-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1;
  margin: 0;
  padding: 0;
}

/* Keyboard key badge */
.key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 5px;
  min-width: 18px;
  height: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
}

/* Enter key - green accent */
.key.enter-key {
  background: rgba(82, 196, 26, 0.15);
  border-color: rgba(82, 196, 26, 0.3);
  color: rgba(82, 196, 26, 0.9);
}

/* Esc key - red accent */
.key.esc-key {
  background: rgba(255, 77, 79, 0.1);
  border-color: rgba(255, 77, 79, 0.25);
  color: rgba(255, 77, 79, 0.85);
}

/* Label text next to keys */
.hint-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.2px;
}
</style>

<!-- Non-scoped styles: scrollbar customization requires global selectors
     because ::-webkit-scrollbar pseudo-elements don't work with scoped attributes -->
<style lang="less">
/* Custom horizontal scrollbar for the suggestion list */
.terminal-container .suggestions .suggestion-list::-webkit-scrollbar {
  height: 6px !important;
  width: auto !important;
}

.terminal-container .suggestions .suggestion-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color) !important;
  border: none !important;
  border-radius: 3px !important;
}

.terminal-container .suggestions .suggestion-list::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color) !important;
}

.terminal-container .suggestions .suggestion-list::-webkit-scrollbar-track {
  background: var(--scrollbar-track-color) !important;
  border-radius: 3px !important;
}

/* Improve readability when terminal uses custom background image */
body.has-custom-bg.theme-dark .terminal-container .suggestions,
.theme-dark body.has-custom-bg .terminal-container .suggestions {
  background: rgba(37, 37, 38, 0.9) !important;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-color: rgba(255, 255, 255, 0.12) !important;
}

body.has-custom-bg.theme-light .terminal-container .suggestions,
.theme-light body.has-custom-bg .terminal-container .suggestions {
  background: rgba(243, 243, 243, 0.9) !important;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-color: rgba(0, 0, 0, 0.12) !important;
}
</style>
