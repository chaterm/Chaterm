<template>
  <div class="about-container">
    <a-card
      :bordered="false"
      class="about-card"
    >
      <img
        class="about-logo"
        src="@/assets/logo.svg"
      />
      <div class="about-title">Chaterm</div>
      <div class="about-description">{{ t('about.version') }} {{ appInfo.version }}</div>
      <div class="about-description">Copyright © 2025 Chaterm.ai All rights reserved.</div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import i18n from '@/locales'
const { t } = i18n.global

const appInfo = {
  ...__APP_INFO__
}
</script>

<style scoped>
.about-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
}
.about-card {
  background-color: var(--bg-color);
  color: var(--text-color);
  border-radius: 8px;
  text-align: center;
  box-shadow: none;
}
.about-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 4px;
  color: var(--text-color);
}
.about-description {
  font-size: 12px;
  margin-bottom: 4px;
  color: var(--text-color-secondary);
}
.about-logo {
  text-align: center;
  justify-content: center;
  margin-bottom: 10px;
  width: 62px;
  height: 62px;
}
</style>
