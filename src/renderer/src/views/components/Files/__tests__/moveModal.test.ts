// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// i18n: return key as text
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: { confirm: 'confirm', cancel: 'cancel', ok: 'ok' },
      files: {
        moveTo: 'moveTo',
        cpTo: 'cpTo',
        originPath: 'originPath',
        targetPath: 'targetPath',
        pathInputTips: 'pathInputTips',
        dirEdit: 'dirEdit',
        noDirTips: 'noDirTips',
        conflictTips: 'conflictTips',
        file: 'file',
        exists: 'exists',
        overwriteTips: 'overwriteTips',
        newFileName: 'newFileName',
        rename: 'rename',
        overwrite: 'overwrite',
        pleaseInputNewFileName: 'pleaseInputNewFileName'
      }
    }
  }
})

const messageError = vi.fn()
vi.mock('ant-design-vue', () => ({
  message: {
    error: (...args: any[]) => messageError(...args)
  }
}))

const AModal = {
  name: 'AModal',
  props: ['visible', 'title', 'footer', 'confirmLoading', 'okText', 'cancelText'],
  emits: ['ok', 'cancel', 'update:visible'],
  template: `
    <div class="a-modal" v-if="visible !== false">
      <div class="title">{{ title }}</div>
      <button class="ok" @click="$emit('ok')">ok</button>
      <button class="cancel" @click="$emit('cancel')">cancel</button>
      <button class="hide" @click="$emit('update:visible', false)">hide</button>
      <slot />
    </div>
  `
}

const AInput = {
  name: 'AInput',
  props: ['value', 'placeholder'],
  emits: ['update:value', 'blur'],
  template: `<input class="a-input" :value="value" @input="$emit('update:value', $event.target.value)" @blur="$emit('blur')" />`
}

const AButton = {
  name: 'AButton',
  props: ['type', 'danger'],
  emits: ['click'],
  template: `<button class="a-button" @click="$emit('click')"><slot /></button>`
}

const PassThrough = {
  name: 'PassThrough',
  template: `<div class="pass"><slot /></div>`
}

describe('moveModal.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    messageError.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete (globalThis as any).api
  })

  const importComp = async (sshSftpListImpl: any) => {
    ;(globalThis as any).api = { sshSftpList: sshSftpListImpl }
    vi.resetModules()
    const Comp = (await import('../moveModal.vue')).default
    return Comp
  }

  const mountModal = (Comp: any, props?: any) =>
    mount(Comp, {
      props: {
        visible: true,
        id: 'id1',
        originPath: '/a/b/c.txt',
        type: 'move',
        ...props
      },
      global: {
        plugins: [i18n],
        stubs: {
          'a-modal': AModal,
          'a-input': AInput,
          'a-button': AButton,
          'a-breadcrumb': PassThrough,
          'a-breadcrumb-item': PassThrough,
          'a-dropdown': PassThrough,
          'a-menu': PassThrough,
          'a-menu-item': PassThrough,
          FolderFilled: true,
          DownOutlined: true
        }
      }
    })

  it('handleOk: no conflict -> emits confirm and closes after 300ms', async () => {
    const sshSftpList = vi.fn(async () => [{ name: 'other.txt', isDir: false }])
    const Comp = await importComp(sshSftpList)
    const wrapper = mountModal(Comp, { type: 'copy' })

    await (wrapper.vm as any).handleOk()
    await flushPromises()

    const confirms = wrapper.emitted('confirm') || []
    expect(confirms.length).toBe(1)
    expect(confirms[0][0]).toBe('/a/b/c.txt')

    vi.advanceTimersByTime(300)
    await flushPromises()

    const updates = wrapper.emitted('update:visible') || []
    expect(updates.some((x) => x[0] === false)).toBe(true)
  })

  it('handleOk: conflict -> showConflictModal true and generate newFileName', async () => {
    const sshSftpList = vi.fn(async () => [{ name: 'c.txt' }, { name: 'c_1.txt' }])
    const Comp = await importComp(sshSftpList)
    const wrapper = mountModal(Comp)

    await (wrapper.vm as any).handleOk()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.showConflictModal).toBe(true)
    expect(vm.newFileName).toBe('c_2.txt')
    expect(wrapper.text()).toContain('conflictTips')
  })

  it('conflict actions: rename(empty) -> message.error; overwrite -> confirm; cancel -> close modal', async () => {
    const sshSftpList = vi.fn(async () => [{ name: 'c.txt' }])
    const Comp = await importComp(sshSftpList)
    const wrapper = mountModal(Comp)

    // open conflict modal
    await (wrapper.vm as any).handleOk()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.showConflictModal).toBe(true)

    // rename empty -> error
    vm.newFileName = '   '
    ;(wrapper.vm as any).handleConflictAction('rename')
    expect(messageError).toHaveBeenCalled()

    // overwrite -> confirm
    ;(wrapper.vm as any).handleConflictAction('overwrite')
    const confirms = wrapper.emitted('confirm') || []
    expect(confirms.length).toBe(1)
    expect(confirms[0][0]).toBe('/a/b/c.txt')

    // cancel -> close
    vm.showConflictModal = true
    ;(wrapper.vm as any).handleConflictAction('cancel')
    expect(vm.showConflictModal).toBe(false)
  })

  it('path interactions: onPathClick / enterSubDir / loadSubDirs / blank click / global click', async () => {
    const sshSftpList = vi.fn(async () => [
      { name: 'dir1', isDir: true },
      { name: 'file1', isDir: false }
    ])
    const Comp = await importComp(sshSftpList)
    const wrapper = mountModal(Comp)

    const vm = wrapper.vm as any

    // loadSubDirs filters only dirs
    await vm.loadSubDirs(0)
    await flushPromises()
    expect(sshSftpList).toHaveBeenCalled()
    expect(vm.subDirMap[0].map((x: any) => x.name)).toEqual(['dir1'])

    // enterSubDir updates path & editingPath false
    vm.editingPath = true
    await vm.enterSubDir(1, 'k')
    expect(vm.currentPath).toContain('/a/k')
    expect(vm.editingPath).toBe(false)

    // direct click jump
    vm.editingPath = true
    vm.onPathClick(0)
    expect(vm.currentPath).toBe('/')
    expect(vm.editingPath).toBe(false)

    // blank click toggles editing when not clicking breadcrumb
    vm.editingPath = false
    vm.onPathBlankClick({
      target: { closest: () => null }
    })
    expect(vm.editingPath).toBe(true)

    // global click outside container closes editing
    vm.editingPath = true
    document.body.click()
    await flushPromises()
    expect(vm.editingPath).toBe(false)

    wrapper.unmount()
  })
})
