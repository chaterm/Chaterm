<template>
  <svg
    :class="svgClass"
    aria-hidden="true"
    :style="{ width, height }"
  >
    <use
      :xlink:href="iconName"
      :fill="color"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  color: { type: String, default: 'currentColor' },
  width: { type: String, default: '1em' },
  height: { type: String, default: '1em' },
  svgClass: { type: String, default: 'svg-icon-active' }
})

const iconName = computed(() => `#icon-${props.name}`)
</script>

<style lang="less">
.svg-icon {
  vertical-align: middle;
  opacity: 0.45;
  &:hover {
    opacity: 1;
  }
}

.svg-icon-active {
  vertical-align: middle;
  opacity: 1;
}
use {
  fill: currentColor !important;
}
</style>
