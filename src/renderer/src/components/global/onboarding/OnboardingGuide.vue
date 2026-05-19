<template>
  <div class="onboarding-guide">
    <div class="guide-header">
      <div>
        <h2>{{ t('onboarding.guide.title') }}</h2>
        <p>{{ t('onboarding.guide.description') }}</p>
      </div>
    </div>

    <div class="progress-line">
      {{ t('onboarding.guide.progress', { completed: onboardingStore.completedCount, total: onboardingStore.totalCount }) }}
    </div>

    <div class="module-grid">
      <button
        v-for="module in modules"
        :key="module.id"
        type="button"
        class="module-card"
        :class="{ complete: onboardingStore.isModuleComplete(module.id) }"
        @click="startModule(module.id)"
      >
        <span class="module-icon">
          <component :is="module.icon" />
        </span>
        <span class="module-copy">
          <strong>{{ module.title }}</strong>
          <span>{{ module.description }}</span>
        </span>
        <CheckCircleOutlined
          v-if="onboardingStore.isModuleComplete(module.id)"
          class="complete-icon"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { CheckCircleOutlined, DesktopOutlined, MessageOutlined, SettingOutlined, ApiOutlined } from '@ant-design/icons-vue'
import i18n from '@/locales'
import { useOnboardingStore, type OnboardingModuleId } from '@/store/onboardingStore'
import { startOnboardingTour } from './onboardingActions'

const { t } = i18n.global
const onboardingStore = useOnboardingStore()

const modules = computed(() => [
  {
    id: 'interfaceGuide' as OnboardingModuleId,
    title: t('onboarding.modules.interfaceGuide.title'),
    description: t('onboarding.modules.interfaceGuide.description'),
    icon: DesktopOutlined
  },
  {
    id: 'systemSettings' as OnboardingModuleId,
    title: t('onboarding.modules.systemSettings.title'),
    description: t('onboarding.modules.systemSettings.description'),
    icon: SettingOutlined
  },
  {
    id: 'addAndConnectHost' as OnboardingModuleId,
    title: t('onboarding.modules.addAndConnectHost.title'),
    description: t('onboarding.modules.addAndConnectHost.description'),
    icon: ApiOutlined
  },
  {
    id: 'aiChat' as OnboardingModuleId,
    title: t('onboarding.modules.aiChat.title'),
    description: t('onboarding.modules.aiChat.description'),
    icon: MessageOutlined
  }
])

const startModule = (moduleId: OnboardingModuleId) => {
  window.setTimeout(() => startOnboardingTour(moduleId), 80)
}

onMounted(() => {
  onboardingStore.ensureV2State()
})
</script>

<style lang="less" scoped>
.onboarding-guide {
  width: 100%;
  height: 100%;
  padding: 28px 32px;
  overflow: auto;
  color: var(--text-color);
  background: var(--bg-color);
}

.guide-header {
  max-width: 920px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;

  h2 {
    margin: 6px 0 8px;
    color: var(--text-color);
    font-size: 28px;
    line-height: 1.25;
  }

  p {
    margin: 0;
    color: var(--text-color-secondary);
    font-size: 14px;
    line-height: 1.6;
  }
}

.progress-line {
  margin: 20px 0 14px;
  color: var(--text-color-tertiary);
  font-size: 13px;
}

.module-grid {
  max-width: 980px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.module-card {
  position: relative;
  min-height: 132px;
  padding: 18px;
  display: flex;
  gap: 14px;
  align-items: flex-start;
  text-align: left;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-color);
  background: var(--bg-color-secondary);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease;

  &:hover {
    border-color: var(--button-bg-color);
    background: var(--hover-bg-color);
  }

  &.complete {
    border-color: rgba(82, 196, 26, 0.45);
  }
}

.module-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--text-color);
  background: var(--bg-color);
  font-size: 18px;
}

.module-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;

  strong {
    color: var(--text-color);
    font-size: 16px;
    line-height: 1.35;
  }

  span {
    color: var(--text-color-secondary);
    font-size: 13px;
    line-height: 1.55;
  }
}

.complete-icon {
  position: absolute;
  top: 14px;
  right: 14px;
  color: #52c41a;
}

@media (max-width: 820px) {
  .module-grid {
    grid-template-columns: 1fr;
  }
}
</style>
