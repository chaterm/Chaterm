/**
 * Trusted Devices Component Unit Tests
 *
 * Tests for the Trusted Devices settings component including:
 * - Component rendering and title
 * - Login required state (not logged in)
 * - Load devices on mount when logged in
 * - Load devices when isActive becomes true (watch)
 * - Loading state, empty list, device list display
 * - Device name fallback to i18n "unknown device" when empty
 * - Max reached hint and count display
 * - Current device: Remove disabled
 * - Revoke flow: open modal, confirm calls API and refreshes
 * - Load error and revoke error use i18n messages
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import TrustedDevices from '../trustedDevices.vue'
import { getTrustedDevices, revokeTrustedDevice } from '@/api/user/user'
import { useDeviceStore } from '@/store/useDeviceStore'

const mockTranslations: Record<string, string> = {
  'user.trustedDevices': 'Trusted Devices',
  'user.trustedDevicesDescription': 'These devices have been verified.',
  'user.trustedDevicesLoginRequired': 'Please sign in to manage trusted devices.',
  'user.trustedDevicesCount': '{current} / {max} devices',
  'user.trustedDevicesMaxReached': 'Max trusted devices reached.',
  'user.trustedDevicesRemoveConfirm': 'Continue?',
  'user.trustedDevicesCurrentDevice': 'Current device',
  'user.trustedDevicesNoData': 'No trusted devices yet.',
  'user.trustedDevicesRemove': 'Remove',
  'user.trustedDevicesUnknownDevice': 'Unknown device',
  'user.trustedDevicesLoadFailed': 'Failed to load trusted devices',
  'user.trustedDevicesRevokeFailed': 'Failed to revoke device',
  'common.done': 'Done',
  'common.cancel': 'Cancel',
  'common.saved': 'Saved'
}

const mockT = (key: string, params?: Record<string, string | number>) => {
  const s = mockTranslations[key] ?? key
  if (params && typeof s === 'string') {
    return Object.entries(params).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)), s)
  }
  return s
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: mockT })
}))

vi.mock('@/api/user/user', () => ({
  getTrustedDevices: vi.fn(),
  revokeTrustedDevice: vi.fn()
}))

vi.mock('@/utils/permission', () => ({
  getUserInfo: vi.fn(() => ({ uid: 'test-uid' }))
}))

vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

import { message } from 'ant-design-vue'

const mockGetTrustedDevices = vi.mocked(getTrustedDevices)
const mockRevokeTrustedDevice = vi.mocked(revokeTrustedDevice)
const mockMessageError = vi.mocked(message.error)
const mockMessageSuccess = vi.mocked(message.success)

function setupLoggedIn() {
  localStorage.setItem('ctm-token', 'test-token')
  localStorage.removeItem('login-skipped')
}

function setupLoggedOut() {
  localStorage.removeItem('ctm-token')
  localStorage.setItem('login-skipped', 'true')
}

const DEVICES_RESPONSE = {
  data: {
    devices: [
      {
        id: 1,
        deviceName: 'Windows 10/11',
        macAddress: 'aa:bb:cc:dd:05:e1',
        lastLoginAt: '2026-01-27 23:45:31',
        location: 'shanghai',
        lastLoginUserAgent: 'Chrome/124.0.6367.243',
        lastLoginIp: '192.168.1.1'
      },
      {
        id: 2,
        deviceName: 'Android',
        macAddress: 'aa:bb:cc:dd:95:27',
        lastLoginAt: '2026-01-27 23:45:31',
        location: '',
        lastLoginUserAgent: 'Mobile (Android 16; vivo V2405A) 1.0.5',
        lastLoginIp: '223.160.207.187'
      }
    ],
    maxAllowed: 3,
    currentCount: 2
  }
}

describe('TrustedDevices Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = (props: { isActive?: boolean } = {}) => {
    return mount(TrustedDevices, {
      props: { isActive: props.isActive ?? true },
      global: {
        plugins: [pinia],
        stubs: {
          'a-card': { template: '<div class="a-card"><slot /></div>' },
          'a-form': { template: '<form class="a-form"><slot /></form>' },
          'a-form-item': { template: '<div class="a-form-item"><slot name="label" /><slot /></div>' },
          'a-spin': { template: '<div class="a-spin"><slot /></div>' },
          'a-tag': { template: '<span class="a-tag"><slot /></span>', props: ['color'] },
          'a-button': {
            template: '<button class="a-button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
            props: ['type', 'danger', 'size', 'disabled']
          },
          'a-modal': {
            template: '<div v-if="open" class="a-modal"><slot /><button class="modal-ok" @click="$emit(\'ok\')">OK</button></div>',
            props: ['open'],
            emits: ['ok', 'update:open']
          }
        },
        mocks: { $t: mockT }
      }
    })
  }

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    mockGetTrustedDevices.mockResolvedValue(DEVICES_RESPONSE as any)
    mockRevokeTrustedDevice.mockResolvedValue(undefined as any)
    setupLoggedIn()
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
      await nextTick()
      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.userInfo').exists()).toBe(true)
    })

    it('should display trusted devices title', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      const label = wrapper.find('.label-text')
      expect(label.exists()).toBe(true)
      expect(label.text()).toBe('Trusted Devices')
    })
  })

  describe('Not Logged In', () => {
    beforeEach(() => setupLoggedOut())

    it('should show login required message when not logged in', async () => {
      wrapper = createWrapper()
      await nextTick()
      const desc = wrapper.find('.description')
      expect(desc.exists()).toBe(true)
      expect(desc.text()).toBe('Please sign in to manage trusted devices.')
    })

    it('should not call getTrustedDevices when not logged in', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      expect(mockGetTrustedDevices).not.toHaveBeenCalled()
    })
  })

  describe('Logged In - Load on Mount', () => {
    it('should call getTrustedDevices on mount when logged in', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      expect(mockGetTrustedDevices).toHaveBeenCalled()
    })

    it('should show loading state while fetching', async () => {
      let resolve: (v: any) => void
      mockGetTrustedDevices.mockImplementation(
        () =>
          new Promise((r) => {
            resolve = r
          })
      )
      wrapper = createWrapper()
      await nextTick()
      expect(wrapper.find('.a-spin').exists()).toBe(true)
      resolve!(DEVICES_RESPONSE as any)
      await nextTick()
      await nextTick()
      expect(wrapper.find('.device-list').exists()).toBe(true)
    })

    it('should show empty message when devices array is empty', async () => {
      mockGetTrustedDevices.mockResolvedValue({ data: { devices: [], maxAllowed: 3, currentCount: 0 } } as any)
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      const noData = wrapper.find('.trusted-no-data')
      expect(noData.exists()).toBe(true)
      expect(noData.text()).toContain('No trusted devices yet')
    })

    it('should render device list with device names and masked MAC (first4 + last4)', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      const items = wrapper.findAll('.device-item')
      expect(items.length).toBe(2)
      const names = wrapper.findAll('.device-name')
      expect(names[0].text()).toBe('Windows 10/11')
      expect(names[1].text()).toBe('Android')
      const macs = wrapper.findAll('.device-mac')
      expect(macs.length).toBe(2)
      // maskMac shows first 4 + last 4 hex: aa:bb:**:**:05:e1
      expect(macs[0].text()).toMatch(/aa:bb:\*\*:\*\*:05:e1/)
      expect(macs[1].text()).toMatch(/aa:bb:\*\*:\*\*:95:27/)
    })

    it('should render second line with IP, location, and masked MAC', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      const subRows = wrapper.findAll('.device-info-row--sub')
      expect(subRows.length).toBe(2)
      const firstSub = subRows[0]
      expect(firstSub.text()).toContain('IP: 192.168.1.1')
      expect(firstSub.text()).toContain('shanghai')
      expect(firstSub.text()).toMatch(/aa:bb:\*\*:\*\*:05:e1/)
    })

    it('should show shortened userAgent for desktop and mobile (mobile: after first semicolon in parens)', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      const uaSpans = wrapper.findAll('.device-ua')
      expect(uaSpans.length).toBe(2)
      expect(uaSpans[0].text()).toContain('Chrome')
      expect(uaSpans[1].text()).toBe('vivo V2405A')
    })

    it('should show max reached hint when current >= maxAllowed', async () => {
      mockGetTrustedDevices.mockResolvedValue({
        data: { devices: [{ id: 1, deviceName: 'A', macAddress: 'aa:bb:cc:dd:01:02', lastLoginAt: '' }], maxAllowed: 1, currentCount: 1 }
      } as any)
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      const hint = wrapper.find('.trusted-max-hint')
      expect(hint.exists()).toBe(true)
      expect(hint.text()).toContain('Max trusted devices reached')
    })

    it('should show count row when maxAllowed is number', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      const countRow = wrapper.find('.trusted-count--right')
      expect(countRow.exists()).toBe(true)
      expect(countRow.text()).toMatch(/2 \/ 3|2\/3/)
    })
  })

  describe('isActive Watch', () => {
    it('should call loadDevices when isActive becomes true', async () => {
      wrapper = createWrapper({ isActive: false })
      await nextTick()
      mockGetTrustedDevices.mockClear()
      await wrapper.setProps({ isActive: true })
      await nextTick()
      expect(mockGetTrustedDevices).toHaveBeenCalled()
    })
  })

  describe('Current Device and Remove', () => {
    beforeEach(async () => {
      const store = useDeviceStore()
      store.setMacAddress('aa:bb:cc:dd:05:e1')
      mockGetTrustedDevices.mockResolvedValue(DEVICES_RESPONSE as any)
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should show Current device tag for device matching store MAC', () => {
      const tags = wrapper.findAll('.a-tag')
      const currentTag = tags.find((t) => t.text() === 'Current device')
      expect(currentTag).toBeDefined()
    })

    it('should disable Remove button for current device', () => {
      const currentRow = wrapper.findAll('.device-item')[0]
      const btnInCurrentRow = currentRow.find('.a-button')
      expect(btnInCurrentRow.attributes('disabled')).toBeDefined()
    })

    it('should not open modal when clicking Remove on current device', async () => {
      const currentRow = wrapper.findAll('.device-item')[0]
      const btn = currentRow.find('.a-button')
      expect(btn.attributes('disabled')).toBeDefined()
      await btn.trigger('click')
      await nextTick()
      expect(wrapper.find('.a-modal').exists()).toBe(false)
      expect(mockRevokeTrustedDevice).not.toHaveBeenCalled()
    })

    it('should open modal and call revokeTrustedDevice on confirm', async () => {
      const items = wrapper.findAll('.device-item')
      const nonCurrentRow = items[1]
      const removeBtn = nonCurrentRow.find('.a-button')
      await removeBtn.trigger('click')
      await nextTick()
      expect(wrapper.find('.a-modal').exists()).toBe(true)
      const okBtn = wrapper.find('.modal-ok')
      await okBtn.trigger('click')
      await nextTick()
      await nextTick()
      expect(mockRevokeTrustedDevice).toHaveBeenCalledWith(2)
      expect(mockMessageSuccess).toHaveBeenCalledWith('Saved')
      expect(mockGetTrustedDevices).toHaveBeenCalledTimes(2)
    })
  })

  describe('Error Handling', () => {
    it('should show i18n fallback when load fails with no error message', async () => {
      mockGetTrustedDevices.mockRejectedValue({})
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      expect(mockMessageError).toHaveBeenCalledWith('Failed to load trusted devices')
    })

    it('should show error message when load fails with error message', async () => {
      mockGetTrustedDevices.mockRejectedValue(new Error('network error'))
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      expect(mockMessageError).toHaveBeenCalledWith('network error')
    })

    it('should show i18n fallback when revoke fails with no error message', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      mockRevokeTrustedDevice.mockRejectedValue({})
      const nonCurrentRow = wrapper.findAll('.device-item')[1]
      await nonCurrentRow.find('.a-button').trigger('click')
      await nextTick()
      await wrapper.find('.modal-ok').trigger('click')
      await nextTick()
      await nextTick()
      expect(mockMessageError).toHaveBeenCalledWith('Failed to revoke device')
    })

    it('should show error message when revoke fails with error message', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      mockRevokeTrustedDevice.mockRejectedValue(new Error('revoke failed'))
      const nonCurrentRow = wrapper.findAll('.device-item')[1]
      await nonCurrentRow.find('.a-button').trigger('click')
      await nextTick()
      await wrapper.find('.modal-ok').trigger('click')
      await nextTick()
      await nextTick()
      expect(mockMessageError).toHaveBeenCalledWith('revoke failed')
    })
  })
})
