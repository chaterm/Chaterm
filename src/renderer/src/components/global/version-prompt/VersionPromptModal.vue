<template>
  <Transition name="version-slide">
    <div
      v-if="store.modalVisible"
      class="version-prompt-container"
    >
      <div class="version-prompt-card">
        <!-- Header -->
        <div class="card-header">
          <div class="header-content">
            <h3 class="version-title">Chaterm {{ store.prompt?.version }}</h3>
            <span
              v-if="store.prompt?.releaseDate"
              class="version-date"
              >{{ store.prompt.releaseDate }}</span
            >
          </div>
          <button
            class="close-btn"
            :title="t('common.close')"
            @click="store.acknowledge"
          >
            <CloseOutlined />
          </button>
        </div>

        <!-- Content -->
        <div class="card-body">
          <div class="highlights-section">
            <h4 class="section-title">{{ t('versionPrompt.highlights') }}</h4>
            <ul class="highlights-list">
              <li
                v-for="(item, index) in store.prompt?.highlights"
                :key="index"
                class="highlight-item"
              >
                <span class="highlight-icon">
                  <CheckCircleFilled />
                </span>
                <span class="highlight-text">{{ item }}</span>
              </li>
            </ul>
          </div>

          <!-- Release Notes Link -->
          <div
            v-if="store.prompt?.releaseNotesUrl"
            class="release-notes-section"
          >
            <a
              :href="store.prompt.releaseNotesUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="release-notes-link"
            >
              {{ t('versionPrompt.viewReleaseNotes') }}
              <span class="link-arrow">→</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { CloseOutlined, CheckCircleFilled } from '@ant-design/icons-vue'
import { useVersionPromptStore } from '@/store/versionPromptStore'

const props = defineProps<{
  store: ReturnType<typeof useVersionPromptStore>
}>()

const { t } = useI18n()
const { store } = props
</script>

<style scoped>
/* Container - Fixed positioning at bottom-right */
.version-prompt-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  pointer-events: none;
}

/* Card - Main notification card */
.version-prompt-card {
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

/* Header */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(to bottom, var(--bg-color), var(--bg-color-secondary));
}

.header-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.version-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  line-height: 1;
}

.version-date {
  font-size: 13px;
  color: var(--text-color-secondary);
  font-weight: 400;
  line-height: 1;
}

/* Close Button */
.close-btn {
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

.close-btn:hover {
  background: var(--bg-color-octonary);
  color: var(--text-color);
}

.close-btn:active {
  transform: scale(0.95);
}

/* Body */
.card-body {
  padding: 14px 18px 18px;
}

.highlights-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.highlights-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.highlight-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.highlight-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #52c41a;
  font-size: 14px;
  margin-top: 1px;
}

.highlight-text {
  flex: 1;
}

/* Release Notes Link */
.release-notes-section {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}

.release-notes-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-primary, #1890ff);
  text-decoration: none;
  transition: all 0.2s ease;
  padding: 4px 0;
}

.release-notes-link:hover {
  color: var(--color-primary-hover, #40a9ff);
  gap: 8px;
}

.link-arrow {
  transition: transform 0.2s ease;
  font-size: 14px;
}

.release-notes-link:hover .link-arrow {
  transform: translateX(2px);
}

/* Animations */
.version-slide-enter-active {
  animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.version-slide-leave-active {
  animation: slideOutRight 0.3s cubic-bezier(0.4, 0, 1, 1);
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOutRight {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}

/* Responsive */
@media (max-width: 768px) {
  .version-prompt-container {
    bottom: 10px;
    right: 10px;
    left: 10px;
  }

  .version-prompt-card {
    width: auto;
  }
}

/* Dark mode optimization */
@media (prefers-color-scheme: dark) {
  .version-prompt-card {
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.3),
      0 2px 8px rgba(0, 0, 0, 0.2);
  }
}
</style>
