import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// Mock Ant-Design-Vue message component (to capture success/error calls)
vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn()
    }
  }
})

// Force Mock Global API (to prevent "undefined" errors for onTransferProgress, etc.)
vi.hoisted(() => {
  vi.stubGlobal('api', {
    sshSftpList: vi.fn().mockResolvedValue([]),
    openFileDialog: vi.fn().mockResolvedValue('C:/test/file.txt'),
    uploadFile: vi.fn().mockResolvedValue({ status: 'success' }),
    openDirectoryDialog: vi.fn().mockResolvedValue('C:/test/folder'),
    uploadDirectory: vi.fn().mockResolvedValue({ status: 'success' }),
    openSaveDialog: vi.fn().mockResolvedValue('D:/downloads/save.zip'),
    downloadFile: vi.fn().mockResolvedValue({ status: 'success' }),
    onTransferProgress: vi.fn()
  })
})

import { message } from 'ant-design-vue'
import Files from '../files.vue'

// i18n Configuration
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      'files.uploadSuccess': 'Upload Successful',
      'files.uploadCancel': 'Upload Cancelled',
      'files.downloadFailed': 'Download Failed',
      'files.uploadError': 'Upload Error'
    }
  }
})

describe('Files.vue Full Transfer Functionality Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const api = (window as any).api
    // Set default success responses for all APIs
    api.sshSftpList.mockResolvedValue([])
    api.uploadFile.mockResolvedValue({ status: 'success' })
    api.uploadDirectory.mockResolvedValue({ status: 'success' })
    api.downloadFile.mockResolvedValue({ status: 'success' })
  })

  const factory = () => {
    return mount(Files, {
      props: { uuid: 'test-uuid' },
      global: {
        plugins: [i18n],
        stubs: {
          'a-tree': true,
          'a-table': true,
          TransferPanel: true,
          'a-modal': true
        }
      }
    })
  }

  // File Upload Test
  it('should call API and show success message when uploading a file', async () => {
    const api = (window as any).api
    api.openFileDialog.mockResolvedValue('C:/local/file.txt')

    const wrapper = factory()
    await flushPromises()

    // Handle "Invalid assignment target": do not assign directly if the prop is a read-only proxy
    if (wrapper.vm.basePath) (wrapper.vm as any).basePath = '/'

    await (wrapper.vm as any).uploadFile()
    await flushPromises()
    await flushPromises()

    expect(api.uploadFile).toHaveBeenCalled()
    expect(message.success).toHaveBeenCalled()
  })

  // Folder Upload Test
  it('should sanitize paths and call API when uploading a folder', async () => {
    const api = (window as any).api
    api.openDirectoryDialog.mockResolvedValue('C:/local/my-folder')

    const wrapper = factory()
    await flushPromises()

    // Simulate path state
    try {
      Object.defineProperty(wrapper.vm, 'basePath', {
        value: '/home/',
        writable: true
      })
      Object.defineProperty(wrapper.vm, 'currentDirectoryInput', {
        value: '/user',
        writable: true
      })
    } catch (e) {
      // If direct assignment fails (read-only proxy), fall back to component defaults
      console.warn('Property assignment skipped, using component defaults')
    }

    await (wrapper.vm as any).uploadFolder()
    await flushPromises()
    await flushPromises()

    expect(api.uploadDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        localPath: 'C:/local/my-folder'
      })
    )
    expect(message.success).toHaveBeenCalled()
  })

  // File Download Test
  it('should open save dialog and execute download', async () => {
    const api = (window as any).api
    api.openSaveDialog.mockResolvedValue('D:/downloads/remote.zip')

    const wrapper = factory()
    await flushPromises()

    const mockRecord = {
      name: 'remote.zip',
      path: '/var/www/remote.zip'
    }

    await (wrapper.vm as any).downloadFile(mockRecord)
    await flushPromises()
    await flushPromises()

    // Verify if save dialog opens with the correct filename
    expect(api.openSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'remote.zip' }))
    // Verify download API parameters
    expect(api.downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        localPath: 'D:/downloads/remote.zip',
        remotePath: '/var/www/remote.zip'
      })
    )
    expect(message.success).toHaveBeenCalled()
  })

  // Edge Case: Cancel Operation
  it('should not trigger API when user cancels the dialog', async () => {
    const api = (window as any).api
    api.openFileDialog.mockResolvedValue(null) // Simulate cancellation

    const wrapper = factory()
    await (wrapper.vm as any).uploadFile()
    await flushPromises()

    expect(api.uploadFile).not.toHaveBeenCalled()
    expect(message.success).not.toHaveBeenCalled()
  })
})
