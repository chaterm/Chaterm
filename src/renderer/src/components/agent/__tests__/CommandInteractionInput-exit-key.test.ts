import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CommandInteractionInput from '../CommandInteractionInput.vue'

// Create i18n instance for tests
const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      interaction: {
        exit: 'Exit',
        cancelTip: 'Send Ctrl+C',
        exitKeyTip: 'Send exit key: {key}',
        yes: 'Yes',
        no: 'No',
        send: 'Send',
        dismiss: 'Dismiss',
        suppress: 'Do not show again',
        restore: 'Restore detection',
        manual: 'Manual input',
        backToOptions: 'Back to options',
        inputPlaceholder: 'Enter input...',
        pressEnter: 'Press Enter to continue',
        pagerNext: 'Next page',
        pagerPrev: 'Previous page',
        pagerQuit: 'Quit',
        manualInput: 'Manual',
        suppressed: 'Suppressed',
        unsuppress: 'Enable detection',
        default: 'Default',
        sending: 'Sending...',
        switchToTerminal: 'Switch to terminal'
      }
    }
  }
})

// Mock Ant Design Vue components
const mockComponents = {
  'a-tooltip': {
    template: '<div class="mock-tooltip"><slot /></div>',
    props: ['title']
  },
  'a-button': {
    template: '<button class="mock-button" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'danger', 'ghost'],
    emits: ['click']
  },
  'a-dropdown': {
    template: '<div class="mock-dropdown"><slot /><slot name="overlay" /></div>',
    props: ['trigger']
  },
  'a-menu': {
    template: '<div class="mock-menu"><slot /></div>'
  },
  'a-menu-item': {
    template: '<div class="mock-menu-item" @click="$emit(\'click\')"><slot /></div>',
    props: ['key'],
    emits: ['click']
  },
  'a-input': {
    template:
      '<input class="mock-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'press-enter\')" />',
    props: ['modelValue', 'placeholder', 'size'],
    emits: ['update:modelValue', 'press-enter'],
    methods: {
      focus() {
        // noop for test mock
      }
    }
  },
  'a-input-password': {
    template:
      '<input type="password" class="mock-input-password" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'press-enter\')" />',
    props: ['modelValue', 'placeholder', 'size'],
    emits: ['update:modelValue', 'press-enter'],
    methods: {
      focus() {
        // noop for test mock
      }
    }
  }
}

// Mock icons
const mockIcons = [
  'QuestionCircleOutlined',
  'LockOutlined',
  'CheckCircleOutlined',
  'UnorderedListOutlined',
  'DownOutlined',
  'EnterOutlined',
  'WarningOutlined',
  'CloseCircleOutlined',
  'LoadingOutlined',
  'StopOutlined',
  'EllipsisOutlined',
  'RightOutlined',
  'LeftOutlined',
  'CloseOutlined',
  'EditOutlined',
  'ReloadOutlined'
].reduce(
  (acc, name) => {
    acc[name] = { template: `<span class="mock-icon ${name}"></span>` }
    return acc
  },
  {} as Record<string, { template: string }>
)

describe('CommandInteractionInput exit key behavior', () => {
  const mountComponent = (props = {}) => {
    return mount(CommandInteractionInput, {
      props: {
        visible: true,
        commandId: 'test-cmd',
        interactionType: 'freeform',
        promptHint: 'Test prompt',
        ...props
      },
      global: {
        plugins: [i18n],
        stubs: {
          ...mockComponents,
          ...mockIcons
        }
      }
    })
  }

  describe('exit button label', () => {
    it('shows "Ctrl + C" when no exitKey is provided', () => {
      const wrapper = mountComponent()
      const cancelBtn = wrapper.find('.header-cancel-btn')
      expect(cancelBtn.text()).toContain('Ctrl + C')
    })

    it('shows "Exit (q)" when exitKey is "q"', () => {
      const wrapper = mountComponent({ exitKey: 'q' })
      const cancelBtn = wrapper.find('.header-cancel-btn')
      expect(cancelBtn.text()).toContain('Exit')
      expect(cancelBtn.text()).toContain('(q)')
    })

    it('shows "Exit (quit)" when exitKey is "quit"', () => {
      const wrapper = mountComponent({ exitKey: 'quit' })
      const cancelBtn = wrapper.find('.header-cancel-btn')
      expect(cancelBtn.text()).toContain('Exit')
      expect(cancelBtn.text()).toContain('(quit)')
    })

    it('shows "Ctrl + C" when exitKey is "Ctrl+C" (normalized)', () => {
      const wrapper = mountComponent({ exitKey: 'Ctrl+C' })
      const cancelBtn = wrapper.find('.header-cancel-btn')
      expect(cancelBtn.text()).toContain('Ctrl + C')
      expect(cancelBtn.text()).not.toContain('Exit')
    })

    it('shows "Ctrl + C" when exitKey is "ctrl-c" (normalized)', () => {
      const wrapper = mountComponent({ exitKey: 'ctrl-c' })
      const cancelBtn = wrapper.find('.header-cancel-btn')
      expect(cancelBtn.text()).toContain('Ctrl + C')
    })

    it('shows "Ctrl + C" when exitKey is "^C" (normalized)', () => {
      const wrapper = mountComponent({ exitKey: '^C' })
      const cancelBtn = wrapper.find('.header-cancel-btn')
      expect(cancelBtn.text()).toContain('Ctrl + C')
    })

    it('shows "Ctrl + C" when exitKey is actual Ctrl+C character', () => {
      const wrapper = mountComponent({ exitKey: '\x03' })
      const cancelBtn = wrapper.find('.header-cancel-btn')
      expect(cancelBtn.text()).toContain('Ctrl + C')
    })
  })

  describe('exit button click behavior', () => {
    it('emits cancel event when no custom exitKey', async () => {
      const wrapper = mountComponent()
      const cancelBtn = wrapper.find('.header-cancel-btn')

      await cancelBtn.trigger('click')

      expect(wrapper.emitted('cancel')).toBeTruthy()
      expect(wrapper.emitted('cancel')![0]).toEqual(['test-cmd'])
      expect(wrapper.emitted('submit')).toBeFalsy()
    })

    it('emits submit with exitKey when custom exitKey is provided', async () => {
      const wrapper = mountComponent({
        exitKey: 'q',
        exitAppendNewline: false
      })
      const cancelBtn = wrapper.find('.header-cancel-btn')

      await cancelBtn.trigger('click')

      expect(wrapper.emitted('submit')).toBeTruthy()
      expect(wrapper.emitted('submit')![0]).toEqual(['test-cmd', 'q', false, 'freeform'])
      expect(wrapper.emitted('cancel')).toBeFalsy()
    })

    it('emits submit with quit and newline when exitKey is "quit"', async () => {
      const wrapper = mountComponent({
        exitKey: 'quit',
        exitAppendNewline: true
      })
      const cancelBtn = wrapper.find('.header-cancel-btn')

      await cancelBtn.trigger('click')

      expect(wrapper.emitted('submit')).toBeTruthy()
      expect(wrapper.emitted('submit')![0]).toEqual(['test-cmd', 'quit', true, 'freeform'])
    })

    it('emits cancel when exitKey is "Ctrl+C" string', async () => {
      const wrapper = mountComponent({ exitKey: 'Ctrl+C' })
      const cancelBtn = wrapper.find('.header-cancel-btn')

      await cancelBtn.trigger('click')

      expect(wrapper.emitted('cancel')).toBeTruthy()
      expect(wrapper.emitted('submit')).toBeFalsy()
    })

    it('emits cancel when exitKey is "CTRL+C" (case insensitive)', async () => {
      const wrapper = mountComponent({ exitKey: 'CTRL+C' })
      const cancelBtn = wrapper.find('.header-cancel-btn')

      await cancelBtn.trigger('click')

      expect(wrapper.emitted('cancel')).toBeTruthy()
      expect(wrapper.emitted('submit')).toBeFalsy()
    })

    it('defaults exitAppendNewline to true when not provided', async () => {
      const wrapper = mountComponent({
        exitKey: 'exit'
        // exitAppendNewline not provided
      })
      const cancelBtn = wrapper.find('.header-cancel-btn')

      await cancelBtn.trigger('click')

      expect(wrapper.emitted('submit')).toBeTruthy()
      expect(wrapper.emitted('submit')![0]).toEqual(['test-cmd', 'exit', true, 'freeform'])
    })
  })

  describe('pager mode with exitKey', () => {
    it('pager quit button sends q without newline', async () => {
      const wrapper = mountComponent({
        interactionType: 'pager',
        exitKey: 'q',
        exitAppendNewline: false
      })

      // Find the pager quit button (contains "Quit")
      const buttons = wrapper.findAll('.mock-button')
      const quitBtn = buttons.find((b) => b.text().includes('Quit'))

      expect(quitBtn).toBeDefined()
      await quitBtn!.trigger('click')

      expect(wrapper.emitted('submit')).toBeTruthy()
      // Pager quit button sends 'q' with appendNewline=false
      expect(wrapper.emitted('submit')![0]).toEqual(['test-cmd', 'q', false, 'pager'])
    })

    it('pager Exit button sends Ctrl+C even when exitKey is set', async () => {
      // For pager mode, Exit button should always send Ctrl+C (force interrupt)
      // because pager already has a dedicated Quit(q) button for normal exit
      const wrapper = mountComponent({
        interactionType: 'pager',
        exitKey: 'q',
        exitAppendNewline: false
      })

      const cancelBtn = wrapper.find('.header-cancel-btn')
      expect(cancelBtn.exists()).toBe(true)
      // Button should show "Ctrl + C" not "Exit (q)"
      expect(cancelBtn.text()).toContain('Ctrl + C')

      await cancelBtn.trigger('click')

      // Should emit cancel (Ctrl+C), not submit with exitKey
      expect(wrapper.emitted('cancel')).toBeTruthy()
      expect(wrapper.emitted('cancel')![0]).toEqual(['test-cmd'])
    })
  })

  describe('suppressed state', () => {
    it('does not show exit button when suppressed', () => {
      const wrapper = mountComponent({
        isSuppressed: true,
        exitKey: 'q'
      })

      const cancelBtn = wrapper.find('.header-cancel-btn')
      expect(cancelBtn.exists()).toBe(false)
    })
  })
})
