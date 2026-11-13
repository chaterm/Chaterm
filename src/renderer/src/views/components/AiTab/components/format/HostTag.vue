<template>
  <span
    v-if="hostName || hostId"
    class="host-tag"
  >
    <span
      class="host-color-dot"
      :style="{ backgroundColor: colorTag || '#888' }"
    ></span>
    <span class="host-name">{{ hostName || hostId }}</span>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  hostId?: string
  hostName?: string
  colorTag?: string
}>()
</script>

<style scoped>
.host-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 1px 6px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.host-color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.host-name {
  font-size: 10px;
  color: #7e8ba3;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
