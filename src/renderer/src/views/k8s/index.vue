<template>
  <div class="k8s-view">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useK8sStore } from '@/store/k8sStore'

const k8sStore = useK8sStore()

onMounted(async () => {
  await k8sStore.initialize()
})
</script>

<style scoped>
.k8s-view {
  height: 100%;
  width: 100%;
}
</style>
