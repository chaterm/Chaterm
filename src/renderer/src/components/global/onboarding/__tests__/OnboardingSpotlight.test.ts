import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OnboardingSpotlight from '../OnboardingSpotlight.vue'
import { useOnboardingStore } from '@/store/onboardingStore'
import eventBus from '@/utils/eventBus'

vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string, params?: Record<string, number>) => {
        if (key === 'onboarding.spotlight.progress') return `${params?.current}/${params?.total}`
        return key
      }
    }
  }
}))

vi.mock('../onboardingActions', () => ({
  prepareOnboardingStep: vi.fn()
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))

describe('OnboardingSpotlight', () => {
  let wrapper: VueWrapper<any> | null = null
  let target: HTMLButtonElement | null = null
  let pinia: ReturnType<typeof createPinia>

  const mountSpotlight = () =>
    mount(OnboardingSpotlight, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-button': {
            template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
            props: ['disabled'],
            emits: ['click']
          }
        }
      }
    })

  beforeEach(() => {
    vi.useFakeTimers()
    pinia = createPinia()
    setActivePinia(pinia)
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    target?.remove()
    target = null
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('locates the active step target and renders four masks', async () => {
    target = document.createElement('button')
    target.dataset.onboardingId = 'left-module-switcher'
    target.scrollIntoView = vi.fn()
    target.getBoundingClientRect = () =>
      ({
        top: 40,
        left: 20,
        width: 48,
        height: 300,
        right: 68,
        bottom: 340,
        x: 20,
        y: 40,
        toJSON: () => ({})
      }) as DOMRect
    document.body.appendChild(target)

    const store = useOnboardingStore()
    store.startTour('interfaceGuide')
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    expect(wrapper.findAll('.spotlight-mask')).toHaveLength(4)
    expect(wrapper.find('.spotlight-highlight').exists()).toBe(true)
    expect(wrapper.find('.fallback-text').exists()).toBe(false)
  })

  it('does not render the previous button on the first step', async () => {
    target = document.createElement('button')
    target.dataset.onboardingId = 'left-module-switcher'
    target.scrollIntoView = vi.fn()
    target.getBoundingClientRect = () =>
      ({
        top: 40,
        left: 20,
        width: 48,
        height: 300,
        right: 68,
        bottom: 340,
        x: 20,
        y: 40,
        toJSON: () => ({})
      }) as DOMRect
    document.body.appendChild(target)

    const store = useOnboardingStore()
    store.startTour('interfaceGuide')
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    expect(wrapper.text()).not.toContain('onboarding.spotlight.previous')
    expect(wrapper.text()).toContain('onboarding.spotlight.next')
    expect(wrapper.findAll('button')).toHaveLength(2)
  })

  it('shows fallback content when the target is missing', async () => {
    const store = useOnboardingStore()
    store.startTour('interfaceGuide')
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    expect(wrapper.find('.spotlight-mask-full').exists()).toBe(true)
    expect(wrapper.text()).toContain('onboarding.spotlight.targetMissing')
  })

  it('places the card outside a large target when side space is available', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })
    target = document.createElement('button')
    target.dataset.onboardingId = 'left-module-switcher'
    target.scrollIntoView = vi.fn()
    target.getBoundingClientRect = () =>
      ({
        top: 160,
        left: 80,
        width: 420,
        height: 360,
        right: 500,
        bottom: 520,
        x: 80,
        y: 160,
        toJSON: () => ({})
      }) as DOMRect
    document.body.appendChild(target)

    const store = useOnboardingStore()
    store.startTour('interfaceGuide')
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    const cardLeft = parseFloat((wrapper.find('.spotlight-card').element as HTMLElement).style.left)

    expect(cardLeft).toBeGreaterThanOrEqual(520)
  })

  it('moves backward and forward through steps', async () => {
    const store = useOnboardingStore()
    store.startTour('interfaceGuide')
    store.setActiveStepIndex(1)
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    const buttons = wrapper.findAll('button')
    await buttons[1].trigger('click')
    expect(store.activeStepIndex).toBe(0)

    await buttons[2].trigger('click')
    expect(store.activeStepIndex).toBe(1)
  })

  it('hides the card and advances when a target-click step is clicked', async () => {
    target = document.createElement('button')
    target.dataset.onboardingId = 'settings-background-preset'
    target.scrollIntoView = vi.fn()
    target.getBoundingClientRect = () =>
      ({
        top: 180,
        left: 760,
        width: 120,
        height: 70,
        right: 880,
        bottom: 250,
        x: 760,
        y: 180,
        toJSON: () => ({})
      }) as DOMRect
    document.body.appendChild(target)

    const store = useOnboardingStore()
    store.startTour('systemSettings')
    store.setActiveStepIndex(4)
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    expect(wrapper.find('.spotlight-highlight').exists()).toBe(true)
    expect(wrapper.find('.spotlight-card').exists()).toBe(false)

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.runOnlyPendingTimersAsync()

    expect(store.activeStepIndex).toBe(5)
  })

  it('highlights the mode selector and forwards mask clicks to the Agent option row', async () => {
    target = document.createElement('button')
    target.dataset.onboardingId = 'ai-mode-select'
    target.scrollIntoView = vi.fn()
    target.getBoundingClientRect = () =>
      ({
        top: 720,
        left: 760,
        width: 80,
        height: 32,
        right: 840,
        bottom: 752,
        x: 760,
        y: 720,
        toJSON: () => ({})
      }) as DOMRect
    document.body.appendChild(target)

    const option = document.createElement('div')
    option.className = 'ant-select-item-option'
    option.scrollIntoView = vi.fn()
    option.getBoundingClientRect = () =>
      ({
        top: 180,
        left: 760,
        width: 160,
        height: 32,
        right: 920,
        bottom: 212,
        x: 760,
        y: 180,
        toJSON: () => ({})
      }) as DOMRect

    const label = document.createElement('span')
    label.dataset.onboardingId = 'ai-mode-agent-option'
    option.appendChild(label)
    document.body.appendChild(option)
    const optionClick = vi.fn()
    option.addEventListener('click', optionClick)

    const store = useOnboardingStore()
    store.startTour('aiChat')
    store.setActiveStepIndex(3)
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    expect(wrapper.findAll('button')).toHaveLength(3)

    await wrapper.find('.spotlight-mask').trigger('click', { clientX: 780, clientY: 190 })
    await vi.runOnlyPendingTimersAsync()

    expect(optionClick).toHaveBeenCalled()
    expect(store.activeStepIndex).toBe(4)
    option.remove()
  })

  it('advances when the AI model option is selected on mouse down', async () => {
    const option = document.createElement('div')
    option.className = 'ant-select-item-option'
    option.scrollIntoView = vi.fn()
    option.getBoundingClientRect = () =>
      ({
        top: 180,
        left: 760,
        width: 160,
        height: 32,
        right: 920,
        bottom: 212,
        x: 760,
        y: 180,
        toJSON: () => ({})
      }) as DOMRect

    const label = document.createElement('span')
    label.dataset.onboardingId = 'ai-model-option'
    option.appendChild(label)
    document.body.appendChild(option)

    const store = useOnboardingStore()
    store.startTour('aiChat')
    store.setActiveStepIndex(5)
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await vi.runOnlyPendingTimersAsync()

    expect(store.activeStepIndex).toBe(6)
    option.remove()
  })

  it('finishes the system settings tour when auto approval is enabled on the final step', async () => {
    const store = useOnboardingStore()
    store.startTour('systemSettings')
    store.setActiveStepIndex(9)
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    const onCalls = (eventBus.on as unknown as { mock: { calls: Array<[string, () => void]> } }).mock.calls
    const autoApprovalHandler = onCalls.find(([eventName]) => eventName === 'onboarding:autoApprovalEnabled')?.[1]

    autoApprovalHandler?.()

    expect(store.isModuleComplete('systemSettings')).toBe(true)
    expect(store.activeTour).toBeNull()
  })

  it('requires clicking the send target for the AI chat final step', async () => {
    target = document.createElement('button')
    target.dataset.onboardingId = 'ai-send-button'
    target.scrollIntoView = vi.fn()
    target.getBoundingClientRect = () =>
      ({
        top: 720,
        left: 1180,
        width: 32,
        height: 32,
        right: 1212,
        bottom: 752,
        x: 1180,
        y: 720,
        toJSON: () => ({})
      }) as DOMRect
    document.body.appendChild(target)

    const store = useOnboardingStore()
    store.startTour('aiChat')
    store.setActiveStepIndex(9)
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    expect(wrapper.findAll('button')).toHaveLength(2)

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.runOnlyPendingTimersAsync()

    expect(store.isModuleComplete('aiChat')).toBe(true)
    expect(store.activeTour).toBeNull()
  })

  it('advances the AI chat entry step from the left AI toggle', async () => {
    target = document.createElement('button')
    target.dataset.onboardingId = 'right-ai-toggle'
    target.scrollIntoView = vi.fn()
    target.getBoundingClientRect = () =>
      ({
        top: 20,
        left: 1180,
        width: 32,
        height: 32,
        right: 1212,
        bottom: 52,
        x: 1180,
        y: 20,
        toJSON: () => ({})
      }) as DOMRect
    document.body.appendChild(target)

    const leftAiToggle = document.createElement('button')
    leftAiToggle.dataset.onboardingId = 'left-ai-toggle'
    leftAiToggle.getBoundingClientRect = () =>
      ({
        top: 620,
        left: 12,
        width: 28,
        height: 28,
        right: 40,
        bottom: 648,
        x: 12,
        y: 620,
        toJSON: () => ({})
      }) as DOMRect
    document.body.appendChild(leftAiToggle)

    const store = useOnboardingStore()
    store.startTour('aiChat')
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    expect(wrapper.findAll('.spotlight-highlight')).toHaveLength(2)
    expect(wrapper.find('.spotlight-highlight-secondary').exists()).toBe(true)

    leftAiToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.runOnlyPendingTimersAsync()

    expect(store.activeStepIndex).toBe(1)
    leftAiToggle.remove()
  })

  it('marks non-host modules complete when finishing the last step', async () => {
    const store = useOnboardingStore()
    store.startTour('interfaceGuide')
    store.setActiveStepIndex(5)
    wrapper = mountSpotlight()
    await vi.runAllTimersAsync()

    const buttons = wrapper.findAll('button')
    await buttons[2].trigger('click')

    expect(store.isModuleComplete('interfaceGuide')).toBe(true)
    expect(store.activeTour).toBeNull()
  })
})
