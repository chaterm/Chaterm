import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import UserInfoComponent from '../userInfo.vue'
import {
  getUser,
  updateUser,
  changePassword,
  checkUserDevice,
  sendEmailBindCode,
  verifyAndBindEmail,
  sendMobileBindCode,
  verifyAndBindMobile
} from '@api/user/user'
import { useDeviceStore } from '@/store/useDeviceStore'
import { message } from 'ant-design-vue'
import zxcvbn from 'zxcvbn'
import { isChineseEdition } from '@/utils/edition'

// Mock ant-design-vue message
vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// Mock i18n
vi.mock('@/locales', () => {
  const mockT = (key: string) => {
    const mockTranslations: Record<string, string> = {
      'userInfo.enterprise': 'Enterprise User',
      'userInfo.personal': 'Personal User',
      'userInfo.vip': 'VIP User',
      'userInfo.name': 'Name',
      'userInfo.username': 'Username',
      'userInfo.mobile': 'Mobile',
      'userInfo.email': 'Email',
      'userInfo.ip': 'IP Address',
      'userInfo.macAddress': 'MAC Address',
      'userInfo.password': 'Password',
      'userInfo.pleaseInputName': 'Please enter name',
      'userInfo.pleaseInputUsername': 'Please enter username',
      'userInfo.pleaseInputMobile': 'Please enter mobile number',
      'userInfo.pleaseInputNewPassword': 'Please enter new password',
      'userInfo.confirmPassword': 'Confirm Password',
      'userInfo.pleaseInputConfirmPassword': 'Please enter password again',
      'userInfo.passwordMismatch': 'Passwords do not match',
      'userInfo.nameRequired': 'Name cannot be empty',
      'userInfo.nameTooLong': 'Name cannot exceed 20 characters',
      'userInfo.usernameLengthError': 'Username must be between 6 and 20 characters',
      'userInfo.usernameFormatError': 'Username can only contain letters, numbers, and underscores',
      'userInfo.mobileInvalid': 'Please enter a valid mobile number',
      'userInfo.passwordLengthError': 'Password must be at least 6 characters',
      'userInfo.passwordStrengthError': 'Password strength must be at least weak',
      'userInfo.passwordStrength': 'Password Strength',
      'userInfo.passwordStrengthWeak': 'Weak',
      'userInfo.passwordStrengthMedium': 'Medium',
      'userInfo.passwordStrengthStrong': 'Strong',
      'userInfo.updateSuccess': 'Update successful',
      'userInfo.updateFailed': 'Update failed',
      'userInfo.passwordResetSuccess': 'Password reset successful',
      'userInfo.passwordResetFailed': 'Password reset failed',
      'userInfo.edit': 'Edit',
      'userInfo.save': 'Save',
      'userInfo.cancel': 'Cancel',
      'userInfo.resetPassword': 'Reset Password',
      'userInfo.expirationTime': 'Expiration Time',
      'userInfo.bindEmail': 'Bind Email',
      'userInfo.modifyEmail': 'Modify Email',
      'userInfo.pleaseInputEmail': 'Please enter email',
      'userInfo.pleaseInputEmailCode': 'Please enter email verification code',
      'userInfo.sendEmailCode': 'Get Verification Code',
      'userInfo.emailCodeSent': 'Verification code sent',
      'userInfo.emailBindSuccess': 'Email binding successful',
      'userInfo.emailBindFailed': 'Email binding failed',
      'userInfo.bindMobile': 'Bind Mobile',
      'userInfo.modifyMobile': 'Modify Mobile',
      'userInfo.pleaseInputMobileCode': 'Please enter mobile verification code',
      'userInfo.sendMobileCode': 'Get Verification Code',
      'userInfo.mobileCodeSent': 'Verification code sent',
      'userInfo.mobileBindSuccess': 'Mobile binding successful',
      'userInfo.mobileBindFailed': 'Mobile binding failed',
      'common.confirm': 'Confirm',
      'common.cancel': 'Cancel',
      'common.invalidEmail': 'Invalid email format'
    }
    return mockTranslations[key] || key
  }
  return {
    default: {
      global: {
        t: mockT
      }
    }
  }
})

// Mock API functions
vi.mock('@api/user/user', () => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  changePassword: vi.fn(),
  checkUserDevice: vi.fn(),
  sendEmailBindCode: vi.fn(),
  verifyAndBindEmail: vi.fn(),
  sendMobileBindCode: vi.fn(),
  verifyAndBindMobile: vi.fn()
}))

// Mock zxcvbn
vi.mock('zxcvbn', () => ({
  default: vi.fn()
}))

// Mock isChineseEdition
vi.mock('@/utils/edition', () => ({
  isChineseEdition: vi.fn(() => false)
}))

describe('UserInfo Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>
  let deviceStore: ReturnType<typeof useDeviceStore>

  const createWrapper = (options = {}) => {
    return mount(UserInfoComponent, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-card': {
            template: '<div class="a-card"><div class="ant-card-body"><slot /></div></div>'
          },
          'a-form': {
            template: '<form class="a-form"><slot /></form>'
          },
          'a-form-item': {
            template: '<div class="a-form-item"><slot name="label" /><slot /></div>',
            props: ['label', 'name', 'validate-status', 'help']
          },
          'a-input': {
            template: '<input class="a-input" :value="value" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value)" />',
            props: ['value', 'placeholder', 'size']
          },
          'a-input-password': {
            template: '<input type="password" class="a-input-password" :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
            props: ['value', 'placeholder', 'size']
          },
          'a-button': {
            template: '<button class="a-button" @click="$emit(\'click\')"><slot /></button>',
            props: ['type', 'size', 'disabled', 'title']
          },
          'a-tag': {
            template: '<span class="a-tag" :class="$attrs.class"><slot /></span>',
            props: ['title']
          },
          'a-divider': {
            template: '<div class="a-divider" />',
            props: ['style']
          },
          'a-modal': {
            template:
              '<div v-if="open" class="a-modal"><div class="ant-modal-header"><slot name="title" /></div><div class="ant-modal-body"><slot /></div><div class="ant-modal-footer"><button @click="$emit(\'cancel\')">Cancel</button><button @click="$emit(\'ok\')">Confirm</button></div></div>',
            props: ['open', 'title', 'width', 'centered', 'ok-text', 'cancel-text']
          },
          FormOutlined: { template: '<span class="form-outlined-icon" />' },
          EditOutlined: { template: '<span class="edit-outlined-icon" />' },
          CheckOutlined: { template: '<span class="check-outlined-icon" />' },
          CloseOutlined: { template: '<span class="close-outlined-icon" />' }
        },
        mocks: {
          $t: (key: string) => key
        }
      },
      ...options
    })
  }

  beforeEach(() => {
    // Setup Pinia
    pinia = createPinia()
    setActivePinia(pinia)
    deviceStore = useDeviceStore()
    deviceStore.setDeviceIp('192.168.1.1')
    deviceStore.setMacAddress('00:11:22:33:44:55')

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock return values
    vi.mocked(getUser).mockResolvedValue({
      code: 200,
      data: {
        uid: 1001,
        name: 'Test User',
        username: 'testuser',
        email: 'test@example.com',
        mobile: '13800138000',
        avatar: 'https://example.com/avatar.jpg',
        subscription: 'free',
        registrationType: 0,
        localIp: '192.168.1.1',
        macAddress: '00:11:22:33:44:55'
      }
    } as any)

    vi.mocked(checkUserDevice).mockResolvedValue({
      code: 200,
      data: {
        isOfficeDevice: false
      }
    } as any)

    vi.mocked(updateUser).mockResolvedValue({ code: 200 } as any)
    vi.mocked(changePassword).mockResolvedValue({ code: 200 } as any)
    vi.mocked(sendEmailBindCode).mockResolvedValue({ code: 200 } as any)
    vi.mocked(verifyAndBindEmail).mockResolvedValue({ code: 200 } as any)
    vi.mocked(sendMobileBindCode).mockResolvedValue({ code: 200 } as any)
    vi.mocked(verifyAndBindMobile).mockResolvedValue({ code: 200 } as any)

    vi.mocked(zxcvbn).mockReturnValue({ score: 2 } as any)

    // Clear console output for cleaner test results
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    // Clear any timers
    vi.clearAllTimers()
  })

  describe('Component Rendering - Core Logic', () => {
    it('should not show edit buttons for UID 2000001', async () => {
      vi.mocked(getUser).mockResolvedValue({
        code: 200,
        data: {
          uid: 2000001,
          name: 'Test User',
          username: 'testuser'
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const editButton = wrapper.find('.edit-icon-btn')
      expect(editButton.exists()).toBe(false)
    })
  })

  describe('User Interactions - Edit Mode', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should enter edit mode when edit button is clicked', async () => {
      const editButton = wrapper.find('.edit-icon-btn')
      await editButton.trigger('click')
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.isEditing).toBe(true)
    })

    it('should cancel editing and restore original values', async () => {
      const editButton = wrapper.find('.edit-icon-btn')
      await editButton.trigger('click')
      await nextTick()

      const vm = wrapper.vm as any
      vm.formState.name = 'Modified Name'
      vm.formState.username = 'modifieduser'

      const cancelButton = wrapper.findAll('.edit-icon-btn')[1]
      await cancelButton.trigger('click')
      await nextTick()

      expect(vm.isEditing).toBe(false)
      expect(vm.formState.name).toBe('Test User')
      expect(vm.formState.username).toBe('testuser')
    })

    it('should save user information successfully', async () => {
      const editButton = wrapper.find('.edit-icon-btn')
      await editButton.trigger('click')
      await nextTick()

      const vm = wrapper.vm as any
      vm.formState.name = 'Updated Name'
      vm.formState.username = 'updateduser'

      await vm.handleSave()
      await nextTick()

      expect(vi.mocked(updateUser)).toHaveBeenCalledWith({
        username: 'updateduser',
        name: 'Updated Name'
      })
      expect(vi.mocked(message.success)).toHaveBeenCalledWith('Update successful')
      expect(vm.isEditing).toBe(false)
    })

    it('should show error message when save fails', async () => {
      vi.mocked(updateUser).mockResolvedValue({
        code: 400,
        message: 'Update failed'
      } as any)

      const editButton = wrapper.find('.edit-icon-btn')
      await editButton.trigger('click')
      await nextTick()

      const vm = wrapper.vm as any
      await vm.handleSave()
      await nextTick()

      expect(vi.mocked(message.error)).toHaveBeenCalled()
    })
  })

  describe('Form Validation', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should validate username length (6-20 characters)', async () => {
      const vm = wrapper.vm as any
      vm.isEditing = true
      await nextTick()

      vm.formState.username = 'short'
      const result = vm.validateSave()
      expect(result).toBe(false)
      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Username must be between 6 and 20 characters')

      vm.formState.username = 'a'.repeat(21)
      const result2 = vm.validateSave()
      expect(result2).toBe(false)
    })

    it('should validate username format (only letters, numbers, underscore)', async () => {
      const vm = wrapper.vm as any
      vm.isEditing = true
      await nextTick()

      vm.formState.username = 'valid_user123'
      vm.formState.name = 'Valid Name'
      let result = vm.validateSave()
      expect(result).toBe(true)

      vm.formState.username = 'invalid-user!'
      result = vm.validateSave()
      expect(result).toBe(false)
      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Username can only contain letters, numbers, and underscores')
    })

    it('should validate name is not empty', async () => {
      const vm = wrapper.vm as any
      vm.isEditing = true
      await nextTick()

      vm.formState.name = ''
      vm.formState.username = 'validuser'
      const result = vm.validateSave()
      expect(result).toBe(false)
      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Name cannot be empty')
    })

    it('should validate name length (max 20 characters)', async () => {
      const vm = wrapper.vm as any
      vm.isEditing = true
      await nextTick()

      vm.formState.name = 'a'.repeat(21)
      vm.formState.username = 'validuser'
      const result = vm.validateSave()
      expect(result).toBe(false)
      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Name cannot exceed 20 characters')
    })

    it('should validate password length (min 6 characters)', async () => {
      const vm = wrapper.vm as any
      vm.showPasswordModal = true
      await nextTick()

      vm.formState.newPassword = '12345'
      const result = vm.validatePassword()
      expect(result).toBe(false)
      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Password must be at least 6 characters')
    })

    it('should validate password strength', async () => {
      const vm = wrapper.vm as any
      vm.showPasswordModal = true
      await nextTick()

      vi.mocked(zxcvbn).mockReturnValue({ score: 0 } as any)
      vm.formState.newPassword = '123456'
      const result = vm.validatePassword()
      expect(result).toBe(false)
      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Password strength must be at least weak')
    })

    it('should validate password match', async () => {
      const vm = wrapper.vm as any
      vm.showPasswordModal = true
      await nextTick()

      vm.formState.newPassword = 'password123'
      vm.formState.confirmPassword = 'password456'
      const result = vm.validatePassword()
      expect(result).toBe(false)
      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Passwords do not match')
    })
  })

  describe('Password Reset', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should reset password successfully', async () => {
      const vm = wrapper.vm as any
      vm.showPasswordModal = true
      vm.formState.newPassword = 'newpassword123'
      vm.formState.confirmPassword = 'newpassword123'
      vi.mocked(zxcvbn).mockReturnValue({ score: 2 } as any)

      await vm.handleResetPassword()
      await nextTick()

      expect(vi.mocked(changePassword)).toHaveBeenCalledWith({
        password: 'newpassword123'
      })
      expect(vi.mocked(message.success)).toHaveBeenCalledWith('Password reset successful')
      expect(vm.showPasswordModal).toBe(false)
    })

    it('should compute password strength correctly', async () => {
      const vm = wrapper.vm as any
      vm.formState.newPassword = 'testpassword'

      vi.mocked(zxcvbn).mockReturnValue({ score: 2 } as any)
      const strength = vm.strength
      expect(strength).toBe(2)

      vm.formState.newPassword = ''
      const strengthEmpty = vm.strength
      expect(strengthEmpty).toBeNull()
    })

    it('should check password match correctly', async () => {
      const vm = wrapper.vm as any
      vm.formState.newPassword = 'password123'
      vm.formState.confirmPassword = 'password123'

      expect(vm.passwordMatch).toBe(true)

      vm.formState.confirmPassword = 'password456'
      expect(vm.passwordMatch).toBe(false)

      vm.formState.confirmPassword = ''
      expect(vm.passwordMatch).toBe(true)
    })
  })

  describe('Email Binding', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should validate email format before sending code', async () => {
      const vm = wrapper.vm as any
      vm.showEmailModal = true
      vm.emailBindForm.email = 'invalid-email'
      await nextTick()

      await vm.handleSendEmailBindCode()
      await nextTick()

      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Invalid email format')
      expect(vi.mocked(sendEmailBindCode)).not.toHaveBeenCalled()
    })

    it('should send email bind code successfully', async () => {
      const vm = wrapper.vm as any
      vm.showEmailModal = true
      vm.emailBindForm.email = 'newemail@example.com'
      await nextTick()

      await vm.handleSendEmailBindCode()
      await nextTick()

      expect(vi.mocked(sendEmailBindCode)).toHaveBeenCalledWith({
        email: 'newemail@example.com'
      })
      expect(vi.mocked(message.success)).toHaveBeenCalledWith('Verification code sent')
      expect(vm.emailCodeCountdown).toBe(300)
    })

    it('should start countdown after sending email code', async () => {
      vi.useFakeTimers()
      const vm = wrapper.vm as any
      vm.showEmailModal = true
      vm.emailBindForm.email = 'test@example.com'
      await nextTick()

      await vm.handleSendEmailBindCode()
      await nextTick()

      expect(vm.emailCodeCountdown).toBe(300)

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(vm.emailCodeCountdown).toBe(299)

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(vm.emailCodeCountdown).toBe(298)

      vi.useRealTimers()
    })

    it('should verify and bind email successfully', async () => {
      const vm = wrapper.vm as any
      vm.showEmailModal = true
      vm.emailBindForm.email = 'newemail@example.com'
      vm.emailBindForm.code = '123456'
      await nextTick()

      await vm.handleVerifyAndBindEmail()
      await nextTick()

      expect(vi.mocked(verifyAndBindEmail)).toHaveBeenCalledWith({
        email: 'newemail@example.com',
        code: '123456'
      })
      expect(vi.mocked(message.success)).toHaveBeenCalledWith('Email binding successful')
      expect(vm.showEmailModal).toBe(false)
      expect(vi.mocked(getUser)).toHaveBeenCalled()
    })

    it('should show error when email binding fails', async () => {
      vi.mocked(verifyAndBindEmail).mockResolvedValue({
        code: 400,
        message: 'Invalid code'
      } as any)

      const vm = wrapper.vm as any
      vm.showEmailModal = true
      vm.emailBindForm.email = 'test@example.com'
      vm.emailBindForm.code = '123456'
      await nextTick()

      await vm.handleVerifyAndBindEmail()
      await nextTick()

      expect(vi.mocked(message.error)).toHaveBeenCalled()
    })
  })

  describe('Mobile Binding', () => {
    beforeEach(() => {
      vi.mocked(isChineseEdition).mockReturnValue(true)
    })

    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should validate mobile format before sending code', async () => {
      const vm = wrapper.vm as any
      vm.showMobileModal = true
      vm.mobileBindForm.mobile = '1234567890'
      await nextTick()

      await vm.handleSendMobileBindCode()
      await nextTick()

      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Please enter a valid mobile number')
      expect(vi.mocked(sendMobileBindCode)).not.toHaveBeenCalled()
    })

    it('should send mobile bind code successfully', async () => {
      const vm = wrapper.vm as any
      vm.showMobileModal = true
      vm.mobileBindForm.mobile = '13900139000'
      await nextTick()

      await vm.handleSendMobileBindCode()
      await nextTick()

      expect(vi.mocked(sendMobileBindCode)).toHaveBeenCalledWith({
        mobile: '13900139000'
      })
      expect(vi.mocked(message.success)).toHaveBeenCalledWith('Verification code sent')
      expect(vm.mobileCodeCountdown).toBe(300)
    })

    it('should start countdown after sending mobile code', async () => {
      vi.useFakeTimers()
      const vm = wrapper.vm as any
      vm.showMobileModal = true
      vm.mobileBindForm.mobile = '13900139000'
      await nextTick()

      await vm.handleSendMobileBindCode()
      await nextTick()

      expect(vm.mobileCodeCountdown).toBe(300)

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(vm.mobileCodeCountdown).toBe(299)

      vi.useRealTimers()
    })

    it('should verify and bind mobile successfully', async () => {
      const vm = wrapper.vm as any
      vm.showMobileModal = true
      vm.mobileBindForm.mobile = '13900139000'
      vm.mobileBindForm.code = '123456'
      await nextTick()

      await vm.handleVerifyAndBindMobile()
      await nextTick()

      expect(vi.mocked(verifyAndBindMobile)).toHaveBeenCalledWith({
        mobile: '13900139000',
        code: '123456'
      })
      expect(vi.mocked(message.success)).toHaveBeenCalledWith('Mobile binding successful')
      expect(vm.showMobileModal).toBe(false)
      expect(vi.mocked(getUser)).toHaveBeenCalled()
    })

    it('should show error when mobile binding fails', async () => {
      vi.mocked(verifyAndBindMobile).mockResolvedValue({
        code: 400,
        message: 'Invalid code'
      } as any)

      const vm = wrapper.vm as any
      vm.showMobileModal = true
      vm.mobileBindForm.mobile = '13900139000'
      vm.mobileBindForm.code = '123456'
      await nextTick()

      await vm.handleVerifyAndBindMobile()
      await nextTick()

      expect(vi.mocked(message.error)).toHaveBeenCalled()
    })
  })

  describe('API Calls', () => {
    it('should fetch user info on mount', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(vi.mocked(getUser)).toHaveBeenCalledWith({})
    })

    it('should check user device after fetching user info', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(vi.mocked(checkUserDevice)).toHaveBeenCalledWith({
        ip: '192.168.1.1',
        macAddress: '00:11:22:33:44:55'
      })
    })

    it('should update device info from store', async () => {
      deviceStore.setDeviceIp('10.0.0.1')
      deviceStore.setMacAddress('AA:BB:CC:DD:EE:FF')

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.userInfo.localIp).toBe('10.0.0.1')
      expect(vm.userInfo.macAddress).toBe('AA:BB:CC:DD:EE:FF')
    })

    it('should update isOfficeDevice from checkUserDevice response', async () => {
      vi.mocked(checkUserDevice).mockResolvedValue({
        code: 200,
        data: {
          isOfficeDevice: true
        }
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.userInfo.isOfficeDevice).toBe(true)
    })

    it('should refresh user info after successful update', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      vi.mocked(getUser).mockClear()

      vm.formState.name = 'Updated Name'
      vm.formState.username = 'updateduser'
      await vm.handleSave()
      await nextTick()

      expect(vi.mocked(getUser)).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle API error with response message', async () => {
      const error = {
        response: {
          data: {
            message: 'Custom error message'
          }
        }
      }

      vi.mocked(updateUser).mockRejectedValue(error)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      vm.isEditing = true
      vm.formState.name = 'Test'
      vm.formState.username = 'testuser'
      await nextTick()

      await vm.handleSave()
      await nextTick()

      expect(vi.mocked(message.error)).toHaveBeenCalledWith('Custom error message')
    })

    it('should handle API error with default message', async () => {
      const error = new Error('Network error')

      vi.mocked(updateUser).mockRejectedValue(error)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      vm.isEditing = true
      vm.formState.name = 'Test'
      vm.formState.username = 'testuser'
      await nextTick()

      await vm.handleSave()
      await nextTick()

      expect(vi.mocked(message.error)).toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty user info gracefully', async () => {
      vi.mocked(getUser).mockResolvedValue({
        code: 200,
        data: {}
      } as any)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.userInfo).toBeDefined()
    })

    it('should disable send code button during countdown', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      vi.useFakeTimers()
      const vm = wrapper.vm as any
      vm.showEmailModal = true
      vm.emailBindForm.email = 'test@example.com'
      await nextTick()

      await vm.handleSendEmailBindCode()
      await nextTick()

      // Button should be disabled during countdown
      expect(vm.emailCodeCountdown).toBeGreaterThan(0)

      vi.useRealTimers()
    })
  })
})
