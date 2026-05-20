/**
 * Shortcuts Settings Component Unit Tests
 *
 * Tests for the Shortcuts settings component including:
 * - Loading shortcuts on mount
 * - Rendering action rows and key chips
 * - Starting / cancelling shortcut recording
 * - Recording keyboard combinations (regular and modifier-only)
 * - Saving recordings (success, validation failure, conflict, error)
 * - Resetting all shortcuts
 * - ESC cancellation via eventBus
 * - Component cleanup on unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ShortcutsComponent from '../shortcuts.vue'
import { message } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'
import { shortcutService } from '@/services/shortcutService'

vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))

vi.mock('@/services/shortcutService', () => ({
  shortcutService: {
    getActions: vi.fn(),
    getShortcuts: vi.fn(),
    formatShortcut: vi.fn((shortcut: string) => shortcut),
    validateShortcut: vi.fn(() => true),
    updateShortcut: vi.fn(),
    resetShortcuts: vi.fn(),
    setRecording: vi.fn()
  }
}))

const mockActions = [
  {
    id: 'switchToNextTab',
    name: '',
    nameKey: 'user.shortcutSwitchToNextTab',
    handler: vi.fn(),
    defaultKey: { mac: 'Control+Tab', other: 'Ctrl+Tab' }
  },
  {
    id: 'switchToSpecificTab',
    name: '',
    nameKey: 'user.shortcutSwitchToSpecificTab',
    handler: vi.fn(),
    defaultKey: { mac: 'Command', other: 'Ctrl' }
  }
]

const mockShortcutsConfig = {
  switchToNextTab: 'Ctrl+Tab',
  switchToSpecificTab: 'Command'
}

describe('Shortcuts Component', () => {
  let wrapper: VueWrapper<any>

  const createWrapper = (options = {}) => {
    return mount(ShortcutsComponent, {
      global: {
        stubs: {
          'a-card': {
            template: '<div class="a-card"><slot /></div>'
          },
          'a-button': {
            template: '<button class="a-button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
            props: ['disabled', 'type', 'size']
          },
          'a-modal': {
            template: '<div v-if="open" class="a-modal"><slot /></div>',
            props: ['open', 'footer', 'closable', 'maskClosable', 'centered', 'width', 'style']
          }
        },
        mocks: {
          $t: (key: string) => key
        }
      },
      ...options
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    ;(shortcutService.getActions as ReturnType<typeof vi.fn>).mockReturnValue(mockActions)
    ;(shortcutService.getShortcuts as ReturnType<typeof vi.fn>).mockReturnValue({ ...mockShortcutsConfig })
    ;(shortcutService.formatShortcut as ReturnType<typeof vi.fn>).mockImplementation((shortcut: string) => shortcut)
    ;(shortcutService.validateShortcut as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(shortcutService.updateShortcut as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    ;(shortcutService.resetShortcuts as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true
    })

    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.shortcuts-container').exists()).toBe(true)
    })

    it('should load shortcuts on mount', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(shortcutService.getActions).toHaveBeenCalled()
      expect(shortcutService.getShortcuts).toHaveBeenCalled()
    })

    it('should subscribe to ESC cancellation event on mount', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(eventBus.on).toHaveBeenCalledWith('shortcut-recording-cancelled', expect.any(Function))
    })

    it('should render a row per action', async () => {
      wrapper = createWrapper()
      await nextTick()

      const rows = wrapper.findAll('.table-row')
      expect(rows).toHaveLength(mockActions.length)
    })

    it('should render the fixed digit chip only for switchToSpecificTab', async () => {
      wrapper = createWrapper()
      await nextTick()

      const fixedParts = wrapper.findAll('.fixed-part')
      expect(fixedParts).toHaveLength(1)
      expect(fixedParts[0].text()).toBe('1-9')
    })

    it('should handle errors during shortcut load', async () => {
      ;(shortcutService.getActions as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('load failed')
      })

      wrapper = createWrapper()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('user.shortcutSaveFailed')
    })
  })

  describe('Shortcut Display', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should expose current shortcut via getCurrentShortcut', () => {
      const vm = wrapper.vm as any
      expect(vm.getCurrentShortcut('switchToNextTab')).toBe('Ctrl+Tab')
      expect(vm.getCurrentShortcut('unknownAction')).toBe('')
    })

    it('should split a formatted shortcut into chip tokens', () => {
      const vm = wrapper.vm as any
      const tokens = vm.getShortcutTokens('switchToNextTab')

      expect(tokens).toEqual(['Ctrl', 'Tab'])
      expect(shortcutService.formatShortcut).toHaveBeenCalledWith('Ctrl+Tab', undefined)
    })

    it('should return an empty token list when no shortcut is configured', () => {
      ;(shortcutService.getShortcuts as ReturnType<typeof vi.fn>).mockReturnValue({})
      const vm = wrapper.vm as any
      vm.loadShortcuts()

      expect(vm.getShortcutTokens('switchToNextTab')).toEqual([])
    })

    it('should resolve action display name via i18n key', () => {
      const vm = wrapper.vm as any
      expect(vm.getActionName('switchToNextTab')).toBe('user.shortcutSwitchToNextTab')
      expect(vm.getActionName('unknownAction')).toBe('unknownAction')
    })

    it('should render kbd chips for each token', () => {
      const chips = wrapper.findAll('.table-row')[0].findAll('.key-chip')
      const chipTexts = chips.map((c) => c.text())
      expect(chipTexts).toContain('Ctrl')
      expect(chipTexts).toContain('Tab')
    })
  })

  describe('Recording Lifecycle', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should enter recording state for an action', async () => {
      const vm = wrapper.vm as any
      const addEventSpy = vi.spyOn(document, 'addEventListener')

      vm.startRecording('switchToNextTab')
      await nextTick()

      expect(vm.recordingAction).toBe('switchToNextTab')
      expect(vm.showRecordingModal).toBe(true)
      expect(vm.tempShortcut).toBe('')
      expect(shortcutService.setRecording).toHaveBeenCalledWith(true)
      expect(addEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    })

    it('should cancel recording and remove listeners', async () => {
      const vm = wrapper.vm as any
      const removeEventSpy = vi.spyOn(document, 'removeEventListener')

      vm.startRecording('switchToNextTab')
      await nextTick()

      vm.cancelRecording()
      await nextTick()

      expect(vm.recordingAction).toBeNull()
      expect(vm.showRecordingModal).toBe(false)
      expect(vm.tempShortcut).toBe('')
      expect(shortcutService.setRecording).toHaveBeenLastCalledWith(false)
      expect(removeEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
      expect(removeEventSpy).toHaveBeenCalledWith('mousedown', expect.any(Function))
    })

    it('should disable the reset button while recording', async () => {
      const vm = wrapper.vm as any
      vm.startRecording('switchToNextTab')
      await nextTick()

      const resetButton = wrapper.find('.reset-button')
      expect(resetButton.attributes('disabled')).toBeDefined()
    })

    it('should be triggered by clicking the shortcut display cell', async () => {
      const display = wrapper.findAll('.shortcut-display')[0]
      await display.trigger('click')

      const vm = wrapper.vm as any
      expect(vm.recordingAction).toBe('switchToNextTab')
      expect(vm.showRecordingModal).toBe(true)
    })
  })

  describe('Key Recording Logic', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    const dispatchKey = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', init)
      document.dispatchEvent(event)
    }

    it('should ignore key recording when not recording', () => {
      const vm = wrapper.vm as any
      vm.handleKeyRecording(new KeyboardEvent('keydown', { key: 'A' }))
      expect(vm.tempShortcut).toBe('')
    })

    it('should ignore Escape during recording (handled by service)', async () => {
      const vm = wrapper.vm as any
      vm.startRecording('switchToNextTab')
      await nextTick()

      dispatchKey({ key: 'Escape' })

      expect(vm.tempShortcut).toBe('')
    })

    it('should record a Ctrl+Shift+A combination', async () => {
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        configurable: true
      })

      const vm = wrapper.vm as any
      vm.startRecording('switchToNextTab')
      await nextTick()

      dispatchKey({
        key: 'a',
        code: 'KeyA',
        ctrlKey: true,
        shiftKey: true
      })

      expect(vm.tempShortcut).toBe('Ctrl+Shift+A')
    })

    it('should map space, enter and escape main keys to friendly names', async () => {
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        configurable: true
      })
      const vm = wrapper.vm as any
      vm.startRecording('switchToNextTab')
      await nextTick()

      dispatchKey({ key: ' ', code: 'Space', ctrlKey: true })
      expect(vm.tempShortcut).toBe('Ctrl+Space')

      dispatchKey({ key: 'Enter', code: 'Enter', ctrlKey: true })
      expect(vm.tempShortcut).toBe('Ctrl+Return')
    })

    it('should use Option label on Mac when Alt key is pressed', async () => {
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true
      })

      const vm = wrapper.vm as any
      vm.startRecording('switchToNextTab')
      await nextTick()

      dispatchKey({
        key: 'å',
        code: 'KeyA',
        altKey: true
      })

      expect(vm.tempShortcut).toBe('Option+A')
    })

    it('should map punctuation event.code values when Option is held on Mac', async () => {
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true
      })

      const vm = wrapper.vm as any
      vm.startRecording('switchToNextTab')
      await nextTick()

      dispatchKey({
        key: '≤',
        code: 'Comma',
        altKey: true
      })

      expect(vm.tempShortcut).toBe('Option+,')
    })

    it('should record only modifier keys for switchToSpecificTab', async () => {
      const vm = wrapper.vm as any
      vm.startRecording('switchToSpecificTab')
      await nextTick()

      dispatchKey({
        key: 'Meta',
        code: 'MetaLeft',
        metaKey: true
      })

      expect(vm.tempShortcut).toBe('Command')
    })

    it('should not store a shortcut for switchToSpecificTab when no modifier is pressed', async () => {
      const vm = wrapper.vm as any
      vm.startRecording('switchToSpecificTab')
      await nextTick()

      dispatchKey({
        key: 'Meta',
        code: 'MetaLeft'
      })

      expect(vm.tempShortcut).toBe('')
    })

    it('should ignore standalone modifier presses for non-tab actions', async () => {
      const vm = wrapper.vm as any
      vm.startRecording('switchToNextTab')
      await nextTick()

      dispatchKey({
        key: 'Control',
        code: 'ControlLeft',
        ctrlKey: true
      })

      expect(vm.tempShortcut).toBe('')
    })
  })

  describe('Save Recording', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should not save when there is no temp shortcut', async () => {
      const vm = wrapper.vm as any
      vm.recordingAction = 'switchToNextTab'
      vm.tempShortcut = ''

      await vm.saveRecording()

      expect(shortcutService.updateShortcut).not.toHaveBeenCalled()
    })

    it('should reject invalid shortcuts before calling the service', async () => {
      ;(shortcutService.validateShortcut as ReturnType<typeof vi.fn>).mockReturnValue(false)

      const vm = wrapper.vm as any
      vm.recordingAction = 'switchToNextTab'
      vm.tempShortcut = 'Ctrl+ '

      await vm.saveRecording()

      expect(shortcutService.updateShortcut).not.toHaveBeenCalled()
      expect(message.error).toHaveBeenCalledWith('user.shortcutInvalidMessage')
    })

    it('should persist a valid shortcut and reload state', async () => {
      const vm = wrapper.vm as any
      vm.recordingAction = 'switchToNextTab'
      vm.tempShortcut = 'Ctrl+Shift+P'

      await vm.saveRecording()

      expect(shortcutService.updateShortcut).toHaveBeenCalledWith('switchToNextTab', 'Ctrl+Shift+P')
      expect(message.success).toHaveBeenCalledWith('user.shortcutSaveSuccess')
      expect(vm.recordingAction).toBeNull()
      expect(vm.showRecordingModal).toBe(false)
    })

    it('should surface a conflict error when the service refuses the update', async () => {
      ;(shortcutService.updateShortcut as ReturnType<typeof vi.fn>).mockResolvedValue(false)

      const vm = wrapper.vm as any
      vm.recordingAction = 'switchToNextTab'
      vm.tempShortcut = 'Ctrl+Shift+P'

      await vm.saveRecording()

      expect(message.error).toHaveBeenCalledWith('user.shortcutConflictMessage')
      expect(shortcutService.setRecording).toHaveBeenLastCalledWith(false)
      expect(vm.recordingAction).toBe('switchToNextTab')
    })

    it('should report a save failure when the service throws', async () => {
      ;(shortcutService.updateShortcut as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))

      const vm = wrapper.vm as any
      vm.recordingAction = 'switchToNextTab'
      vm.tempShortcut = 'Ctrl+Shift+P'

      await vm.saveRecording()

      expect(message.error).toHaveBeenCalledWith('user.shortcutSaveFailed')
      expect(shortcutService.setRecording).toHaveBeenLastCalledWith(false)
    })
  })

  describe('Reset All Shortcuts', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should reset shortcuts and reload state on success', async () => {
      const vm = wrapper.vm as any
      ;(shortcutService.getActions as ReturnType<typeof vi.fn>).mockClear()
      ;(shortcutService.getShortcuts as ReturnType<typeof vi.fn>).mockClear()

      await vm.resetAllShortcuts()

      expect(shortcutService.resetShortcuts).toHaveBeenCalled()
      expect(message.success).toHaveBeenCalledWith('user.shortcutResetSuccess')
      expect(shortcutService.getActions).toHaveBeenCalled()
      expect(shortcutService.getShortcuts).toHaveBeenCalled()
    })

    it('should report an error if reset fails', async () => {
      ;(shortcutService.resetShortcuts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('reset failed'))

      const vm = wrapper.vm as any
      await vm.resetAllShortcuts()

      expect(message.error).toHaveBeenCalledWith('user.shortcutSaveFailed')
    })

    it('should call resetAllShortcuts when the reset button is clicked', async () => {
      await wrapper.find('.reset-button').trigger('click')
      await nextTick()

      expect(shortcutService.resetShortcuts).toHaveBeenCalled()
    })
  })

  describe('ESC Cancellation', () => {
    it('should cancel recording when the ESC event is emitted', async () => {
      wrapper = createWrapper()
      await nextTick()

      const vm = wrapper.vm as any
      vm.startRecording('switchToNextTab')
      await nextTick()

      const cancelHandler = (vi.mocked(eventBus.on).mock.calls as any[]).find((call) => call[0] === 'shortcut-recording-cancelled')?.[1] as () => void

      expect(cancelHandler).toBeDefined()
      cancelHandler()
      await nextTick()

      expect(vm.recordingAction).toBeNull()
      expect(vm.showRecordingModal).toBe(false)
    })
  })

  describe('Component Cleanup', () => {
    it('should detach the ESC listener on unmount', async () => {
      wrapper = createWrapper()
      await nextTick()

      wrapper.unmount()

      expect(eventBus.off).toHaveBeenCalledWith('shortcut-recording-cancelled', expect.any(Function))
    })

    it('should remove key listeners and clear recording state when unmounted while recording', async () => {
      wrapper = createWrapper()
      await nextTick()

      const vm = wrapper.vm as any
      vm.startRecording('switchToNextTab')
      await nextTick()

      const removeEventSpy = vi.spyOn(document, 'removeEventListener')

      wrapper.unmount()

      expect(removeEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
      expect(removeEventSpy).toHaveBeenCalledWith('mousedown', expect.any(Function))
      expect(shortcutService.setRecording).toHaveBeenLastCalledWith(false)
    })
  })
})
