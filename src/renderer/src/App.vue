<template>
  <router-view></router-view>
  <MfaDialog />
  <UserSelectionDialog />
</template>
<script setup lang="ts">
import { onMounted } from 'vue'
import { MfaDialog, setupGlobalMfaListeners } from './components/global/mfa'
import { UserSelectionDialog, setupGlobalUserSelectionListeners } from './components/global/user-selection'

onMounted(() => {
  setupGlobalMfaListeners()
  setupGlobalUserSelectionListeners()
})
</script>
<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  height: 100vh;
  width: 100%;
  overflow: hidden;
  margin: 0;
}
</style>
