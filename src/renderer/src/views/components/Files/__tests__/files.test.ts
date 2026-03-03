// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// Adjust the import path if your test folder differs
import Files from '../files.vue'

beforeEach(() => {
  ;(globalThis as any).createRendererLogger = vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
})

vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn()
  },
  Modal: {
    confirm: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn()
  }
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: { ok: 'OK', cancel: 'Cancel' },
      files: {
        name: 'Name',
        permissions: 'Permissions',
        size: 'Size',
        modifyDate: 'Modified',
        read: 'Read',
        write: 'Write',
        exec: 'Execute',
        rollback: 'Rollback',

        // upload
        uploadSuccess: 'Upload success',
        uploadCancel: 'Upload canceled',
        uploadSkipped: 'Upload skipped',
        uploadFailed: 'Upload failed',
        uploadError: 'Upload error',

        // download
        downloadSuccess: 'Download success',
        downloadCancel: 'Download canceled',
        downloadSkipped: 'Download skipped',
        downloadFailed: 'Download failed',
        downloadError: 'Download error',

        // rename / delete
        modifySuccess: 'Modify success',
        modifyFailed: 'Modify failed',
        modifyError: 'Modify error',
        deleteFileTips: 'Delete?',
        deleting: 'Deleting...',
        deleteSuccess: 'Delete success',
        deleteFailed: 'Delete failed',
        deleteError: 'Delete error',

        // copy/move
        copyFileSuccess: 'Copy success',
        copyFileFailed: 'Copy failed',
        copyFileError: 'Copy error',
        moveFileSuccess: 'Move success',
        moveFileFailed: 'Move failed',
        moveFileError: 'Move error',

        // chmod
        modifyFilePermissionsFailed: 'chmod failed',
        modifyFilePermissionsError: 'chmod error'
      }
    }
  }
})

const antdStubs = {
  // Common antd building blocks used by template
  'a-card': { template: '<div class="a-card"><slot /></div>' },
  'a-space': { template: '<div class="a-space"><slot /></div>' },
  'a-row': { template: '<div class="a-row"><slot /></div>' },
  'a-col': { template: '<div class="a-col"><slot /></div>' },
  'a-tooltip': { template: '<div class="a-tooltip"><slot /></div>' },
  'a-dropdown': { template: '<div class="a-dropdown"><slot /></div>' },
  'a-menu': { template: '<div class="a-menu"><slot /></div>' },
  'a-menu-item': { template: '<div class="a-menu-item"><slot /></div>' },
  'a-empty': { template: '<div class="a-empty" />' },

  'a-button': { template: '<button class="a-button" @click="$emit(\'click\')"><slot /></button>' },
  'a-input': {
    props: ['value'],
    emits: ['update:value', 'press-enter'],
    template: '<input class="a-input" :value="value" @input="$emit(\'update:value\', $event.target && $event.target.value)" />'
  },
  'a-table': { template: '<div class="a-table"><slot /></div>' },

  // Modal used inside template (not to be confused with Modal.confirm API)
  'a-modal': { template: '<div class="a-modal"><slot /></div>' },

  'a-checkbox-group': { template: '<div class="a-checkbox-group"><slot /></div>' },
  'a-checkbox': { template: '<div class="a-checkbox"><slot /></div>' }
}

// Icons & inner components
const iconStubs = {
  CheckOutlined: true,
  CloseOutlined: true,
  CloudUploadOutlined: true,
  CopyOutlined: true,
  DeleteOutlined: true,
  DownloadOutlined: true,
  EditOutlined: true,
  EllipsisOutlined: true,
  FileFilled: true,
  FolderFilled: true,
  FolderOpenOutlined: true,
  LinkOutlined: true,
  LockOutlined: true,
  RedoOutlined: true,
  RollbackOutlined: true,
  ScissorOutlined: true,
  UploadOutlined: true,
  copyOrMoveModal: true
}

type ApiStub = {
  sshSftpList: ReturnType<typeof vi.fn>
  openDirectoryDialog: ReturnType<typeof vi.fn>
  openFileDialog: ReturnType<typeof vi.fn>
  openSaveDialog: ReturnType<typeof vi.fn>
  uploadFile: ReturnType<typeof vi.fn>
  uploadDirectory: ReturnType<typeof vi.fn>
  downloadFile: ReturnType<typeof vi.fn>
  renameFile: ReturnType<typeof vi.fn>
  deleteFile: ReturnType<typeof vi.fn>
  chmodFile: ReturnType<typeof vi.fn>
  sshConnExec: ReturnType<typeof vi.fn>
}

const makeApi = (): ApiStub => ({
  sshSftpList: vi.fn().mockResolvedValue([] as any),
  openDirectoryDialog: vi.fn().mockResolvedValue(null),
  openFileDialog: vi.fn().mockResolvedValue(null),
  openSaveDialog: vi.fn().mockResolvedValue(null),
  uploadFile: vi.fn().mockResolvedValue({ status: 'success' }),
  uploadDirectory: vi.fn().mockResolvedValue({ status: 'success' }),
  downloadFile: vi.fn().mockResolvedValue({ status: 'success' }),
  renameFile: vi.fn().mockResolvedValue({ status: 'success' }),
  deleteFile: vi.fn().mockResolvedValue({ status: 'success' }),
  chmodFile: vi.fn().mockResolvedValue({ status: 'success' }),
  sshConnExec: vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
})

describe('files.vue (enhanced)', () => {
  let api: ApiStub

  beforeEach(() => {
    vi.clearAllMocks()
    api = makeApi()
    ;(globalThis as any).api = api

    // files.vue uses requestAnimationFrame in loadFiles (raf wrapper)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: any) => {
      cb(0)
      return 1
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).api
  })

  const mountView = (props?: Record<string, any>) =>
    mount(Files as any, {
      props: {
        uuid: 'localhost@127.0.0.1:local',
        connectType: 'ssh',
        currentDirectoryInput: '/',
        basePath: '',
        uiMode: 'default',
        panelSide: '',
        cachedState: null,
        ...props
      },
      global: {
        plugins: [i18n],
        stubs: { ...antdStubs, ...iconStubs }
      }
    })

  it('mount loads listing, sorts dirs/files, and inserts parent ".." when not root', async () => {
    api.sshSftpList.mockResolvedValueOnce([
      { name: 'b.txt', path: '/home/b.txt', isDir: false, mode: '0644', isLink: false, modTime: '', size: 2 },
      { name: 'a', path: '/home/a', isDir: true, mode: '0755', isLink: false, modTime: '', size: 0 },
      { name: 'c', path: '/home/c', isDir: true, mode: '0755', isLink: false, modTime: '', size: 0 },
      { name: 'a.txt', path: '/home/a.txt', isDir: false, mode: '0644', isLink: false, modTime: '', size: 1 }
    ] as any)

    const wrapper = mountView({ currentDirectoryInput: '/home' })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(api.sshSftpList).toHaveBeenCalledWith({ path: '/home', id: 'localhost@127.0.0.1:local' })

    // Expect parent inserted at front
    expect(vm.files[0].name).toBe('..')

    // Expect dirs sorted before files, each group sorted by name
    const names = vm.files.map((x: any) => x.name)
    expect(names).toEqual(['..', 'a', 'c', 'a.txt', 'b.txt'])

    wrapper.unmount()
  })

  it('does not insert parent when root "/" or Windows drive root like "C:/"', async () => {
    // Root
    api.sshSftpList.mockResolvedValueOnce([] as any)
    const w1 = mountView({ currentDirectoryInput: '/' })
    await flushPromises()
    expect((w1.vm as any).files.map((x: any) => x.name).includes('..')).toBe(false)
    w1.unmount()

    // Windows drive root
    api.sshSftpList.mockResolvedValueOnce([{ name: 'x', path: 'C:/x', isDir: true, mode: '0755', isLink: false, modTime: '', size: 0 }] as any)
    const w2 = mountView({ currentDirectoryInput: 'C:/' })
    await flushPromises()
    const names2 = (w2.vm as any).files.map((x: any) => x.name)
    expect(names2.includes('..')).toBe(false)
    w2.unmount()
  })

  it('openFile emits correct payload', async () => {
    api.sshSftpList.mockResolvedValueOnce([] as any)
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.openFile({ name: 'a.txt', path: '/a.txt', isDir: false })
    const emitted = wrapper.emitted('openFile') || []
    expect(emitted.length).toBe(1)
    expect(emitted[0][0]).toEqual({
      filePath: '/a.txt',
      terminalId: 'localhost@127.0.0.1:local',
      connectType: 'ssh'
    })

    wrapper.unmount()
  })

  it('openLocalFolder: returns early when dialog cancelled; loads when path selected', async () => {
    api.sshSftpList.mockResolvedValue([] as any)
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as any

    // cancelled
    api.openDirectoryDialog.mockResolvedValueOnce(null)
    const callsBefore = api.sshSftpList.mock.calls.length
    await vm.openLocalFolder()
    await flushPromises()
    expect(api.openDirectoryDialog).toHaveBeenCalled()
    expect(api.sshSftpList.mock.calls.length).toBe(callsBefore)

    // selected
    api.openDirectoryDialog.mockResolvedValueOnce('/tmp')
    api.sshSftpList.mockResolvedValueOnce([] as any)
    await vm.openLocalFolder()
    await flushPromises()
    expect(api.sshSftpList).toHaveBeenLastCalledWith({ path: '/tmp', id: 'localhost@127.0.0.1:local' })

    wrapper.unmount()
  })

  it('uploadFile: covers success/cancelled/skipped/failed + catch', async () => {
    const { message } = await import('ant-design-vue')

    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any

    // early return
    api.openFileDialog.mockResolvedValueOnce(null)
    await vm.uploadFile()
    expect(api.uploadFile).not.toHaveBeenCalled()

    const cases = [
      { status: 'success', expectFn: 'success' },
      { status: 'cancelled', expectFn: 'info' },
      { status: 'skipped', expectFn: 'info' },
      { status: 'failed', expectFn: 'error', message: 'x' }
    ] as const

    for (const c of cases) {
      api.openFileDialog.mockResolvedValueOnce('/local/a.txt')
      api.uploadFile.mockResolvedValueOnce({ status: c.status, message: (c as any).message })
      api.sshSftpList.mockResolvedValueOnce([] as any) // refresh -> loadFiles
      await vm.uploadFile()
      await flushPromises()

      expect(api.uploadFile).toHaveBeenLastCalledWith({
        id: 'localhost@127.0.0.1:local',
        remotePath: '/',
        localPath: '/local/a.txt'
      })

      expect((message as any)[c.expectFn]).toHaveBeenCalled()
    }

    // catch
    api.openFileDialog.mockResolvedValueOnce('/local/b.txt')
    api.uploadFile.mockRejectedValueOnce(new Error('boom'))
    await vm.uploadFile()
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('uploadFolder: covers success and non-success + catch', async () => {
    const { message } = await import('ant-design-vue')

    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any

    // early return
    api.openDirectoryDialog.mockResolvedValueOnce(null)
    await vm.uploadFolder()
    expect(api.uploadDirectory).not.toHaveBeenCalled()

    api.openDirectoryDialog.mockResolvedValueOnce('/local/dir')
    api.uploadDirectory.mockResolvedValueOnce({ status: 'success' })
    api.sshSftpList.mockResolvedValueOnce([] as any)
    await vm.uploadFolder()
    await flushPromises()
    expect(message.success).toHaveBeenCalled()

    api.openDirectoryDialog.mockResolvedValueOnce('/local/dir2')
    api.uploadDirectory.mockResolvedValueOnce({ status: 'failed', message: 'nope' })
    api.sshSftpList.mockResolvedValueOnce([] as any)
    await vm.uploadFolder()
    await flushPromises()
    // files.vue uses message.success for all non-exception statuses (including failed)
    expect(message.success).toHaveBeenCalled()

    api.openDirectoryDialog.mockResolvedValueOnce('/local/dir3')
    api.uploadDirectory.mockRejectedValueOnce(new Error('boom'))
    await vm.uploadFolder()
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('downloadFile: covers status mapping and catch', async () => {
    const { message } = await import('ant-design-vue')

    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any

    // early return
    api.openSaveDialog.mockResolvedValueOnce(null)
    await vm.downloadFile({ name: 'x.txt', path: '/x.txt' })
    expect(api.downloadFile).not.toHaveBeenCalled()

    const cases = [
      { status: 'success', expectFn: 'success' },
      { status: 'cancelled', expectFn: 'info' },
      { status: 'skipped', expectFn: 'info' },
      { status: 'failed', expectFn: 'error', message: 'x' }
    ] as const

    for (const c of cases) {
      api.openSaveDialog.mockResolvedValueOnce('/local/save.txt')
      api.downloadFile.mockResolvedValueOnce({ status: c.status, message: (c as any).message })
      await vm.downloadFile({ name: 'x.txt', path: '/x.txt' })
      await flushPromises()
      expect(api.downloadFile).toHaveBeenLastCalledWith({
        id: 'localhost@127.0.0.1:local',
        remotePath: '/x.txt',
        localPath: '/local/save.txt'
      })
      expect((message as any)[c.expectFn]).toHaveBeenCalled()
    }

    // catch
    api.openSaveDialog.mockResolvedValueOnce('/local/save2.txt')
    api.downloadFile.mockRejectedValueOnce(new Error('boom'))
    await vm.downloadFile({ name: 'y.txt', path: '/y.txt' })
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('renameFile toggles editableData; renameOk covers success/fail/catch; renameCancel clears', async () => {
    const { message } = await import('ant-design-vue')

    api.sshSftpList.mockResolvedValueOnce([{ name: 'a.txt', path: '/a.txt', isDir: false, mode: '0644', isLink: false, modTime: '', size: 1 }] as any)

    const wrapper = mountView({ currentDirectoryInput: '/' })
    await flushPromises()
    const vm = wrapper.vm as any
    const record = vm.files.find((x: any) => x.name === 'a.txt')
    expect(record).toBeTruthy()

    // invalid record (missing key) should not throw
    vm.renameFile({ name: 'bad' })

    // toggle editableData on
    vm.renameFile(record)
    expect(vm.editableData[record.key]).toBeTruthy()

    // success
    vm.editableData[record.key].name = 'b.txt'
    api.renameFile.mockResolvedValueOnce({ status: 'success' })
    // renameOk() always calls refresh(); keep the file in the list so later renameFile() can find it again
    api.sshSftpList.mockResolvedValueOnce([{ name: 'a.txt', path: '/a.txt', isDir: false, mode: '0644', isLink: false, modTime: '', size: 1 }] as any)
    await vm.renameOk(record)
    await flushPromises()
    expect(api.renameFile).toHaveBeenLastCalledWith({
      id: 'localhost@127.0.0.1:local',
      oldPath: '/a.txt',
      newPath: '/b.txt'
    })
    expect(message.success).toHaveBeenCalled()

    // fail
    vm.renameFile(record)
    vm.editableData[record.key].name = 'c.txt'
    api.renameFile.mockResolvedValueOnce({ status: 'failed', message: 'nope' })
    // renameOk() calls refresh() even on failed status
    api.sshSftpList.mockResolvedValueOnce([{ name: 'a.txt', path: '/a.txt', isDir: false, mode: '0644', isLink: false, modTime: '', size: 1 }] as any)
    await vm.renameOk(record)
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // catch
    vm.renameFile(record)
    vm.editableData[record.key].name = 'd.txt'
    api.renameFile.mockRejectedValueOnce(new Error('boom'))
    await vm.renameOk(record)
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // cancel clears editableData
    vm.renameFile(record)
    expect(vm.editableData[record.key]).toBeTruthy()
    vm.renameCancel(record)
    expect(vm.editableData[record.key]).toBeUndefined()

    wrapper.unmount()
  })

  it('deleteFile triggers Modal.confirm and confirmDeleteFile covers success/fail/catch', async () => {
    const { Modal, message } = await import('ant-design-vue')

    api.sshSftpList.mockResolvedValueOnce([{ name: 'a.txt', path: '/a.txt', isDir: false, mode: '0644', isLink: false, modTime: '', size: 1 }] as any)

    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    const record = vm.files.find((x: any) => x.name === 'a.txt')

    // open dialog
    vm.deleteFile(record)
    expect(Modal.confirm).toHaveBeenCalled()
    const cfg = (Modal.confirm as any).mock.calls.at(-1)[0]
    expect(typeof cfg.onOk).toBe('function')

    // success
    api.deleteFile.mockResolvedValueOnce({ status: 'success' })
    api.sshSftpList.mockResolvedValueOnce([] as any) // refresh
    await cfg.onOk()
    await flushPromises()
    expect(api.deleteFile).toHaveBeenLastCalledWith({ id: 'localhost@127.0.0.1:local', remotePath: '/a.txt' })
    expect(message.loading).toHaveBeenCalled()
    expect(message.success).toHaveBeenCalled()

    // fail
    vm.deleteFile(record)
    const cfg2 = (Modal.confirm as any).mock.calls.at(-1)[0]
    api.deleteFile.mockResolvedValueOnce({ status: 'failed', message: 'nope' })
    api.sshSftpList.mockResolvedValueOnce([] as any)
    await cfg2.onOk()
    await flushPromises()
    expect(message.success).toHaveBeenCalled() // component uses success() even for failed status, but with different content

    // catch
    vm.deleteFile(record)
    const cfg3 = (Modal.confirm as any).mock.calls.at(-1)[0]
    api.deleteFile.mockRejectedValueOnce(new Error('boom'))
    await cfg3.onOk()
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('copy/move: cp -r and mv branches, stderr and catch branches', async () => {
    const { message } = await import('ant-design-vue')

    api.sshSftpList.mockResolvedValueOnce([{ name: 'a', path: '/a', isDir: true, mode: '0755', isLink: false, modTime: '', size: 0 }] as any)

    const wrapper = mountView({ currentDirectoryInput: '/' })
    await flushPromises()
    const vm = wrapper.vm as any
    const record = vm.files.find((x: any) => x.name === 'a')
    expect(record).toBeTruthy()

    // copy success
    api.sshConnExec.mockResolvedValueOnce({ stderr: '' })
    api.sshSftpList.mockResolvedValueOnce([] as any)
    vm.copyFile(record)
    await vm.copyOrMoveModalOk('/dest/a')
    await flushPromises()
    expect(api.sshConnExec).toHaveBeenLastCalledWith({
      cmd: 'cp -r "/a" "/dest/a"',
      id: 'localhost@127.0.0.1:local'
    })
    expect(message.success).toHaveBeenCalled()

    // copy stderr -> error
    api.sshConnExec.mockResolvedValueOnce({ stderr: 'permission denied' })
    vm.copyFile(record)
    await vm.copyOrMoveModalOk('/dest/a2')
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // move success
    api.sshConnExec.mockResolvedValueOnce({ stderr: '' })
    api.sshSftpList.mockResolvedValueOnce([] as any)
    vm.moveFile(record)
    await vm.copyOrMoveModalOk('/dest/a3')
    await flushPromises()
    expect(api.sshConnExec).toHaveBeenLastCalledWith({
      cmd: 'mv "/a" "/dest/a3"',
      id: 'localhost@127.0.0.1:local'
    })
    expect(message.success).toHaveBeenCalled()

    // move catch
    api.sshConnExec.mockRejectedValueOnce(new Error('boom'))
    vm.moveFile(record)
    await vm.copyOrMoveModalOk('/dest/a4')
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('chmod: parsePermissions + chmodOk success/fail/catch + permission code watcher', async () => {
    const { message } = await import('ant-design-vue')

    api.sshSftpList.mockResolvedValueOnce([{ name: 'a.txt', path: '/a.txt', isDir: false, mode: '0644', isLink: false, modTime: '', size: 1 }] as any)

    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    const record = vm.files.find((x: any) => x.name === 'a.txt')

    vm.chmodFile(record)
    expect(vm.permissions.code).toBe('0644')
    expect(vm.permissions.owner.includes('read')).toBe(true)

    // watcher: tweak permissions -> code updates
    vm.permissions.public = ['read', 'write']
    await flushPromises()
    expect(vm.permissions.code).toMatch(/\d{3}/)

    // success
    api.chmodFile.mockResolvedValueOnce({ status: 'success' })
    api.sshSftpList.mockResolvedValueOnce([] as any)
    await vm.chmodOk()
    await flushPromises()
    expect(api.chmodFile).toHaveBeenCalled()
    // refresh called on success
    expect(api.sshSftpList).toHaveBeenCalled()

    // fail
    vm.chmodFile(record)
    api.chmodFile.mockResolvedValueOnce({ status: 'failed', message: 'nope' })
    await vm.chmodOk()
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // catch
    vm.chmodFile(record)
    api.chmodFile.mockRejectedValueOnce(new Error('boom'))
    await vm.chmodOk()
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('dropdown/hover logic: enter/leave/visible/menu click clears timers and state', async () => {
    vi.useFakeTimers()

    api.sshSftpList.mockResolvedValueOnce([] as any)
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as any

    // enter row
    vm.handleRowMouseEnter('row1')
    expect(vm.currentHoverRow).toBe('row1')

    // open dropdown locks hover
    vm.handleDropdownVisibleChange(true, 'row1')
    expect(vm.dropdownVisible['row1']).toBe(true)

    // leaving row with dropdown open schedules close
    vm.handleRowMouseLeave('row1')
    vi.advanceTimersByTime(100)
    await flushPromises()

    // after timer it should be closed and hover cleared
    expect(vm.dropdownVisible['row1']).toBe(false)

    // dropdown menu enter forces hover
    vm.handleDropdownVisibleChange(true, 'row2')
    vm.handleDropdownMenuEnter('row2')
    expect(vm.mouseInDropdown['row2']).toBe(true)
    expect(vm.currentHoverRow).toBe('row2')

    // menu leave closes dropdown and clears hover later
    vm.dropdownVisible['row2'] = false
    vm.handleDropdownMenuLeave('row2')
    expect(vm.mouseInDropdown['row2']).toBeFalsy()
    vi.advanceTimersByTime(100)
    await flushPromises()

    // menu click clears all
    vm.dropdownVisible['a'] = true
    vm.mouseInDropdown['a'] = true
    vm.currentHoverRow = 'a'
    vm.handleMenuClick()
    expect(vm.currentHoverRow).toBe(null)
    expect(vm.dropdownVisible['a']).toBe(false)
    expect(vm.mouseInDropdown['a']).toBe(false)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('renameFile: file-not-found branch and delete branch are safe', async () => {
    api.sshSftpList.mockResolvedValueOnce([] as any)
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any

    // file not found in files.value
    vm.renameFile({ key: 'missing', name: 'x.txt', path: '/x.txt', isDir: false })
    expect(vm.editableData['missing']).toBeUndefined()

    // delete branch
    // create a fake file in list first
    api.sshSftpList.mockResolvedValueOnce([{ name: 'a.txt', path: '/a.txt', isDir: false, mode: '0644', isLink: false, modTime: '', size: 1 }] as any)
    await vm.refresh()
    await flushPromises()

    const record = vm.files.find((x: any) => x.name === 'a.txt')
    vm.renameFile(record)
    expect(vm.editableData[record.key]).toBeTruthy()
    vm.renameFile(record)
    expect(vm.editableData[record.key]).toBeUndefined()

    wrapper.unmount()
  })

  it('deleteFile: executes onCancel branch', async () => {
    const { Modal } = await import('ant-design-vue')

    api.sshSftpList.mockResolvedValueOnce([{ name: 'a.txt', path: '/a.txt', isDir: false, mode: '0644', isLink: false, modTime: '', size: 1 }] as any)
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as any
    const record = vm.files.find((x: any) => x.name === 'a.txt')

    vm.deleteFile(record)
    const cfg = (Modal.confirm as any).mock.calls.at(-1)[0]
    expect(typeof cfg.onCancel).toBe('function')

    // onCancel should set deleteFileDialog false
    vm.deleteFileDialog = true
    cfg.onCancel()
    expect(vm.deleteFileDialog).toBe(false)

    wrapper.unmount()
  })

  it('isTeamCheck returns expected boolean', async () => {
    api.sshSftpList.mockResolvedValueOnce([] as any)
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as any

    expect(vm.isTeamCheck('bad-uuid')).toBe(false)
    expect(vm.isTeamCheck('user@127.0.0.1:local')).toBe(false)
    expect(vm.isTeamCheck('user@127.0.0.1:local-team')).toBe(true)

    wrapper.unmount()
  })

  it('copyOrMoveModalOk early return when no currentRecord; covers move stderr and copy catch', async () => {
    const { message } = await import('ant-design-vue')

    api.sshSftpList.mockResolvedValueOnce([{ name: 'a', path: '/a', isDir: true, mode: '0755', isLink: false, modTime: '', size: 0 }] as any)
    const wrapper = mountView({ currentDirectoryInput: '/' })
    await flushPromises()

    const vm = wrapper.vm as any

    // early return
    vm.currentRecord = null
    await vm.copyOrMoveModalOk('/dest/whatever')
    expect(api.sshConnExec).not.toHaveBeenCalled()

    const record = vm.files.find((x: any) => x.name === 'a')

    // move stderr branch
    api.sshConnExec.mockResolvedValueOnce({ stderr: 'permission denied' })
    vm.moveFile(record)
    await vm.copyOrMoveModalOk('/dest/a')
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // copy catch branch
    api.sshConnExec.mockRejectedValueOnce(new Error('boom'))
    vm.copyFile(record)
    await vm.copyOrMoveModalOk('/dest/a2')
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('chmodOk early return when no currentRecord; chmodCancel clears state', async () => {
    api.sshSftpList.mockResolvedValueOnce([] as any)
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as any

    vm.currentRecord = null
    await vm.chmodOk()
    expect(api.chmodFile).not.toHaveBeenCalled()

    vm.chmodFileDialog = true
    vm.currentRecord = { name: 'x', path: '/x', isDir: false }
    vm.chmodCancel()
    expect(vm.chmodFileDialog).toBe(false)
    expect(vm.currentRecord).toBe(null)

    wrapper.unmount()
  })
})
