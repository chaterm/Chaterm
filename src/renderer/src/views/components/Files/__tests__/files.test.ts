import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// Mock Ant Design Vue message and Modal
vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      loading: vi.fn()
    },
    Modal: {
      confirm: vi.fn()
    }
  }
})

import { message } from 'ant-design-vue'

// @ts-ignore
import Files from '../files.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: { ok: 'OK', cancel: 'Cancel' },
      files: {
        uploadSuccess: 'Upload successful',
        uploadCancel: 'Upload cancelled',
        uploadFailed: 'Upload failed',
        uploadError: 'Upload error',

        downloadSuccess: 'Download successful',
        downloadCancel: 'Download cancelled',
        downloadSkipped: 'Download skipped',
        downloadFailed: 'Download failed',
        downloadError: 'Download error',

        modifySuccess: 'Modify successful',
        modifyFailed: 'Modify failed',
        modifyError: 'Modify error',

        deleting: 'Deleting…',
        deleteSuccess: 'Delete successful',
        deleteFailed: 'Delete failed',
        deleteError: 'Delete error',

        copyFileSuccess: 'Copy successful',
        copyFileFailed: 'Copy failed',
        copyFileError: 'Copy error',

        moveFileSuccess: 'Move successful',
        moveFileFailed: 'Move failed',
        moveFileError: 'Move error',

        modifyFilePermissionsFailed: 'Chmod failed',
        modifyFilePermissionsError: 'Chmod error',

        read: 'Read',
        write: 'Write',
        exec: 'Execute',

        rollback: 'Rollback'
      }
    }
  }
})

// Provide a deterministic global api for the component
const stubApi = () => ({
  sshSftpList: vi.fn().mockResolvedValue([]),
  openFileDialog: vi.fn().mockResolvedValue('C:/test/file.txt'),
  uploadFile: vi.fn().mockResolvedValue({ status: 'success' }),
  openDirectoryDialog: vi.fn().mockResolvedValue('C:/test/folder'),
  uploadDirectory: vi.fn().mockResolvedValue({ status: 'success' }),
  openSaveDialog: vi.fn().mockResolvedValue('D:/downloads/remote.zip'),
  downloadFile: vi.fn().mockResolvedValue({ status: 'success' }),
  renameFile: vi.fn().mockResolvedValue({ status: 'success' }),
  deleteFile: vi.fn().mockResolvedValue({ status: 'success' }),
  chmodFile: vi.fn().mockResolvedValue({ status: 'success' }),
  sshConnExec: vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
})

describe('files.vue - high coverage tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('api', stubApi())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const factory = (props: any = {}) =>
    mount(Files, {
      props: { uuid: 'test-uuid', ...props },
      global: {
        plugins: [i18n],
        stubs: {
          'a-tree': true,
          'a-table': true,
          'a-modal': true,
          'a-card': true,
          'a-space': true,
          'a-button': true,
          'a-tooltip': true,
          'a-dropdown': true,
          'a-menu': true,
          'a-menu-item': true,
          'a-input': true,
          'a-checkbox': true,
          'a-checkbox-group': true,
          'a-tag': true,
          'a-divider': true,
          'a-badge': true,
          'a-popover': true,
          'a-popconfirm': true,
          'a-empty': true,
          'a-spin': true,
          copyOrMoveModal: true
        }
      }
    })

  it('loads files on mount and handles error-string list response', async () => {
    const api = (window as any).api
    api.sshSftpList.mockResolvedValueOnce(['/Default//err//message'])
    const wrapper = factory()
    await flushPromises()

    // Ensure the error path is exercised (showErr + errTips are internal reactive values)
    expect((wrapper.vm as any).showErr).toBe(true)
    expect(String((wrapper.vm as any).errTips)).toContain('err/message')
  })

  it('uploadFile: handles success/cancelled/skipped/failure + thrown error + user cancel', async () => {
    const api = (window as any).api
    const wrapper = factory()
    await flushPromises()

    // Cancel dialog => no API call
    api.openFileDialog.mockResolvedValueOnce(null)
    await (wrapper.vm as any).uploadFile()
    expect(api.uploadFile).not.toHaveBeenCalled()

    // success
    api.openFileDialog.mockResolvedValueOnce('C:/a.txt')
    api.uploadFile.mockResolvedValueOnce({ status: 'success' })
    await (wrapper.vm as any).uploadFile()
    await flushPromises()
    expect(message.success).toHaveBeenCalled()

    // cancelled
    api.openFileDialog.mockResolvedValueOnce('C:/b.txt')
    api.uploadFile.mockResolvedValueOnce({ status: 'cancelled' })
    await (wrapper.vm as any).uploadFile()
    await flushPromises()
    expect(message.info).toHaveBeenCalled()

    // skipped
    api.openFileDialog.mockResolvedValueOnce('C:/c.txt')
    api.uploadFile.mockResolvedValueOnce({ status: 'skipped' })
    await (wrapper.vm as any).uploadFile()
    await flushPromises()
    expect(message.info).toHaveBeenCalled()

    // unknown status => error channel
    api.openFileDialog.mockResolvedValueOnce('C:/d.txt')
    api.uploadFile.mockResolvedValueOnce({ status: 'failed', message: 'nope' })
    await (wrapper.vm as any).uploadFile()
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // thrown error
    api.openFileDialog.mockResolvedValueOnce('C:/e.txt')
    api.uploadFile.mockRejectedValueOnce(new Error('boom'))
    await (wrapper.vm as any).uploadFile()
    await flushPromises()
    expect(message.error).toHaveBeenCalled()
  })

  it('uploadFolder: handles success/cancelled/failure + thrown error + user cancel', async () => {
    const api = (window as any).api
    const wrapper = factory()
    await flushPromises()

    // cancel dialog
    api.openDirectoryDialog.mockResolvedValueOnce(null)
    await (wrapper.vm as any).uploadFolder()
    expect(api.uploadDirectory).not.toHaveBeenCalled()

    // success
    api.openDirectoryDialog.mockResolvedValueOnce('C:/folder1')
    api.uploadDirectory.mockResolvedValueOnce({ status: 'success' })
    await (wrapper.vm as any).uploadFolder()
    await flushPromises()
    expect(message.success).toHaveBeenCalled()

    // cancelled
    api.openDirectoryDialog.mockResolvedValueOnce('C:/folder2')
    api.uploadDirectory.mockResolvedValueOnce({ status: 'cancelled' })
    await (wrapper.vm as any).uploadFolder()
    await flushPromises()
    expect(message.success).toHaveBeenCalled()

    // failure still uses success channel but with failure content
    api.openDirectoryDialog.mockResolvedValueOnce('C:/folder3')
    api.uploadDirectory.mockResolvedValueOnce({ status: 'failed', message: 'denied' })
    await (wrapper.vm as any).uploadFolder()
    await flushPromises()
    expect(message.success).toHaveBeenCalled()

    // thrown error in API call
    api.openDirectoryDialog.mockResolvedValueOnce('C:/folder4')
    api.uploadDirectory.mockRejectedValueOnce(new Error('oops'))
    await (wrapper.vm as any).uploadFolder()
    await flushPromises()
    expect(message.error).toHaveBeenCalled()
  })

  it('downloadFile: handles success/cancelled/skipped/failure + thrown error + user cancel', async () => {
    const api = (window as any).api
    const wrapper = factory()
    await flushPromises()

    const record = { name: 'remote.zip', path: '/var/remote.zip' }

    // cancel save dialog
    api.openSaveDialog.mockResolvedValueOnce(null)
    await (wrapper.vm as any).downloadFile(record)
    expect(api.downloadFile).not.toHaveBeenCalled()

    // success
    api.openSaveDialog.mockResolvedValueOnce('D:/a.zip')
    api.downloadFile.mockResolvedValueOnce({ status: 'success' })
    await (wrapper.vm as any).downloadFile(record)
    await flushPromises()
    expect(message.success).toHaveBeenCalled()

    // cancelled
    api.openSaveDialog.mockResolvedValueOnce('D:/b.zip')
    api.downloadFile.mockResolvedValueOnce({ status: 'cancelled' })
    await (wrapper.vm as any).downloadFile(record)
    await flushPromises()
    expect(message.info).toHaveBeenCalled()

    // skipped
    api.openSaveDialog.mockResolvedValueOnce('D:/c.zip')
    api.downloadFile.mockResolvedValueOnce({ status: 'skipped' })
    await (wrapper.vm as any).downloadFile(record)
    await flushPromises()
    expect(message.info).toHaveBeenCalled()

    // failure
    api.openSaveDialog.mockResolvedValueOnce('D:/d.zip')
    api.downloadFile.mockResolvedValueOnce({ status: 'failed', message: 'x' })
    await (wrapper.vm as any).downloadFile(record)
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // thrown error
    api.openSaveDialog.mockResolvedValueOnce('D:/e.zip')
    api.downloadFile.mockRejectedValueOnce(new Error('boom'))
    await (wrapper.vm as any).downloadFile(record)
    await flushPromises()
    expect(message.error).toHaveBeenCalled()
  })

  it('renameFile toggles editableData and renameOk handles success/failure/error', async () => {
    const api = (window as any).api
    api.sshSftpList.mockResolvedValueOnce([
      { name: 'a.txt', path: '/a.txt', isDir: false, disabled: false, mode: '-rw-r--r--', isLink: false, modTime: '', size: 1 }
    ])
    const wrapper = factory()
    await flushPromises()

    // invalid record => warning path
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(wrapper.vm as any).renameFile({} as any)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()

    const record = (wrapper.vm as any).files.find((x) => x.name === 'a.txt')
    ;(wrapper.vm as any).renameFile(record)
    expect((wrapper.vm as any).editableData[record.key]).toBeTruthy()
    ;(wrapper.vm as any).renameFile(record)
    expect((wrapper.vm as any).editableData[record.key]).toBeFalsy()

    // Prepare renameOk (create editable clone)
    ;(wrapper.vm as any).renameFile(record)
    ;(wrapper.vm as any).editableData[record.key].name = 'b.txt'

    api.renameFile.mockResolvedValueOnce({ status: 'success' })
    await (wrapper.vm as any).renameOk(record)
    await flushPromises()
    expect(message.success).toHaveBeenCalled()

    // failure
    const key = record.key

    ;(wrapper.vm as any).editableData[key] = {
      ...record,
      name: 'c.txt'
    }

    api.renameFile.mockResolvedValueOnce({ status: 'failed', message: 'no' })
    await (wrapper.vm as any).renameOk(record)
    await flushPromises()
    expect(message.error).toHaveBeenCalled()
    ;(wrapper.vm as any).editableData[key] = {
      ...record,
      name: 'd.txt'
    }

    api.renameFile.mockRejectedValueOnce(new Error('boom'))
    await (wrapper.vm as any).renameOk(record)
    await flushPromises()
    expect(message.error).toHaveBeenCalled()
  })

  it('chmodOk + permission helpers cover success/failure/error and watcher recalculation', async () => {
    const api = (window as any).api
    const wrapper = factory()
    await flushPromises()

    // no record => early return
    await (wrapper.vm as any).chmodOk()

    // parsePermissions updates code
    ;(wrapper.vm as any).parsePermissions('-755')
    expect((wrapper.vm as any).permissions.code).toBe('-755')

    // watcher recalculates when toggling group/public (exercise calculatePermissionCode)
    ;(wrapper.vm as any).permissions.owner = ['read', 'write', 'execute']
    ;(wrapper.vm as any).permissions.group = ['read']
    ;(wrapper.vm as any).permissions.public = []
    await flushPromises()
    expect(String((wrapper.vm as any).calculatePermissionCode())).toMatch(/^\d{3}$/)

    // success
    ;(wrapper.vm as any).currentRecord = { name: 'a.txt', path: '/a.txt' }
    api.chmodFile.mockResolvedValueOnce({ status: 'success' })
    await (wrapper.vm as any).chmodOk()
    await flushPromises()
    expect(api.chmodFile).toHaveBeenCalled()

    // failure
    ;(wrapper.vm as any).currentRecord = { name: 'a.txt', path: '/a.txt' }
    api.chmodFile.mockResolvedValueOnce({ status: 'failed', message: 'x' })
    await (wrapper.vm as any).chmodOk()
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // thrown error
    ;(wrapper.vm as any).currentRecord = { name: 'a.txt', path: '/a.txt' }
    api.chmodFile.mockRejectedValueOnce(new Error('boom'))
    await (wrapper.vm as any).chmodOk()
    await flushPromises()
    expect(message.error).toHaveBeenCalled()
  })

  it('delete confirmation triggers delete API and handles errors', async () => {
    const api = (window as any).api
    const wrapper = factory()
    await flushPromises()

    const record = {
      key: '/base/dir/a.txt',
      name: 'a.txt',
      path: '/base/dir/a.txt',
      isDir: false
    }

    ;(wrapper.vm as any).files = [record]

    // success
    api.deleteFile.mockResolvedValueOnce({ status: 'success' })
    await (wrapper.vm as any).confirmDeleteFile(record)
    await flushPromises()
    expect(message.success).toHaveBeenCalled()

    // thrown error
    api.deleteFile.mockRejectedValueOnce(new Error('boom'))
    await (wrapper.vm as any).confirmDeleteFile(record)
    await flushPromises()
    expect(message.error).toHaveBeenCalled()
  })

  it('copyOrMoveModalOk covers copy/move branches (stderr ok / stderr fail / thrown error)', async () => {
    const api = (window as any).api
    const wrapper = factory()
    await flushPromises()
    ;(wrapper.vm as any).currentRecord = { name: 'a', path: '/src/a' }
    ;(wrapper.vm as any).copyOrMoveModalType = 'copy'

    // copy success (stderr empty)
    api.sshConnExec.mockResolvedValueOnce({ stderr: '' })
    await (wrapper.vm as any).copyOrMoveModalOk('/dst')
    await flushPromises()
    expect(message.success).toHaveBeenCalled()

    // copy fail (stderr non-empty)
    ;(wrapper.vm as any).currentRecord = { name: 'a', path: '/src/a' }
    ;(wrapper.vm as any).copyOrMoveModalType = 'copy'
    api.sshConnExec.mockResolvedValueOnce({ stderr: 'cp: error' })
    await (wrapper.vm as any).copyOrMoveModalOk('/dst')
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // copy thrown
    ;(wrapper.vm as any).currentRecord = { name: 'a', path: '/src/a' }
    ;(wrapper.vm as any).copyOrMoveModalType = 'copy'
    api.sshConnExec.mockRejectedValueOnce(new Error('boom'))
    await (wrapper.vm as any).copyOrMoveModalOk('/dst')
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // move success
    ;(wrapper.vm as any).currentRecord = { name: 'a', path: '/src/a' }
    ;(wrapper.vm as any).copyOrMoveModalType = 'move'
    api.sshConnExec.mockResolvedValueOnce({ stderr: '' })
    await (wrapper.vm as any).copyOrMoveModalOk('/dst')
    await flushPromises()
    expect(message.success).toHaveBeenCalled()

    // move fail
    ;(wrapper.vm as any).currentRecord = { name: 'a', path: '/src/a' }
    ;(wrapper.vm as any).copyOrMoveModalType = 'move'
    api.sshConnExec.mockResolvedValueOnce({ stderr: 'mv: error' })
    await (wrapper.vm as any).copyOrMoveModalOk('/dst')
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // move thrown
    ;(wrapper.vm as any).currentRecord = { name: 'a', path: '/src/a' }
    ;(wrapper.vm as any).copyOrMoveModalType = 'move'
    api.sshConnExec.mockRejectedValueOnce(new Error('boom'))
    await (wrapper.vm as any).copyOrMoveModalOk('/dst')
    await flushPromises()
    expect(message.error).toHaveBeenCalled()
  })

  it('team uuid parsing returns expected boolean values', async () => {
    const wrapper = factory()
    await flushPromises()

    expect((wrapper.vm as any).isTeamCheck('bad')).toBe(false)
    expect((wrapper.vm as any).isTeamCheck('user@127.0.0.1:local-team:x')).toBe(true)
    expect((wrapper.vm as any).isTeamCheck('user@127.0.0.1:remote:y')).toBe(false)
  })
})
