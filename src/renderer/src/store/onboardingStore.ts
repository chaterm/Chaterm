import { defineStore } from 'pinia'

export const ONBOARDING_VERSION = 2

export type OnboardingModuleId = 'interfaceGuide' | 'systemSettings' | 'addAndConnectHost' | 'aiChat'

export type OnboardingTargetId =
  | 'left-module-switcher'
  | 'left-function-panel'
  | 'main-workspace'
  | 'main-workspace-tabs'
  | 'top-layout-controls'
  | 'right-ai-toggle'
  | 'left-ai-toggle'
  | 'right-ai-sidebar'
  | 'setting-entry'
  | 'settings-side-nav'
  | 'settings-general-content'
  | 'settings-background-section'
  | 'settings-background-preset'
  | 'settings-terminal-tab'
  | 'settings-terminal-options'
  | 'settings-ai-preferences-tab'
  | 'settings-ai-preferences-content'
  | 'settings-ai-auto-approval'
  | 'assets-entry'
  | 'host-management-entry'
  | 'asset-new-host-button'
  | 'asset-form-fields'
  | 'asset-form-submit'
  | 'asset-card'
  | 'ai-input'
  | 'ai-mode-select'
  | 'ai-mode-agent-option'
  | 'ai-model-select'
  | 'ai-model-option'
  | 'ai-context-trigger'
  | 'ai-context-hosts-menu'
  | 'ai-localhost-option'
  | 'ai-send-button'
  | 'ai-model-settings-button'

export interface OnboardingTourStep {
  id: string
  targetId: OnboardingTargetId
  titleKey: string
  descriptionKey: string
  hideCard?: boolean
  highlightTargetIds?: OnboardingTargetId[]
  advanceOnTargetClick?: boolean
  advanceOnTargetIds?: OnboardingTargetId[]
  advanceOnEvent?: 'onboarding:autoApprovalEnabled'
  requiresTargetClick?: boolean
  allowNextWithoutTargetClick?: boolean
}

type CompletedModules = Record<OnboardingModuleId, boolean>

const createDefaultCompletedModules = (): CompletedModules => ({
  interfaceGuide: false,
  systemSettings: false,
  addAndConnectHost: false,
  aiChat: false
})

export const onboardingModuleIds: OnboardingModuleId[] = ['interfaceGuide', 'systemSettings', 'addAndConnectHost', 'aiChat']

export const useOnboardingStore = defineStore('onboarding', {
  state: () => ({
    version: ONBOARDING_VERSION,
    guideTabAutoOpened: false,
    completedModules: createDefaultCompletedModules(),
    activeTour: null as OnboardingModuleId | null,
    activeStepIndex: 0
  }),
  getters: {
    completedCount: (state): number => onboardingModuleIds.filter((moduleId) => state.completedModules[moduleId]).length,
    totalCount: (): number => onboardingModuleIds.length,
    isModuleComplete:
      (state) =>
      (moduleId: OnboardingModuleId): boolean =>
        Boolean(state.completedModules[moduleId])
  },
  actions: {
    ensureV2State() {
      const hasCompleteModuleState =
        this.completedModules && onboardingModuleIds.every((moduleId) => typeof this.completedModules[moduleId] === 'boolean')

      if (this.version === ONBOARDING_VERSION && hasCompleteModuleState) return

      this.version = ONBOARDING_VERSION
      this.guideTabAutoOpened = false
      this.completedModules = createDefaultCompletedModules()
      this.activeTour = null
      this.activeStepIndex = 0
    },
    markGuideTabAutoOpened() {
      this.guideTabAutoOpened = true
    },
    startTour(moduleId: OnboardingModuleId) {
      this.activeTour = moduleId
      this.activeStepIndex = 0
    },
    setActiveStepIndex(index: number) {
      this.activeStepIndex = Math.max(0, index)
    },
    stopTour() {
      this.activeTour = null
      this.activeStepIndex = 0
    },
    markModuleComplete(moduleId: OnboardingModuleId) {
      this.completedModules = {
        ...this.completedModules,
        [moduleId]: true
      }
    },
    resetOnboarding() {
      this.version = ONBOARDING_VERSION
      this.guideTabAutoOpened = false
      this.completedModules = createDefaultCompletedModules()
      this.activeTour = null
      this.activeStepIndex = 0
    }
  },
  persist: {
    pick: ['version', 'guideTabAutoOpened', 'completedModules']
  }
})
