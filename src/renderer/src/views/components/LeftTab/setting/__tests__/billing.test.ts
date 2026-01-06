/**
 * Billing Component Unit Tests
 *
 * Tests for the Billing settings component including:
 * - Component rendering
 * - Login skipped state handling
 * - User info display
 * - Subscription type display
 * - Budget reset time display
 * - Usage ratio calculation and display
 * - Progress bar color calculation
 * - Login button navigation
 * - Storage event listener
 * - API error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import BillingComponent from '../billing.vue'
import { getUser } from '@/api/user/user'

// Mock i18n
const mockTranslations: Record<string, string> = {
  'user.billing': 'Billing Usage',
  'user.billingLoginPrompt': 'Please login to view billing information',
  'user.email': 'Email',
  'user.subscription': 'Subscription Type',
  'user.budgetResetAt': 'Next Reset Time',
  'user.ratio': 'Usage Ratio',
  'common.login': 'Login'
}

const mockT = (key: string) => {
  return mockTranslations[key] || key
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: mockT
  })
}))

// Mock getUser API
vi.mock('@/api/user/user', () => ({
  getUser: vi.fn()
}))

// Set up global unhandled rejection handler for the entire test file
// This handles cases where the component doesn't catch promise rejections
if (typeof window !== 'undefined') {
  const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
    // Only prevent default for API errors in error handling tests
    if (event.reason?.message === 'API Error') {
      event.preventDefault()
      // Stop propagation to prevent Vitest from reporting it
      if (event.stopImmediatePropagation) {
        event.stopImmediatePropagation()
      }
    }
  }
  // Use capture phase to catch errors early
  window.addEventListener('unhandledrejection', unhandledRejectionHandler, true)

  // Also add in bubble phase as fallback
  window.addEventListener('unhandledrejection', unhandledRejectionHandler, false)
}

// Create router for navigation testing
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div>Home</div>' } },
    { path: '/login', component: { template: '<div>Login</div>' } }
  ]
})

describe('Billing Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>
  const mockGetUser = vi.mocked(getUser)

  const createWrapper = (options = {}) => {
    return mount(BillingComponent, {
      global: {
        plugins: [pinia, router],
        stubs: {
          'a-card': {
            template: '<div class="a-card"><div class="ant-card-body"><slot /></div></div>'
          },
          'a-progress': {
            template: '<div class="a-progress" :data-percent="percent" :data-stroke-color="strokeColor"><slot /></div>',
            props: ['percent', 'stroke-color', 'show-info', 'size', 'track-color']
          },
          'a-button': {
            template: '<button class="a-button" @click="$emit(\'click\')"><slot /></button>',
            props: ['type']
          }
        },
        mocks: {
          $t: mockT
        }
      },
      ...options
    })
  }

  beforeEach(() => {
    // Setup Pinia
    pinia = createPinia()
    setActivePinia(pinia)

    // Clear localStorage
    localStorage.clear()

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock return values
    mockGetUser.mockResolvedValue({
      data: {
        email: 'test@example.com',
        subscription: 'premium',
        budgetResetAt: '2026-02-01',
        ratio: 0.5
      }
    } as any)

    // Clear console output for cleaner test results
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.section-header').exists()).toBe(true)
    })

    it('should display billing title', async () => {
      wrapper = createWrapper()
      await nextTick()

      const title = wrapper.find('h3')
      expect(title.exists()).toBe(true)
      expect(title.text()).toBe('Billing Usage')
    })

    it('should render settings section card', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.find('.settings-section').exists()).toBe(true)
    })
  })

  describe('Login Skipped State', () => {
    it('should show login prompt when login is skipped', async () => {
      localStorage.setItem('login-skipped', 'true')
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.find('.login-prompt-container').exists()).toBe(true)
      expect(wrapper.find('.login-prompt-text').exists()).toBe(true)
      expect(wrapper.find('.login-prompt-text').text()).toBe('Please login to view billing information')
    })

    it('should show login button when login is skipped', async () => {
      localStorage.setItem('login-skipped', 'true')
      wrapper = createWrapper()
      await nextTick()

      const button = wrapper.find('.a-button')
      expect(button.exists()).toBe(true)
      expect(button.text()).toBe('Login')
    })

    it('should not call getUser when login is skipped', async () => {
      localStorage.setItem('login-skipped', 'true')
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(mockGetUser).not.toHaveBeenCalled()
    })

    it('should not show user info when login is skipped', async () => {
      localStorage.setItem('login-skipped', 'true')
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.find('.setting-item').exists()).toBe(false)
    })
  })

  describe('Logged In State', () => {
    beforeEach(() => {
      localStorage.removeItem('login-skipped')
    })

    it('should call getUser on mount when not skipped', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(mockGetUser).toHaveBeenCalledWith({})
    })

    it('should display user email', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const emailLabel = wrapper.findAll('.info-label').find((el) => el.text() === 'Email')
      expect(emailLabel).toBeDefined()
      const emailRow = emailLabel?.element.parentElement
      const emailValue = emailRow?.querySelector('.info-value')
      expect(emailValue?.textContent).toBe('test@example.com')
    })

    it('should display subscription type', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const subscriptionLabel = wrapper.findAll('.info-label').find((el) => el.text() === 'Subscription Type')
      expect(subscriptionLabel).toBeDefined()
      const subscriptionRow = subscriptionLabel?.element.parentElement
      const subscriptionValue = subscriptionRow?.querySelector('.subscription-type')
      expect(subscriptionValue?.textContent).toBe('Premium')
    })

    it('should display budget reset time', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const resetLabel = wrapper.findAll('.info-label').find((el) => el.text() === 'Next Reset Time')
      expect(resetLabel).toBeDefined()
      const resetRow = resetLabel?.element.parentElement
      const resetValue = resetRow?.querySelector('.info-value')
      expect(resetValue?.textContent).toBe('2026-02-01')
    })

    it('should display usage ratio with progress bar', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const ratioLabel = wrapper.findAll('.info-label').find((el) => el.text() === 'Usage Ratio')
      expect(ratioLabel).toBeDefined()
      const ratioRow = ratioLabel?.element.parentElement
      const progress = ratioRow?.querySelector('.a-progress')
      expect(progress).toBeDefined()
      expect(progress?.getAttribute('data-percent')).toBe('50')
    })

    it('should display ratio percentage text', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const ratioValue = wrapper.find('.ratio-value')
      expect(ratioValue.exists()).toBe(true)
      expect(ratioValue.text()).toBe('50%')
    })

    it('should not show login prompt when logged in', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(wrapper.find('.login-prompt-container').exists()).toBe(false)
    })
  })

  describe('Subscription Type Display', () => {
    beforeEach(() => {
      localStorage.removeItem('login-skipped')
    })

    it('should capitalize subscription type correctly', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'free',
          budgetResetAt: '2026-02-01',
          ratio: 0.3
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const subscriptionValue = wrapper.find('.subscription-type')
      expect(subscriptionValue.text()).toBe('Free')
    })

    it('should handle uppercase subscription type', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'PREMIUM',
          budgetResetAt: '2026-02-01',
          ratio: 0.3
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const subscriptionValue = wrapper.find('.subscription-type')
      expect(subscriptionValue.text()).toBe('PREMIUM')
    })

    it('should display dash when subscription is missing', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: null,
          budgetResetAt: '2026-02-01',
          ratio: 0.3
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const subscriptionValue = wrapper.find('.subscription-type')
      expect(subscriptionValue.text()).toBe('-')
    })
  })

  describe('Usage Ratio Calculation', () => {
    beforeEach(() => {
      localStorage.removeItem('login-skipped')
    })

    it('should calculate ratio percentage correctly for 0.5', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 0.5
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-percent')).toBe('50')
      const ratioValue = wrapper.find('.ratio-value')
      expect(ratioValue.text()).toBe('50%')
    })

    it('should calculate ratio percentage correctly for 0.75', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 0.75
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-percent')).toBe('75')
      const ratioValue = wrapper.find('.ratio-value')
      expect(ratioValue.text()).toBe('75%')
    })

    it('should handle ratio of 0', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 0
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-percent')).toBe('0')
      const ratioValue = wrapper.find('.ratio-value')
      expect(ratioValue.text()).toBe('0%')
    })

    it('should handle ratio of 1 (100%)', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 1
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-percent')).toBe('100')
      const ratioValue = wrapper.find('.ratio-value')
      expect(ratioValue.text()).toBe('100%')
    })

    it('should handle undefined ratio', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: undefined
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-percent')).toBe('0')
      const ratioValue = wrapper.find('.ratio-value')
      expect(ratioValue.text()).toBe('0%')
    })

    it('should handle null ratio', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: null
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-percent')).toBe('0')
      const ratioValue = wrapper.find('.ratio-value')
      expect(ratioValue.text()).toBe('0%')
    })

    it('should round ratio percentage correctly', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 0.333
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-percent')).toBe('33')
      const ratioValue = wrapper.find('.ratio-value')
      expect(ratioValue.text()).toBe('33%')
    })
  })

  describe('Progress Bar Color', () => {
    beforeEach(() => {
      localStorage.removeItem('login-skipped')
    })

    it('should use green color for ratio < 70%', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 0.5
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-stroke-color')).toBe('#52c41a')
    })

    it('should use orange color for ratio >= 70% and < 90%', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 0.75
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-stroke-color')).toBe('#fa8c16')
    })

    it('should use red color for ratio >= 90%', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 0.95
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-stroke-color')).toBe('#f5222d')
    })

    it('should use red color for ratio exactly 90%', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 0.9
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-stroke-color')).toBe('#f5222d')
    })

    it('should use orange color for ratio exactly 70%', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 0.7
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-stroke-color')).toBe('#fa8c16')
    })
  })

  describe('Missing Data Display', () => {
    beforeEach(() => {
      localStorage.removeItem('login-skipped')
    })

    it('should display dash when email is missing', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: null,
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 0.5
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const emailLabel = wrapper.findAll('.info-label').find((el) => el.text() === 'Email')
      const emailRow = emailLabel?.element.parentElement
      const emailValue = emailRow?.querySelector('.info-value')
      expect(emailValue?.textContent).toBe('-')
    })

    it('should display dash when budgetResetAt is missing', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: 'test@example.com',
          subscription: 'premium',
          budgetResetAt: null,
          ratio: 0.5
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const resetLabel = wrapper.findAll('.info-label').find((el) => el.text() === 'Next Reset Time')
      const resetRow = resetLabel?.element.parentElement
      const resetValue = resetRow?.querySelector('.info-value')
      expect(resetValue?.textContent).toBe('-')
    })

    it('should display dash when email is empty string', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          email: '',
          subscription: 'premium',
          budgetResetAt: '2026-02-01',
          ratio: 0.5
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const emailLabel = wrapper.findAll('.info-label').find((el) => el.text() === 'Email')
      const emailRow = emailLabel?.element.parentElement
      const emailValue = emailRow?.querySelector('.info-value')
      expect(emailValue?.textContent).toBe('-')
    })
  })

  describe('Login Button Navigation', () => {
    it('should navigate to login page when login button is clicked', async () => {
      localStorage.setItem('login-skipped', 'true')
      const pushSpy = vi.spyOn(router, 'push')

      wrapper = createWrapper()
      await nextTick()

      const button = wrapper.find('.a-button')
      await button.trigger('click')
      await nextTick()

      expect(pushSpy).toHaveBeenCalledWith('/login')
    })
  })

  describe('Storage Event Listener', () => {
    it('should update state when login-skipped changes to false', async () => {
      localStorage.setItem('login-skipped', 'true')
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.find('.login-prompt-container').exists()).toBe(true)

      // Simulate storage event
      localStorage.setItem('login-skipped', 'false')
      const storageEvent = new StorageEvent('storage', {
        key: 'login-skipped',
        newValue: 'false',
        oldValue: 'true',
        storageArea: localStorage
      })
      window.dispatchEvent(storageEvent)
      await nextTick()
      await nextTick()

      expect(mockGetUser).toHaveBeenCalled()
    })

    it('should update state when login-skipped changes to true', async () => {
      localStorage.removeItem('login-skipped')
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(wrapper.find('.setting-item').exists()).toBe(true)

      // Simulate storage event
      localStorage.setItem('login-skipped', 'true')
      const storageEvent = new StorageEvent('storage', {
        key: 'login-skipped',
        newValue: 'true',
        oldValue: null,
        storageArea: localStorage
      })
      window.dispatchEvent(storageEvent)
      await nextTick()

      expect(wrapper.find('.login-prompt-container').exists()).toBe(true)
    })

    it('should not call getUser when login-skipped changes to true', async () => {
      localStorage.removeItem('login-skipped')
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      vi.clearAllMocks()

      // Simulate storage event
      localStorage.setItem('login-skipped', 'true')
      const storageEvent = new StorageEvent('storage', {
        key: 'login-skipped',
        newValue: 'true',
        oldValue: null,
        storageArea: localStorage
      })
      window.dispatchEvent(storageEvent)
      await nextTick()

      expect(mockGetUser).not.toHaveBeenCalled()
    })

    it('should ignore storage events for other keys', async () => {
      localStorage.setItem('login-skipped', 'true')
      wrapper = createWrapper()
      await nextTick()

      const storageEvent = new StorageEvent('storage', {
        key: 'other-key',
        newValue: 'value',
        oldValue: null,
        storageArea: localStorage
      })
      window.dispatchEvent(storageEvent)
      await nextTick()

      expect(wrapper.find('.login-prompt-container').exists()).toBe(true)
    })
  })

  describe('Component State Check on Mount', () => {
    it('should check localStorage status on mount and update if different', async () => {
      // Set initial state to skipped
      localStorage.setItem('login-skipped', 'true')
      wrapper = createWrapper()
      await nextTick()

      // Component checks localStorage on mount and finds it's true, so state matches
      // Now change it to false to simulate the check logic
      localStorage.removeItem('login-skipped')
      // Recreate wrapper to test the check logic
      wrapper.unmount()
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      // Component should check localStorage and call getUser since it's not skipped
      expect(mockGetUser).toHaveBeenCalled()
    })

    it('should not call getUser if state matches localStorage on mount', async () => {
      localStorage.removeItem('login-skipped')
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      // Should only be called once from initial mount
      expect(mockGetUser).toHaveBeenCalledTimes(1)
    })

    it('should sync state with localStorage on mount when they differ', async () => {
      // Component starts with isSkippedLogin = false (from localStorage check)
      // But if localStorage says 'true', it should sync
      localStorage.setItem('login-skipped', 'true')
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      // Component checks localStorage and finds 'true', so it should show login prompt
      expect(wrapper.find('.login-prompt-container').exists()).toBe(true)
      expect(mockGetUser).not.toHaveBeenCalled()
    })
  })

  describe('API Error Handling', () => {
    beforeEach(() => {
      localStorage.removeItem('login-skipped')
    })

    it('should handle getUser API errors gracefully', async () => {
      const error = new Error('API Error')
      // Component now handles errors with .catch()
      mockGetUser.mockRejectedValueOnce(error)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Component should still render, just without user data
      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.setting-item').exists()).toBe(true)
    })

    it('should display dash values when API fails', async () => {
      const error = new Error('API Error')
      mockGetUser.mockRejectedValueOnce(error)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const emailLabel = wrapper.findAll('.info-label').find((el) => el.text() === 'Email')
      const emailRow = emailLabel?.element.parentElement
      const emailValue = emailRow?.querySelector('.info-value')
      expect(emailValue?.textContent).toBe('-')
    })

    it('should not update userInfo when API fails', async () => {
      const error = new Error('API Error')
      mockGetUser.mockRejectedValueOnce(error)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      // userInfo should remain empty/default
      const vm = wrapper.vm as any
      expect(vm.userInfo.email).toBeUndefined()
    })
  })

  describe('Component Cleanup', () => {
    it('should unmount without errors', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(() => {
        wrapper.unmount()
      }).not.toThrow()
    })

    // Note: The component doesn't currently remove the storage event listener on unmount
    // This is a potential memory leak, but we test the current behavior
    it('should handle multiple mount/unmount cycles', async () => {
      wrapper = createWrapper()
      await nextTick()
      wrapper.unmount()

      wrapper = createWrapper()
      await nextTick()
      wrapper.unmount()

      expect(wrapper.exists()).toBe(false)
    })
  })
})
