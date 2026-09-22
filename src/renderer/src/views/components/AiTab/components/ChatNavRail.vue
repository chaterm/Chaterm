<template>
  <div
    ref="railEl"
    class="chat-nav-rail"
    :aria-label="t('ai.navRailLabel')"
  >
    <button
      v-for="marker in markers"
      :key="marker.ts"
      type="button"
      class="nav-rail-marker"
      :class="{ 'is-active': marker.pairIndex >= 0 && marker.pairIndex === activePairIndex }"
      :aria-label="`${t('ai.navRailUserTurn')}: ${marker.label}`"
      @click="$emit('jump', marker)"
      @mouseenter="onMarkerEnter($event, marker.ts)"
      @mouseleave="hoveredTs = null"
      @focus="onMarkerEnter($event, marker.ts)"
      @blur="hoveredTs = null"
    >
      <span class="nav-rail-marker-line" />
    </button>

    <div
      v-if="hoveredMarker"
      class="nav-rail-preview"
      :style="{ top: `${previewTop}px` }"
    >
      {{ hoveredMarker.label }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatNavNode } from '../composables/useChatNavRail'

const { t } = useI18n()

const props = defineProps<{
  markers: ChatNavNode[]
  activePairIndex: number
}>()

defineEmits<{
  jump: [marker: ChatNavNode]
}>()

/** Half of the preview card's max height, used to keep it inside the rail. */
const PREVIEW_HALF_HEIGHT = 44

const railEl = ref<HTMLElement | null>(null)
const hoveredTs = ref<number | null>(null)

const hoveredMarker = computed(() => props.markers.find((m) => m.ts === hoveredTs.value) ?? null)

const previewTop = computed(() => {
  const railHeight = railEl.value?.clientHeight ?? 0
  if (railHeight <= PREVIEW_HALF_HEIGHT * 2) return hoveredCenter.value
  return Math.min(railHeight - PREVIEW_HALF_HEIGHT, Math.max(PREVIEW_HALF_HEIGHT, hoveredCenter.value))
})

const hoveredCenter = ref(0)

const onMarkerEnter = (event: Event, ts: number) => {
  const button = event.currentTarget as HTMLElement | null
  if (button) hoveredCenter.value = button.offsetTop + button.offsetHeight / 2
  hoveredTs.value = ts
}
</script>

<style scoped lang="less">
.chat-nav-rail {
  position: absolute;
  // Sit just left of the native scrollbar so dragging it still works.
  right: 10px;
  top: 14px;
  bottom: 14px;
  width: 12px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  // Keep the marker group centred in the rail instead of piled at the top.
  justify-content: center;
  // Only the markers themselves capture input, so text selection keeps working.
  pointer-events: none;
  // No overflow clipping here: the hover card is a child positioned outside the
  // 12px column, and `hidden` would clip it away entirely.
}

.nav-rail-marker {
  position: relative;
  // Even pitch, shrinking proportionally once the outline outgrows the rail.
  flex: 0 1 10px;
  min-height: 0;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  display: flex;
  align-items: center;

  &:focus-visible {
    outline: 1px solid var(--text-color-tertiary);
    outline-offset: 1px;
  }
}

.nav-rail-marker-line {
  display: block;
  height: 2px;
  border-radius: 1px;
  width: 12px;
  background: var(--text-color-secondary);
  opacity: 0.55;
  transition:
    opacity 0.12s ease,
    background-color 0.12s ease;
}

.nav-rail-marker.is-active .nav-rail-marker-line,
.nav-rail-marker:hover .nav-rail-marker-line {
  opacity: 1;
}

.nav-rail-preview {
  position: absolute;
  right: 100%;
  margin-right: 6px;
  transform: translateY(-50%);
  width: 260px;
  padding: 6px 9px;
  border-radius: 6px;
  // --card-bg instead of --bg-color-secondary: the latter is rewritten to
  // rgba(..., --custom-opacity) under a background image, which let the message
  // text behind the card show through. --card-bg stays opaque in every theme.
  background: var(--card-bg);
  border: 1px solid var(--border-color-light);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-color);
  pointer-events: none;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
</style>
