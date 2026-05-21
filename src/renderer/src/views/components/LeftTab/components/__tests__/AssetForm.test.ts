import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { message } from 'ant-design-vue'
import AssetForm from '../AssetForm.vue'
import eventBus from '@/utils/eventBus'

// Mock ant-design-vue
vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// i18n translations used by the component
const translations: Record<string, string> = {
  'personal.editHost': 'Edit Host',
  'personal.newHost': 'New Host',
  'personal.deviceCategory': 'Device Category',
  'personal.selectDeviceType': 'Select device type',
  'personal.deviceServer': 'Server',
  'personal.deviceNetwork': 'Network',
  'personal.personalAsset': 'Personal',
  'personal.bastionHost': 'Bastion Host',
  'personal.deviceSwitch': 'Switch',
  'personal.address': 'Address',
  'personal.remoteHost': 'Remote Host',
  'personal.pleaseInputRemoteHost': 'Please input remote host',
  'personal.port': 'Port',
  'personal.pleaseInputPort': 'Please input port',
  'personal.authentication': 'Authentication',
  'personal.verificationMethod': 'Verification Method',
  'personal.password': 'Password',
  'personal.key': 'Key',
  'personal.username': 'Username',
  'personal.pleaseInputUsername': 'Please input username',
  'personal.pleaseInputPassword': 'Please input password',
  'personal.pleaseSelectKeychain': 'Please select keychain',
  'personal.proxyConfig': 'Proxy Config',
  'personal.pleaseSelectSshProxy': 'Please select SSH proxy',
  'personal.advancedOptions': 'Advanced Options',
  'personal.jumpHost': 'Jump Host',
  'personal.jumpHostSelect': 'Select jump host',
  'personal.general': 'General',
  'personal.alias': 'Alias',
  'personal.pleaseInputAlias': 'Please input alias',
  'personal.group': 'Group',
  'personal.pleaseSelectGroup': 'Please select group',
  'personal.defaultGroup': 'Hosts',
  'personal.saveAsset': 'Save',
  'personal.createAsset': 'Create',
  'personal.bastionType': 'Bastion Type',
  'personal.switchCisco': 'Cisco',
  'personal.switchHuawei': 'Huawei',
  'personal.noProxyConfigFound': 'No proxy config found',
  'personal.goToProxyConfig': 'Go to proxy config',
  'personal.validationRemoteHostRequired': 'Remote host cannot be empty',
  'personal.validationPortRequired': 'Port cannot be empty',
  'personal.validationUsernameRequired': 'Username cannot be empty',
  'personal.validationPasswordRequired': 'Password cannot be empty',
  'personal.validationKeychainRequired': 'Keychain cannot be empty',
  'personal.validationIpNoSpaces': 'IP cannot contain spaces',
  'personal.validationPortNoSpaces': 'Port cannot contain spaces',
  'personal.validationUsernameNoSpaces': 'Username cannot contain spaces',
  'personal.validationPasswordNoSpaces': 'Password cannot contain spaces'
}

// Mock i18n
vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string) => translations[key] || key,
      locale: { value: 'en-US' }
    }
  }
}))

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => translations[key] || key,
    locale: { value: 'en-US' }
  }),
  createI18n: vi.fn(() => ({
    global: {
      t: (key: string) => translations[key] || key,
      locale: { value: 'en-US' }
    }
  }))
}))

// Mock eventBus
vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))

// Mock window.api
const mockWindowApi = {
  getBastionDefinitions: vi.fn().mockResolvedValue([])
}

describe('AssetForm Validation', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = (props = {}) => {
    ;(global as any).window = {
      ...global.window,
      api: mockWindowApi
    }

    return mount(AssetForm, {
      props: {
        isEditMode: false,
        initialData: {},
        keyChainOptions: [],
        sshProxyConfigs: [],
        defaultGroups: ['development', 'production'],
        ...props
      },
      global: {
        plugins: [pinia],
        stubs: {
          'a-form': { template: '<form class="a-form"><slot /></form>' },
          'a-form-item': {
            template: '<div class="a-form-item" :data-validate-status="$attrs[\'validate-status\']" :data-help="$attrs.help"><slot /></div>',
            inheritAttrs: false
          },
          'a-input': {
            template:
              '<input class="a-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\', $event)" />',
            props: ['modelValue', 'placeholder']
          },
          'a-input-password': {
            template:
              '<input class="a-input-password" type="password" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\', $event)" />',
            props: ['modelValue', 'placeholder']
          },
          'a-input-number': {
            template:
              '<input class="a-input-number" type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
            props: ['modelValue']
          },
          'a-button': {
            template: '<button class="a-button" @click="$emit(\'click\')"><slot /></button>',
            props: ['type']
          },
          'a-select': {
            template:
              '<select class="a-select" :data-placeholder="placeholder" :data-options-count="(options || []).length" :data-option-values="(options || []).map(o => o.value).join(\',\')"><slot /></select>',
            props: ['modelValue', 'options', 'placeholder']
          },
          'a-select-option': { template: '<option><slot /></option>' },
          'a-cascader': { template: '<div class="a-cascader"></div>', props: ['modelValue'] },
          'a-radio-group': { template: '<div class="a-radio-group"><slot /></div>', props: ['modelValue'] },
          'a-radio-button': { template: '<div class="a-radio-button"><slot /></div>', props: ['value'] },
          'a-switch': { template: '<div class="a-switch"></div>', props: ['checked'] },
          ToTopOutlined: { template: '<span class="close-icon" />' }
        }
      }
    })
  }

  /**
   * Find and click the submit button.
   * The stub renders <button class="a-button">, and Vue merges the parent's
   * class="submit-button" onto it, so the DOM element has both classes.
   * We locate the button inside .form-footer to avoid ambiguity.
   */
  const clickSubmit = async (w: VueWrapper<any>) => {
    const footer = w.find('.form-footer')
    const btn = footer.find('.a-button')
    // Use native click to avoid jsdom SupportedEventInterface issue
    ;(btn.element as HTMLElement).click()
    await nextTick()
  }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  describe('required field validation on submit', () => {
    it('should not emit submit when IP is empty', async () => {
      wrapper = createWrapper({
        initialData: { ip: '', port: 22, username: 'root' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should not emit submit when IP is whitespace only', async () => {
      wrapper = createWrapper({
        initialData: { ip: '   ', port: 22, username: 'root' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should not emit submit when port is 0', async () => {
      wrapper = createWrapper({
        initialData: { ip: '192.168.1.1', port: 0, username: 'root' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should not emit submit when username is empty', async () => {
      wrapper = createWrapper({
        initialData: { ip: '192.168.1.1', port: 22, username: '' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should not emit submit when username is whitespace only', async () => {
      wrapper = createWrapper({
        initialData: { ip: '192.168.1.1', port: 22, username: '   ' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should not emit submit when all required fields are empty', async () => {
      wrapper = createWrapper({
        initialData: { ip: '', port: 0, username: '' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should emit submit when all required fields are filled', async () => {
      wrapper = createWrapper({
        initialData: {
          ip: '192.168.1.1',
          port: 22,
          username: 'root',
          password: 'pass123',
          asset_type: 'person',
          auth_type: 'password'
        }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeTruthy()
      expect(wrapper.emitted('submit')![0]).toBeTruthy()
    })
  })

  describe('validation error display', () => {
    it('should show validation error for empty IP on submit', async () => {
      wrapper = createWrapper({
        initialData: { ip: '', port: 22, username: 'root' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      const formItems = wrapper.findAll('.a-form-item')
      const ipFormItem = formItems.find((fi) => fi.attributes('data-help') === 'Remote host cannot be empty')
      expect(ipFormItem).toBeTruthy()
      expect(ipFormItem!.attributes('data-validate-status')).toBe('error')
    })

    it('should show validation error for empty username on submit', async () => {
      wrapper = createWrapper({
        initialData: { ip: '', port: 22, username: '' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      const formItems = wrapper.findAll('.a-form-item')
      const usernameFormItem = formItems.find((fi) => fi.attributes('data-help') === 'Username cannot be empty')
      expect(usernameFormItem).toBeTruthy()
      expect(usernameFormItem!.attributes('data-validate-status')).toBe('error')
    })

    it('should show validation error for empty port on submit', async () => {
      wrapper = createWrapper({
        initialData: { ip: '', port: 0, username: 'root' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      const formItems = wrapper.findAll('.a-form-item')
      const portFormItem = formItems.find((fi) => fi.attributes('data-help') === 'Port cannot be empty')
      expect(portFormItem).toBeTruthy()
      expect(portFormItem!.attributes('data-validate-status')).toBe('error')
    })
  })

  describe('validation applies to all asset types', () => {
    it('should validate required fields for personal asset type', async () => {
      wrapper = createWrapper({
        initialData: { ip: '', port: 22, username: '', asset_type: 'person' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should validate required fields for organization asset type', async () => {
      wrapper = createWrapper({
        initialData: { ip: '', port: 22, username: '', asset_type: 'organization' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should validate required fields for switch asset type', async () => {
      wrapper = createWrapper({
        initialData: { ip: '', port: 22, username: '', asset_type: 'person-switch-cisco' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })
  })

  describe('auth credential validation', () => {
    it('should not emit submit when auth is password and password is empty', async () => {
      wrapper = createWrapper({
        initialData: {
          ip: '192.168.1.1',
          port: 22,
          username: 'root',
          password: '',
          asset_type: 'person',
          auth_type: 'password'
        }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should show password validation error when auth is password and password is empty', async () => {
      wrapper = createWrapper({
        initialData: {
          ip: '192.168.1.1',
          port: 22,
          username: 'root',
          password: '',
          asset_type: 'person',
          auth_type: 'password'
        }
      })
      await nextTick()
      await clickSubmit(wrapper)

      const formItems = wrapper.findAll('.a-form-item')
      const passwordFormItem = formItems.find((fi) => fi.attributes('data-help') === 'Password cannot be empty')
      expect(passwordFormItem).toBeTruthy()
      expect(passwordFormItem!.attributes('data-validate-status')).toBe('error')
    })

    it('should not emit submit when auth is keyBased and no key is selected', async () => {
      // Use organization asset with plugin bastion that supports keyBased
      mockWindowApi.getBastionDefinitions.mockResolvedValue([{ type: 'chaterm', authPolicy: ['keyBased'] }])
      wrapper = createWrapper({
        initialData: {
          ip: '192.168.1.1',
          port: 22,
          username: 'root',
          password: '',
          asset_type: 'organization-chaterm',
          auth_type: 'keyBased',
          keyChain: undefined
        }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should emit submit when auth is password and password is provided', async () => {
      wrapper = createWrapper({
        initialData: {
          ip: '192.168.1.1',
          port: 22,
          username: 'root',
          password: 'secret',
          asset_type: 'person',
          auth_type: 'password'
        }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeTruthy()
    })

    it('should emit submit when auth is keyBased and key is selected', async () => {
      // Use organization asset with plugin bastion that supports keyBased
      mockWindowApi.getBastionDefinitions.mockResolvedValue([{ type: 'chaterm', authPolicy: ['keyBased'] }])
      wrapper = createWrapper({
        initialData: {
          ip: '192.168.1.1',
          port: 22,
          username: 'root',
          password: '',
          asset_type: 'organization-chaterm',
          auth_type: 'keyBased',
          keyChain: 1
        }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeTruthy()
    })
  })

  describe('edit mode validation', () => {
    it('should validate required fields in edit mode', async () => {
      wrapper = createWrapper({
        isEditMode: true,
        initialData: { ip: '', port: 22, username: 'root', asset_type: 'person' }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should emit submit in edit mode when all fields are valid', async () => {
      wrapper = createWrapper({
        isEditMode: true,
        initialData: {
          ip: '10.0.0.1',
          port: 2222,
          username: 'admin',
          password: 'secret',
          asset_type: 'person',
          auth_type: 'password'
        }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeTruthy()
    })
  })

  describe('spaces validation', () => {
    it('should reject IP with spaces', async () => {
      wrapper = createWrapper({
        initialData: {
          ip: '192.168. 1.1',
          port: 22,
          username: 'root',
          password: 'pass',
          asset_type: 'person',
          auth_type: 'password'
        }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should reject username with spaces', async () => {
      wrapper = createWrapper({
        initialData: {
          ip: '192.168.1.1',
          port: 22,
          username: 'ro ot',
          password: 'pass',
          asset_type: 'person',
          auth_type: 'password'
        }
      })
      await nextTick()
      await clickSubmit(wrapper)

      expect(wrapper.emitted('submit')).toBeUndefined()
    })
  })

  describe('advanced options - jump host', () => {
    const baseValidData = {
      ip: '192.168.1.1',
      port: 22,
      username: 'root',
      password: 'pass',
      asset_type: 'person' as const,
      auth_type: 'password'
    }

    it('should propagate jumpHostUuid in submit payload', async () => {
      wrapper = createWrapper({
        initialData: { ...baseValidData, jumpHostUuid: 'jump-uuid-1' },
        jumpHostOptions: [
          { value: 'jump-uuid-1', label: 'bastion (root@10.0.0.2:22)' },
          { value: 'jump-uuid-2', label: 'gateway (root@10.0.0.3:22)' }
        ]
      })
      await nextTick()
      await clickSubmit(wrapper)

      const submitted = wrapper.emitted('submit')
      expect(submitted).toBeTruthy()
      const payload = submitted![0][0] as { jumpHostUuid?: string }
      expect(payload.jumpHostUuid).toBe('jump-uuid-1')
    })

    it('should default jumpHostUuid to empty string when none provided', async () => {
      wrapper = createWrapper({
        initialData: baseValidData
      })
      await nextTick()
      await clickSubmit(wrapper)

      const submitted = wrapper.emitted('submit')
      expect(submitted).toBeTruthy()
      const payload = submitted![0][0] as { jumpHostUuid?: string }
      expect(payload.jumpHostUuid).toBe('')
    })

    it('should exclude the editing asset from jump host options to prevent self-reference', async () => {
      const options = [
        { value: 'self-uuid', label: 'self (root@10.0.0.1:22)' },
        { value: 'other-uuid', label: 'other (root@10.0.0.2:22)' }
      ]
      wrapper = createWrapper({
        isEditMode: true,
        editingAssetUuid: 'self-uuid',
        jumpHostOptions: options,
        initialData: baseValidData
      })
      await nextTick()

      const selects = wrapper.findAll('select.a-select')
      const jumpSelect = selects.find((s) => s.attributes('data-placeholder') === 'Select jump host')
      expect(jumpSelect).toBeTruthy()
      expect(jumpSelect!.attributes('data-options-count')).toBe('1')
      expect(jumpSelect!.attributes('data-option-values')).toBe('other-uuid')
    })

    it('should keep all jump host options when not editing', async () => {
      const options = [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' }
      ]
      wrapper = createWrapper({
        isEditMode: false,
        editingAssetUuid: null,
        jumpHostOptions: options,
        initialData: baseValidData
      })
      await nextTick()

      const selects = wrapper.findAll('select.a-select')
      const jumpSelect = selects.find((s) => s.attributes('data-placeholder') === 'Select jump host')
      expect(jumpSelect).toBeTruthy()
      expect(jumpSelect!.attributes('data-options-count')).toBe('2')
      expect(jumpSelect!.attributes('data-option-values')).toBe('a,b')
    })
  })

  describe('handlers and side effects', () => {
    const baseValidData = {
      ip: '192.168.1.1',
      port: 22,
      username: 'root',
      password: 'pass',
      asset_type: 'person' as const,
      auth_type: 'password'
    }

    it('should emit close when clicking close icon', async () => {
      wrapper = createWrapper({ initialData: baseValidData })
      await nextTick()
      ;(wrapper.find('.close-icon').element as HTMLElement).click()
      await nextTick()

      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('should update formData for device type and switch brand changes', async () => {
      wrapper = createWrapper({ initialData: baseValidData })
      await nextTick()

      wrapper.vm.handleDeviceTypeChange(['server', 'personal'])
      expect(wrapper.vm.formData.asset_type).toBe('person')
      expect(wrapper.vm.formData.auth_type).toBe('password')

      wrapper.vm.handleDeviceTypeChange(['network', 'switch'])
      expect(wrapper.vm.formData.asset_type).toBe('person-switch-cisco')
      expect(wrapper.vm.formData.auth_type).toBe('password')

      wrapper.vm.handleSwitchBrandChange()
      expect(wrapper.vm.formData.asset_type).toBe('person-switch-cisco')
    })

    it('should update bastion type when handling bastion change', async () => {
      wrapper = createWrapper({ initialData: { ...baseValidData, asset_type: 'organization' } })
      await nextTick()

      wrapper.vm.deviceTypePath = ['server', 'bastion']
      wrapper.vm.bastionType = 'jumpserver'
      wrapper.vm.handleBastionTypeChange()
      expect(wrapper.vm.formData.asset_type).toBe('organization')

      wrapper.vm.bastionType = 'chaterm'
      wrapper.vm.handleBastionTypeChange()
      expect(wrapper.vm.formData.asset_type).toBe('organization-chaterm')
    })

    it('should cache and restore auth credentials when auth type switches', async () => {
      wrapper = createWrapper({
        initialData: {
          ...baseValidData,
          password: 'secret',
          keyChain: 11
        }
      })
      await nextTick()

      wrapper.vm.formData.auth_type = 'keyBased'
      wrapper.vm.handleAuthChange()
      expect(wrapper.emitted('auth-change')?.[0]).toEqual(['keyBased'])
      expect(wrapper.vm.formData.password).toBe('')

      wrapper.vm.formData.keyChain = 22
      wrapper.vm.formData.auth_type = 'password'
      wrapper.vm.handleAuthChange()
      expect(wrapper.vm.formData.keyChain).toBeUndefined()
      expect(wrapper.vm.formData.password).toBe('secret')
    })

    it('should emit add-keychain event from handler', async () => {
      wrapper = createWrapper({ initialData: baseValidData })
      await nextTick()

      wrapper.vm.handleAddKeychain()
      expect(wrapper.emitted('add-keychain')).toBeTruthy()
    })

    it('should set empty group when select value is undefined', async () => {
      wrapper = createWrapper({ initialData: baseValidData })
      await nextTick()

      wrapper.vm.handleGroupChange(undefined)
      expect(wrapper.vm.formData.group_name).toBe('')
    })

    it('should support creating and canceling inline groups', async () => {
      wrapper = createWrapper({
        initialData: baseValidData,
        defaultGroups: ['Hosts', 'development']
      })
      await nextTick()

      wrapper.vm.startCreateGroup()
      expect(wrapper.vm.isCreatingGroup).toBe(true)

      wrapper.vm.newGroupName = 'development'
      wrapper.vm.confirmCreateGroup()
      expect(wrapper.vm.formData.group_name).toBe('development')
      expect(wrapper.vm.isCreatingGroup).toBe(false)

      wrapper.vm.startCreateGroup()
      wrapper.vm.newGroupName = '  custom-group  '
      wrapper.vm.confirmCreateGroup()
      expect(wrapper.vm.formData.group_name).toBe('custom-group')

      wrapper.vm.startCreateGroup()
      wrapper.vm.newGroupName = 'tmp'
      wrapper.vm.cancelCreateGroup()
      expect(wrapper.vm.newGroupName).toBe('')
      expect(wrapper.vm.isCreatingGroup).toBe(false)
    })

    it('should update proxy switch status via handler', async () => {
      wrapper = createWrapper({ initialData: { ...baseValidData, needProxy: false } })
      await nextTick()

      await wrapper.vm.handleSshProxyStatusChange(true)
      expect(wrapper.vm.formData.needProxy).toBe(true)

      await wrapper.vm.handleSshProxyStatusChange(false)
      expect(wrapper.vm.formData.needProxy).toBe(false)
    })

    it('should emit proxy-config navigation events in order', async () => {
      vi.useFakeTimers()
      wrapper = createWrapper({ initialData: baseValidData })
      await nextTick()

      wrapper.vm.handleAddProxyConfig()
      expect((eventBus.emit as any).mock.calls[0]).toEqual(['openUserTab', 'userConfig'])

      vi.advanceTimersByTime(100)
      expect((eventBus.emit as any).mock.calls[1]).toEqual(['switchToTerminalTab'])

      vi.advanceTimersByTime(200)
      expect((eventBus.emit as any).mock.calls[2]).toEqual(['openAddProxyConfigModal'])

      vi.useRealTimers()
    })

    it('should show keychain required message when key auth has no key', async () => {
      mockWindowApi.getBastionDefinitions.mockResolvedValue([{ type: 'chaterm', authPolicy: ['keyBased'] }])
      wrapper = createWrapper({
        initialData: {
          ip: '192.168.1.1',
          port: 22,
          username: 'root',
          asset_type: 'organization-chaterm',
          auth_type: 'keyBased'
        }
      })
      await nextTick()

      await clickSubmit(wrapper)

      expect(message.error).toHaveBeenCalledWith('Keychain cannot be empty')
      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('should reset form data when initialData prop changes', async () => {
      wrapper = createWrapper({
        initialData: {
          ...baseValidData,
          group_name: 'g1',
          jumpHostUuid: 'jump-1'
        }
      })
      await nextTick()

      await wrapper.setProps({
        initialData: {
          ip: '10.0.0.1',
          port: 2200,
          username: 'admin',
          password: 'new-secret',
          asset_type: 'person',
          auth_type: 'password'
        }
      })

      expect(wrapper.vm.formData.ip).toBe('10.0.0.1')
      expect(wrapper.vm.formData.port).toBe(2200)
      expect(wrapper.vm.formData.username).toBe('admin')
      expect(wrapper.vm.formData.password).toBe('new-secret')
      expect(wrapper.vm.formData.group_name).toBe('Hosts')
      expect(wrapper.vm.formData.jumpHostUuid).toBe('')
    })
  })
})
