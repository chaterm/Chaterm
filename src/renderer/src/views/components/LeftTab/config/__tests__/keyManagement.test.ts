/**
 * Key Management Component Unit Tests
 *
 * Tests for the Key Management component including:
 * - Component rendering
 * - Key chain list loading and display
 * - Search functionality
 * - Create key chain functionality
 * - Edit key chain functionality
 * - Delete key chain functionality
 * - Form validation
 * - File upload and drag-drop
 * - Context menu
 * - Key type detection
 * - Event bus integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import KeyManagementComponent from '../keyManagement.vue'
import { Modal, message } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'

// Mock ant-design-vue components
vi.mock('ant-design-vue', () => ({
  Modal: {
    confirm: vi.fn()
  },
  message: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// Mock i18n
vi.mock('@/locales', () => {
  const mockTranslations: Record<string, string> = {
    'common.search': 'Search',
    'common.edit': 'Edit',
    'common.remove': 'Remove',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.pleaseInputLabel': 'Please enter label',
    'common.pleaseInputPrivateKey': 'Please enter private key',
    'common.saveSuccess': 'Save successful',
    'common.saveFailed': 'Save failed',
    'common.saveError': 'Save error',
    'keyChain.newKey': 'New Key',
    'keyChain.editKey': 'Edit Key',
    'keyChain.createKey': 'Create Key',
    'keyChain.saveKey': 'Save Key',
    'keyChain.name': 'Name',
    'keyChain.privateKey': 'Private Key',
    'keyChain.publicKey': 'Public Key',
    'keyChain.passphrase': 'Passphrase',
    'keyChain.type': 'Type: ',
    'keyChain.pleaseInput': 'Please input',
    'keyChain.keyDrop': 'Drop key file here',
    'keyChain.nameContainsSpace': 'Name contains space',
    'keyChain.publicKeyContainsSpace': 'Public key contains space',
    'keyChain.passphraseContainsSpace': 'Passphrase contains space',
    'keyChain.deleteConfirm': 'Delete Confirmation',
    'keyChain.deleteConfirmContent': 'Are you sure to delete {name}?',
    'keyChain.deleteSuccess': 'Delete successful: {name}',
    'keyChain.deleteFailure': 'Delete failed',
    'keyChain.deleteError': 'Delete error',
    'keyChain.createSuccess': 'Create successful',
    'keyChain.createError': 'Create error',
    'keyChain.getKeyListFailed': 'Failed to get key list',
    'keyChain.missingKeyId': 'Missing key ID',
    'ssh.unknownError': 'Unknown error'
  }

  const mockT = (key: string, params?: Record<string, string>) => {
    let translation = mockTranslations[key] || key
    if (params) {
      Object.keys(params).forEach((paramKey) => {
        translation = translation.replace(`{${paramKey}}`, params[paramKey])
      })
    }
    return translation
  }

  return {
    default: {
      global: {
        t: mockT
      }
    }
  }
})

// Create mockT for use in tests
const mockT = (key: string, params?: Record<string, string>) => {
  const mockTranslations: Record<string, string> = {
    'common.search': 'Search',
    'common.edit': 'Edit',
    'common.remove': 'Remove',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.pleaseInputLabel': 'Please enter label',
    'common.pleaseInputPrivateKey': 'Please enter private key',
    'common.saveSuccess': 'Save successful',
    'common.saveFailed': 'Save failed',
    'common.saveError': 'Save error',
    'keyChain.newKey': 'New Key',
    'keyChain.editKey': 'Edit Key',
    'keyChain.createKey': 'Create Key',
    'keyChain.saveKey': 'Save Key',
    'keyChain.name': 'Name',
    'keyChain.privateKey': 'Private Key',
    'keyChain.publicKey': 'Public Key',
    'keyChain.passphrase': 'Passphrase',
    'keyChain.type': 'Type: ',
    'keyChain.pleaseInput': 'Please input',
    'keyChain.keyDrop': 'Drop key file here',
    'keyChain.nameContainsSpace': 'Name contains space',
    'keyChain.publicKeyContainsSpace': 'Public key contains space',
    'keyChain.passphraseContainsSpace': 'Passphrase contains space',
    'keyChain.deleteConfirm': 'Delete Confirmation',
    'keyChain.deleteConfirmContent': 'Are you sure to delete {name}?',
    'keyChain.deleteSuccess': 'Delete successful: {name}',
    'keyChain.deleteFailure': 'Delete failed',
    'keyChain.deleteError': 'Delete error',
    'keyChain.createSuccess': 'Create successful',
    'keyChain.createError': 'Create error',
    'keyChain.getKeyListFailed': 'Failed to get key list',
    'keyChain.missingKeyId': 'Missing key ID',
    'ssh.unknownError': 'Unknown error'
  }
  let translation = mockTranslations[key] || key
  if (params) {
    Object.keys(params).forEach((paramKey) => {
      translation = translation.replace(`{${paramKey}}`, params[paramKey])
    })
  }
  return translation
}

// Mock window.api
const mockApi = {
  getKeyChainList: vi.fn(),
  getKeyChainInfo: vi.fn(),
  createKeyChain: vi.fn(),
  updateKeyChain: vi.fn(),
  deleteKeyChain: vi.fn()
}

// Mock eventBus
vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))

describe('KeyManagement Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const mockKeyChains = [
    {
      key_chain_id: 1,
      chain_name: 'test-key-1',
      chain_type: 'RSA',
      private_key: 'TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE',
      public_key: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAB',
      passphrase: ''
    },
    {
      key_chain_id: 2,
      chain_name: 'test-key-2',
      chain_type: 'ED25519',
      private_key: 'TEST_FIXTURE_BEGIN OPENSSH PRIVATE KEY_TEST_FIXTURE',
      public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI',
      passphrase: ''
    }
  ]

  const createWrapper = (options = {}) => {
    // Setup window.api mock
    ;(window as any).api = mockApi

    return mount(KeyManagementComponent, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-card': {
            template:
              '<div class="a-card" @click="$emit(\'click\')" @contextmenu="$emit(\'contextmenu\', $event)"><div class="ant-card-body"><slot /></div></div>',
            props: ['bordered']
          },
          'a-input': {
            template:
              '<input class="a-input" :value="value" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value); $emit(\'input\', $event)" />',
            props: ['value', 'placeholder', 'size']
          },
          'a-textarea': {
            template:
              '<textarea class="a-textarea" :value="value" :rows="rows" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value); $emit(\'input\', $event)" />',
            props: ['value', 'rows', 'placeholder', 'auto-size', 'spellcheck', 'autocorrect', 'autocapitalize', 'autocomplete']
          },
          'a-input-password': {
            template:
              '<input type="password" class="a-input-password" :value="value" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value); $emit(\'input\', $event)" />',
            props: ['value', 'placeholder']
          },
          'a-button': {
            template: '<button class="a-button" @click="$emit(\'click\')"><slot name="icon" /><slot /></button>',
            props: ['type', 'size', 'disabled']
          },
          'a-form': {
            template: '<form class="a-form"><slot /></form>',
            props: ['label-col', 'wrapper-col', 'layout']
          },
          'a-form-item': {
            template: '<div class="a-form-item"><slot name="label" /><slot /></div>',
            props: ['label', 'validate-status', 'help']
          },
          EditOutlined: { template: '<span class="edit-outlined-icon" />' },
          DeleteOutlined: { template: '<span class="delete-outlined-icon" />' },
          ToTopOutlined: { template: '<span class="to-top-outlined-icon" />' },
          SearchOutlined: { template: '<span class="search-outlined-icon" />' }
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

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock return values
    mockApi.getKeyChainList.mockResolvedValue({
      data: {
        keyChain: mockKeyChains
      }
    })

    mockApi.getKeyChainInfo.mockResolvedValue(mockKeyChains[0])
    mockApi.createKeyChain.mockResolvedValue({
      data: {
        message: 'success'
      }
    })
    mockApi.updateKeyChain.mockResolvedValue({
      data: {
        message: 'success'
      }
    })
    mockApi.deleteKeyChain.mockResolvedValue({
      data: {
        message: 'success'
      }
    })

    // Mock Modal.confirm to call onOk immediately
    vi.mocked(Modal.confirm).mockImplementation((options: any) => {
      if (options.onOk) {
        options.onOk()
      }
      return {
        destroy: vi.fn(),
        update: vi.fn()
      }
    })

    // Clear console output for cleaner test results
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('Component Rendering', () => {
    it('should render the component', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.keychain-config-container').exists()).toBe(true)
    })

    it('should fetch key chain list on mount', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(mockApi.getKeyChainList).toHaveBeenCalled()
    })

    it('should display key chain cards', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      vm.keyChainList = mockKeyChains
      await nextTick()

      const cards = wrapper.findAll('.card-wrapper')
      expect(cards.length).toBe(2)
    })

    it('should show search input and new key button', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.find('.search-input').exists()).toBe(true)
      expect(wrapper.find('.workspace-button').exists()).toBe(true)
    })
  })

  describe('Search Functionality', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      const vm = wrapper.vm as any
      vm.keyChainList = mockKeyChains
      await nextTick()
    })

    it('should filter key chains by name', async () => {
      const vm = wrapper.vm as any
      vm.searchValue = 'test-key-1'
      await nextTick()

      expect(vm.filteredKeyChainList.length).toBe(1)
      expect(vm.filteredKeyChainList[0].chain_name).toBe('test-key-1')
    })

    it('should filter key chains by type', async () => {
      const vm = wrapper.vm as any
      vm.searchValue = 'RSA'
      await nextTick()

      expect(vm.filteredKeyChainList.length).toBe(1)
      expect(vm.filteredKeyChainList[0].chain_type).toBe('RSA')
    })

    it('should show all key chains when search is empty', async () => {
      const vm = wrapper.vm as any
      vm.searchValue = ''
      await nextTick()

      expect(vm.filteredKeyChainList.length).toBe(2)
    })

    it('should be case-insensitive when searching', async () => {
      const vm = wrapper.vm as any
      vm.searchValue = 'TEST-KEY-1'
      await nextTick()

      expect(vm.filteredKeyChainList.length).toBe(1)
    })
  })

  describe('Create Key Chain', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should open new panel when new key button is clicked', async () => {
      const vm = wrapper.vm as any
      const button = wrapper.find('.workspace-button')
      await button.trigger('click')
      await nextTick()

      expect(vm.isRightSectionVisible).toBe(true)
      expect(vm.isEditMode).toBe(false)
    })

    it('should create key chain successfully', async () => {
      const vm = wrapper.vm as any
      vm.isRightSectionVisible = true
      vm.createForm.label = 'NewKey' // No spaces to pass validation
      vm.createForm.privateKey = 'TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE'
      vm.createForm.publicKey = 'ssh-rsaAAAAB3NzaC1yc2EAAAADAQABAAAB' // No spaces
      vm.createForm.passphrase = ''
      // Clear validation errors
      vm.validationErrors.label = ''
      vm.validationErrors.publicKey = ''
      vm.validationErrors.passphrase = ''
      await nextTick()

      await vm.handleCreateKeyChain()
      await nextTick()
      await nextTick() // Wait for async operations

      expect(mockApi.createKeyChain).toHaveBeenCalled()
      expect(vi.mocked(message.success)).toHaveBeenCalledWith('Create successful')
      expect(vm.isRightSectionVisible).toBe(false)
    })

    it('should validate label is required', async () => {
      const vm = wrapper.vm as any
      vm.isRightSectionVisible = true
      vm.createForm.label = ''
      vm.createForm.privateKey = 'TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE'
      await nextTick()

      await vm.handleCreateKeyChain()
      await nextTick()

      expect(mockApi.createKeyChain).not.toHaveBeenCalled()
      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Please enter label')
    })

    it('should validate private key is required', async () => {
      const vm = wrapper.vm as any
      vm.isRightSectionVisible = true
      vm.createForm.label = 'NewKey' // No spaces to pass validation
      vm.createForm.privateKey = ''
      vm.createForm.publicKey = ''
      vm.createForm.passphrase = ''
      // Clear validation errors
      vm.validationErrors.label = ''
      vm.validationErrors.publicKey = ''
      vm.validationErrors.passphrase = ''
      await nextTick()

      await vm.handleCreateKeyChain()
      await nextTick()

      expect(mockApi.createKeyChain).not.toHaveBeenCalled()
      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Please enter private key')
    })

    it('should validate label does not contain spaces', async () => {
      const vm = wrapper.vm as any
      vm.isRightSectionVisible = true
      vm.createForm.label = 'New Key With Space'
      vm.createForm.privateKey = 'TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE'
      await nextTick()

      vm.validateField('label', vm.createForm.label)
      await nextTick()

      expect(vm.validationErrors.label).toBe('Name contains space')
    })

    it('should detect key type from private key', async () => {
      const vm = wrapper.vm as any
      const rsaKey = 'TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE\n...\nTEST_FIXTURE_END RSA PRIVATE KEY_TEST_FIXTURE'
      const ed25519Key = 'TEST_FIXTURE_BEGIN OPENSSH PRIVATE KEY_TEST_FIXTURE\n...\nTEST_FIXTURE_END OPENSSH PRIVATE KEY_TEST_FIXTURE'
      const ecdsaKey = 'TEST_FIXTURE_BEGIN EC PRIVATE KEY_TEST_FIXTURE\n...\nTEST_FIXTURE_END EC PRIVATE KEY_TEST_FIXTURE'

      expect(vm.detectKeyType(rsaKey, '')).toBe('RSA')
      expect(vm.detectKeyType(ed25519Key, '')).toBe('RSA') // Default fallback
      expect(vm.detectKeyType(ecdsaKey, '')).toBe('ECDSA')
    })

    it('should detect key type from public key', async () => {
      const vm = wrapper.vm as any
      const rsaPublicKey = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAB'
      const ed25519PublicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI'
      const ecdsaPublicKey = 'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBB'

      expect(vm.detectKeyType('', rsaPublicKey)).toBe('RSA')
      expect(vm.detectKeyType('', ed25519PublicKey)).toBe('ED25519')
      expect(vm.detectKeyType('', ecdsaPublicKey)).toBe('ECDSA')
    })

    it('should handle create key chain error', async () => {
      mockApi.createKeyChain.mockRejectedValue(new Error('Network error'))

      const vm = wrapper.vm as any
      vm.isRightSectionVisible = true
      vm.createForm.label = 'New Key'
      vm.createForm.privateKey = 'TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE'
      await nextTick()

      await vm.handleCreateKeyChain()
      await nextTick()

      expect(vi.mocked(message.error)).toHaveBeenCalled()
    })
  })

  describe('Edit Key Chain', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should open edit panel when edit icon is clicked', async () => {
      const vm = wrapper.vm as any
      vm.keyChainList = mockKeyChains
      await nextTick()

      await vm.handleEdit(mockKeyChains[0])
      await nextTick()
      await nextTick()

      expect(vm.isEditMode).toBe(true)
      expect(vm.editingKeyChainId).toBe(1)
      expect(vm.isRightSectionVisible).toBe(true)
      expect(vm.createForm.label).toBe('test-key-1')
    })

    it('should update key chain successfully', async () => {
      const vm = wrapper.vm as any
      vm.isEditMode = true
      vm.editingKeyChainId = 1
      vm.isRightSectionVisible = true
      vm.createForm.label = 'UpdatedKey' // No spaces to pass validation
      vm.createForm.privateKey = 'TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE'
      vm.createForm.publicKey = 'ssh-rsaAAAAB3NzaC1yc2EAAAADAQABAAAB' // No spaces
      vm.createForm.passphrase = ''
      // Clear validation errors
      vm.validationErrors.label = ''
      vm.validationErrors.publicKey = ''
      vm.validationErrors.passphrase = ''
      await nextTick()

      await vm.handleUpdateKeyChain()
      await nextTick()
      await nextTick() // Wait for async operations

      expect(mockApi.updateKeyChain).toHaveBeenCalled()
      expect(vi.mocked(message.success)).toHaveBeenCalledWith('Save successful')
      expect(vm.isRightSectionVisible).toBe(false)
    })

    it('should validate key ID exists before update', async () => {
      const vm = wrapper.vm as any
      vm.isEditMode = true
      vm.editingKeyChainId = null
      await nextTick()

      await vm.handleUpdateKeyChain()
      await nextTick()

      expect(mockApi.updateKeyChain).not.toHaveBeenCalled()
      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Missing key ID')
    })

    it('should handle update key chain error', async () => {
      mockApi.updateKeyChain.mockRejectedValue(new Error('Network error'))

      const vm = wrapper.vm as any
      vm.isEditMode = true
      vm.editingKeyChainId = 1
      vm.createForm.label = 'Updated Key'
      vm.createForm.privateKey = 'TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE'
      await nextTick()

      await vm.handleUpdateKeyChain()
      await nextTick()

      expect(vi.mocked(message.error)).toHaveBeenCalled()
    })
  })

  describe('Delete Key Chain', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should show confirmation modal when delete is clicked', async () => {
      const vm = wrapper.vm as any
      await vm.handleRemove(mockKeyChains[0])
      await nextTick()

      expect(Modal.confirm).toHaveBeenCalled()
    })

    it('should delete key chain successfully', async () => {
      const vm = wrapper.vm as any
      await vm.handleRemove(mockKeyChains[0])
      await nextTick()

      expect(mockApi.deleteKeyChain).toHaveBeenCalledWith({ id: 1 })
      expect(vi.mocked(message.success)).toHaveBeenCalledWith('Delete successful: test-key-1')
      expect(mockApi.getKeyChainList).toHaveBeenCalled()
      expect(eventBus.emit).toHaveBeenCalledWith('keyChainUpdated')
    })

    it('should handle delete error', async () => {
      mockApi.deleteKeyChain.mockResolvedValue({
        data: {
          message: 'error'
        }
      })

      const vm = wrapper.vm as any
      await vm.handleRemove(mockKeyChains[0])
      await nextTick()

      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Delete failed')
    })

    it('should not delete if key chain is null', async () => {
      const vm = wrapper.vm as any
      await vm.handleRemove(null)
      await nextTick()

      expect(Modal.confirm).not.toHaveBeenCalled()
    })
  })

  describe('Form Validation', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should validate all fields', async () => {
      const vm = wrapper.vm as any
      // Set valid values without spaces
      vm.createForm.label = 'ValidKey'
      vm.createForm.publicKey = 'ssh-rsaAAAAB3NzaC1yc2EAAAADAQABAAAB' // Remove spaces from public key
      vm.createForm.passphrase = 'validpassphrase'
      // Clear validation errors first
      vm.validationErrors.label = ''
      vm.validationErrors.publicKey = ''
      vm.validationErrors.passphrase = ''
      await nextTick()

      // Call validateAllFields which will validate all fields
      const result = vm.validateAllFields()
      await nextTick()

      // After validation, check if all errors are cleared
      expect(vm.validationErrors.label).toBe('')
      expect(vm.validationErrors.publicKey).toBe('')
      expect(vm.validationErrors.passphrase).toBe('')
      expect(result).toBe(true)
    })

    it('should detect spaces in label', async () => {
      const vm = wrapper.vm as any
      vm.createForm.label = 'Key With Space'
      await nextTick()

      vm.validateField('label', vm.createForm.label)
      expect(vm.validationErrors.label).toBe('Name contains space')
    })

    it('should detect spaces in public key', async () => {
      const vm = wrapper.vm as any
      vm.createForm.publicKey = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAB with space'
      await nextTick()

      vm.validateField('publicKey', vm.createForm.publicKey)
      expect(vm.validationErrors.publicKey).toBe('Public key contains space')
    })

    it('should detect spaces in passphrase', async () => {
      const vm = wrapper.vm as any
      vm.createForm.passphrase = 'pass phrase with space'
      await nextTick()

      vm.validateField('passphrase', vm.createForm.passphrase)
      expect(vm.validationErrors.passphrase).toBe('Passphrase contains space')
    })

    it('should clear validation errors when field is valid', async () => {
      const vm = wrapper.vm as any
      vm.validationErrors.label = 'Name contains space'
      vm.createForm.label = 'ValidKey'
      await nextTick()

      vm.validateField('label', vm.createForm.label)
      expect(vm.validationErrors.label).toBe('')
    })
  })

  describe('File Upload', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should handle file drop', async () => {
      const vm = wrapper.vm as any
      const file = new File(['TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE'], 'test.key', { type: 'text/plain' })
      const dataTransfer = {
        files: [file]
      } as unknown as DataTransfer

      const dropEvent = {
        preventDefault: vi.fn(),
        dataTransfer
      } as unknown as DragEvent

      await vm.handleDrop(dropEvent)
      await nextTick()

      // Wait for FileReader to complete
      await new Promise((resolve) => setTimeout(resolve, 100))
      await nextTick()

      expect(vm.isDragOver).toBe(false)
    })

    it('should handle file input change', async () => {
      const vm = wrapper.vm as any
      const file = new File(['TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE'], 'test.key', { type: 'text/plain' })
      const input = document.createElement('input')
      input.type = 'file'
      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false
      })

      const changeEvent = {
        target: input
      } as unknown as Event

      await vm.handleFileChange(changeEvent)
      await nextTick()

      // Wait for FileReader to complete
      await new Promise((resolve) => setTimeout(resolve, 100))
      await nextTick()

      expect(vm.createForm.privateKey).toBe('TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE')
    })

    it('should trigger file input click', async () => {
      const vm = wrapper.vm as any
      const mockClick = vi.fn()
      vm.fileInputRef = {
        value: '',
        click: mockClick
      }
      await nextTick()

      await vm.handleClickUpload()
      await nextTick()

      expect(mockClick).toHaveBeenCalled()
    })
  })

  describe('Context Menu', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should show context menu on right click', async () => {
      const vm = wrapper.vm as any
      const event = {
        preventDefault: vi.fn(),
        clientX: 100,
        clientY: 100
      } as unknown as MouseEvent

      await vm.showContextMenu(event, mockKeyChains[0])
      await nextTick()

      expect(vm.contextMenuVisible).toBe(true)
      expect(vm.selectedKeyChain).toEqual(mockKeyChains[0])
    })

    it('should adjust context menu position if near viewport edge', async () => {
      const vm = wrapper.vm as any
      Object.defineProperty(window, 'innerWidth', { value: 200, writable: true })
      Object.defineProperty(window, 'innerHeight', { value: 200, writable: true })

      const event = {
        preventDefault: vi.fn(),
        clientX: 150,
        clientY: 150
      } as unknown as MouseEvent

      await vm.showContextMenu(event, mockKeyChains[0])
      await nextTick()

      expect(vm.contextMenuPosition.x).toBeLessThanOrEqual(200 - 160 - 10)
      expect(vm.contextMenuPosition.y).toBeLessThanOrEqual(200 - 120 - 10)
    })

    it('should close context menu on document click', async () => {
      const vm = wrapper.vm as any
      vm.contextMenuVisible = true
      await nextTick()

      await vm.handleDocumentClick()
      await nextTick()

      expect(vm.contextMenuVisible).toBe(false)
    })
  })

  describe('Form Reset', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should reset form when right section is closed', async () => {
      const vm = wrapper.vm as any
      vm.isRightSectionVisible = true
      vm.isEditMode = true
      vm.editingKeyChainId = 1
      vm.createForm.label = 'Test Key'
      vm.createForm.privateKey = 'test-key'
      await nextTick()

      vm.isRightSectionVisible = false
      await nextTick()

      expect(vm.createForm.label).toBe('')
      expect(vm.createForm.privateKey).toBe('')
      expect(vm.isEditMode).toBe(false)
      expect(vm.editingKeyChainId).toBeNull()
    })
  })

  describe('Error Handling', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should handle fetch key chain list error', async () => {
      mockApi.getKeyChainList.mockRejectedValue(new Error('Network error'))

      const vm = wrapper.vm as any
      await vm.fetchKeyChainList()
      await nextTick()

      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Failed to get key list')
    })

    it('should handle empty key chain list response', async () => {
      mockApi.getKeyChainList.mockResolvedValue({
        data: {}
      })

      const vm = wrapper.vm as any
      vm.keyChainList = [] // Reset first
      await vm.fetchKeyChainList()
      await nextTick()

      // The function checks for result.data.keyChain, if it doesn't exist, keyChainList stays unchanged
      // So we need to check that it doesn't have the mock data
      expect(vm.keyChainList).toEqual([])
    })
  })

  describe('Event Bus Integration', () => {
    it('should emit keyChainUpdated event after create', async () => {
      const vm = wrapper.vm as any
      vm.isRightSectionVisible = true
      vm.createForm.label = 'NewKey' // No spaces to pass validation
      vm.createForm.privateKey = 'TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE'
      vm.createForm.publicKey = 'ssh-rsaAAAAB3NzaC1yc2EAAAADAQABAAAB' // No spaces
      vm.createForm.passphrase = ''
      // Clear validation errors
      vm.validationErrors.label = ''
      vm.validationErrors.publicKey = ''
      vm.validationErrors.passphrase = ''
      await nextTick()

      await vm.handleCreateKeyChain()
      await nextTick()
      await nextTick() // Wait for async operations

      expect(eventBus.emit).toHaveBeenCalledWith('keyChainUpdated')
    })

    it('should emit keyChainUpdated event after update', async () => {
      const vm = wrapper.vm as any
      vm.isEditMode = true
      vm.editingKeyChainId = 1
      vm.createForm.label = 'UpdatedKey' // No spaces to pass validation
      vm.createForm.privateKey = 'TEST_FIXTURE_BEGIN RSA PRIVATE KEY_TEST_FIXTURE'
      vm.createForm.publicKey = 'ssh-rsaAAAAB3NzaC1yc2EAAAADAQABAAAB' // No spaces
      vm.createForm.passphrase = ''
      // Clear validation errors
      vm.validationErrors.label = ''
      vm.validationErrors.publicKey = ''
      vm.validationErrors.passphrase = ''
      await nextTick()

      await vm.handleUpdateKeyChain()
      await nextTick()
      await nextTick() // Wait for async operations

      expect(eventBus.emit).toHaveBeenCalledWith('keyChainUpdated')
    })

    it('should emit keyChainUpdated event after delete', async () => {
      const vm = wrapper.vm as any
      await vm.handleRemove(mockKeyChains[0])
      await nextTick()

      expect(eventBus.emit).toHaveBeenCalledWith('keyChainUpdated')
    })
  })
})
