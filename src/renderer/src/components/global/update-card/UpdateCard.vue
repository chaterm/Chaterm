<template>
  <Transition name="update-slide">
    <div
      v-if="visible"
      class="update-card-container"
      data-testid="update-card"
    >
      <div class="update-card">
        <div class="card-header">
          <h3 class="card-title">{{ t('update.cardTitle') }}</h3>
          <button
            class="update-card-close"
            :aria-label="t('common.close')"
            @click="store.dismissCard"
          >
            <CloseOutlined />
          </button>
        </div>
        <div class="card-body">
          <p class="card-text">{{ t('update.cardReady', { version: store.version }) }}</p>
          <a
            class="release-notes-link"
            :href="releaseNotesUrl"
            target="_blank"
            rel="noopener noreferrer"
            >{{ t('update.releaseNotes') }}</a
          >
          <button
            class="update-card-action"
            @click="store.install"
          >
            {{ t('update.update') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CloseOutlined } from '@ant-design/icons-vue'
import { useUpdateStore } from '@/store/updateStore'
import { useVersionPromptStore } from '@/store/versionPromptStore'

const RELEASE_TAG_URL = 'https://github.com/chaterm/Chaterm/releases/tag/v'

const { t } = useI18n()
const store = useUpdateStore()
const versionPromptStore = useVersionPromptStore()

const visible = computed(() => store.cardVisible && !versionPromptStore.modalVisible)
const releaseNotesUrl = computed(() => `${RELEASE_TAG_URL}${store.version}`)
</script>

<style scoped>
.update-card-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  pointer-events: none;
}

.update-card {
  width: 400px;
  background: var(--bg-color);
  border-radius: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--border-color);
  overflow: hidden;
  pointer-events: auto;
  backdrop-filter: blur(10px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(to bottom, var(--bg-color), var(--bg-color-secondary));
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  line-height: 1;
}

.update-card-close {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
  font-size: 13px;
}

.update-card-close:hover {
  background: var(--bg-color-octonary);
  color: var(--text-color);
}

.update-card-close:active {
  transform: scale(0.95);
}

.card-body {
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.card-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color-secondary);
}

.release-notes-link {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-primary, #1890ff);
  text-decoration: none;
  transition: all 0.2s ease;
}

.release-notes-link:hover {
  color: var(--color-primary-hover, #40a9ff);
}

.update-card-action {
  width: 100%;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: var(--button-bg-color);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.update-card-action:hover {
  background: var(--button-hover-bg);
}

.update-slide-enter-active {
  animation: updateSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.update-slide-leave-active {
  animation: updateSlideOut 0.3s cubic-bezier(0.4, 0, 1, 1);
}

@keyframes updateSlideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes updateSlideOut {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}
</style>
