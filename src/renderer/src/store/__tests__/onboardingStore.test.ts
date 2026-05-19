import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { ONBOARDING_VERSION, onboardingModuleIds, useOnboardingStore } from '../onboardingStore'

describe('Onboarding Store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  const usePersistedPinia = () => {
    const pinia = createPinia()
    pinia.use(piniaPluginPersistedstate)
    createApp({}).use(pinia)
    setActivePinia(pinia)
  }

  it('starts with v2 guide tab and module state defaults', () => {
    const store = useOnboardingStore()

    expect(store.version).toBe(ONBOARDING_VERSION)
    expect(store.guideTabAutoOpened).toBe(false)
    expect(store.activeTour).toBeNull()
    expect(store.activeStepIndex).toBe(0)
    expect(store.completedCount).toBe(0)
    expect(store.totalCount).toBe(onboardingModuleIds.length)
  })

  it('tracks the first guide tab auto-open marker', () => {
    const store = useOnboardingStore()

    store.markGuideTabAutoOpened()

    expect(store.guideTabAutoOpened).toBe(true)
  })

  it('starts, advances, and stops a module tour', () => {
    const store = useOnboardingStore()

    store.startTour('interfaceGuide')
    store.setActiveStepIndex(2)

    expect(store.activeTour).toBe('interfaceGuide')
    expect(store.activeStepIndex).toBe(2)

    store.stopTour()

    expect(store.activeTour).toBeNull()
    expect(store.activeStepIndex).toBe(0)
  })

  it('tracks completed modules idempotently', () => {
    const store = useOnboardingStore()

    store.markModuleComplete('interfaceGuide')
    store.markModuleComplete('interfaceGuide')
    store.markModuleComplete('aiChat')

    expect(store.isModuleComplete('interfaceGuide')).toBe(true)
    expect(store.isModuleComplete('aiChat')).toBe(true)
    expect(store.completedCount).toBe(2)
  })

  it('resets all v2 onboarding state', () => {
    const store = useOnboardingStore()

    store.markGuideTabAutoOpened()
    store.startTour('systemSettings')
    store.setActiveStepIndex(3)
    store.markModuleComplete('systemSettings')
    store.resetOnboarding()

    expect(store.version).toBe(ONBOARDING_VERSION)
    expect(store.guideTabAutoOpened).toBe(false)
    expect(store.activeTour).toBeNull()
    expect(store.activeStepIndex).toBe(0)
    expect(store.completedCount).toBe(0)
  })

  it('migrates legacy v1 onboarding state to v2 defaults', () => {
    const store = useOnboardingStore()

    store.$patch({
      version: 1,
      guideTabAutoOpened: true,
      completedModules: undefined,
      activeTour: 'aiChat',
      activeStepIndex: 4
    } as any)

    store.ensureV2State()

    expect(store.version).toBe(ONBOARDING_VERSION)
    expect(store.guideTabAutoOpened).toBe(false)
    expect(store.activeTour).toBeNull()
    expect(store.activeStepIndex).toBe(0)
    expect(store.completedCount).toBe(0)
    expect(onboardingModuleIds.every((moduleId) => store.isModuleComplete(moduleId) === false)).toBe(true)
  })

  it('does not restore an in-progress tour from persisted state', () => {
    localStorage.setItem(
      'onboarding',
      JSON.stringify({
        version: ONBOARDING_VERSION,
        guideTabAutoOpened: true,
        completedModules: {
          interfaceGuide: true,
          systemSettings: false,
          addAndConnectHost: false,
          aiChat: false
        },
        activeTour: 'aiChat',
        activeStepIndex: 6
      })
    )
    usePersistedPinia()

    const store = useOnboardingStore()

    expect(store.guideTabAutoOpened).toBe(true)
    expect(store.isModuleComplete('interfaceGuide')).toBe(true)
    expect(store.activeTour).toBeNull()
    expect(store.activeStepIndex).toBe(0)
  })

  it('persists only stable onboarding progress fields', () => {
    usePersistedPinia()
    const store = useOnboardingStore()

    store.markGuideTabAutoOpened()
    store.markModuleComplete('aiChat')
    store.startTour('aiChat')
    store.setActiveStepIndex(6)
    store.$persist()

    const persisted = JSON.parse(localStorage.getItem('onboarding') || '{}')

    expect(persisted).toEqual({
      version: ONBOARDING_VERSION,
      guideTabAutoOpened: true,
      completedModules: {
        interfaceGuide: false,
        systemSettings: false,
        addAndConnectHost: false,
        aiChat: true
      }
    })
  })
})
