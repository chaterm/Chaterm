// fileTransfer.spec.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

describe('fileTransfer.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const setup = async () => {
    let progressCb: ((payload: any) => void) | undefined
    ;(window as any).api = {
      onTransferProgress: (cb: any) => {
        progressCb = cb
      }
    }

    vi.resetModules()
    const mod = await import('../fileTransfer')
    mod.transferTasks.value = {}

    mod.ensureTransferListener()
    expect(progressCb).toBeTypeOf('function')

    return { mod, progressCb: progressCb! }
  }

  it('creates task on first progress payload and normalizes path', async () => {
    const { mod, progressCb } = await setup()

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    progressCb({
      taskKey: 'k1',
      type: 'download',
      bytes: 0,
      total: 100,
      remotePath: 'C:\\\\foo\\\\bar.txt'
    })

    const task = mod.transferTasks.value['k1']
    expect(task).toBeTruthy()
    expect(task.name).toBe('bar.txt')
    expect(task.remotePath).toBe('C:/foo/bar.txt') // \\+ => /
    expect(task.progress).toBe(0)
    expect(mod.downloadList.value.map((t: any) => t.taskKey)).toEqual(['k1'])
  })

  it('sets speed to scanning when stage=scanning', async () => {
    const { mod, progressCb } = await setup()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    progressCb({
      taskKey: 'k2',
      type: 'upload',
      bytes: 10,
      total: 100,
      remotePath: '/a/b.bin',
      stage: 'scanning'
    })

    expect(mod.transferTasks.value['k2'].speed).toBe('scanning')
    expect(mod.uploadList.value.length).toBe(1)
  })

  it('updates speed only when >= 1s passed (KB/s or MB/s branch) and progress calc', async () => {
    const { mod, progressCb } = await setup()

    // t0
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    progressCb({
      taskKey: 'k3',
      type: 'download',
      bytes: 0,
      total: 4096,
      remotePath: '/x/y.dat'
    })

    vi.setSystemTime(new Date('2026-01-01T00:00:00.500Z'))
    progressCb({
      taskKey: 'k3',
      type: 'download',
      bytes: 1024,
      total: 4096,
      remotePath: '/x/y.dat'
    })
    const s1 = mod.transferTasks.value['k3'].speed

    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'))
    progressCb({
      taskKey: 'k3',
      type: 'download',
      bytes: 3072,
      total: 4096,
      remotePath: '/x/y.dat'
    })

    const task = mod.transferTasks.value['k3']
    expect(task.progress).toBe(Math.round((3072 / 4096) * 100))
    expect(task.speed).not.toBe(s1)
    expect(task.speed.includes('KB/s') || task.speed.includes('MB/s')).toBe(true)
  })

  it('auto marks success when progress=100 and status=running; then deletes after 2500ms', async () => {
    const { mod, progressCb } = await setup()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    progressCb({
      taskKey: 'k4',
      type: 'download',
      bytes: 100,
      total: 100,
      remotePath: '/done.txt',
      status: 'running'
    })

    expect(mod.transferTasks.value['k4'].status).toBe('success')

    vi.advanceTimersByTime(2499)
    expect(mod.transferTasks.value['k4']).toBeTruthy()

    vi.advanceTimersByTime(2)
    expect(mod.transferTasks.value['k4']).toBeUndefined()
  })

  it('deletes on explicit success after 2500ms; deletes on failed/error after 8000ms', async () => {
    const { mod, progressCb } = await setup()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    progressCb({ taskKey: 'k5', type: 'upload', bytes: 1, total: 10, remotePath: '/a.txt' })
    progressCb({ taskKey: 'k5', type: 'upload', bytes: 10, total: 10, remotePath: '/a.txt', status: 'success' })

    vi.advanceTimersByTime(2500)
    expect(mod.transferTasks.value['k5']).toBeUndefined()

    progressCb({ taskKey: 'k6', type: 'download', bytes: 1, total: 10, remotePath: '/b.txt' })
    progressCb({ taskKey: 'k6', type: 'download', bytes: 2, total: 10, remotePath: '/b.txt', status: 'failed' })

    vi.advanceTimersByTime(7999)
    expect(mod.transferTasks.value['k6']).toBeTruthy()
    vi.advanceTimersByTime(2)
    expect(mod.transferTasks.value['k6']).toBeUndefined()

    progressCb({ taskKey: 'k7', type: 'download', bytes: 1, total: 10, remotePath: '/c.txt' })
    progressCb({ taskKey: 'k7', type: 'download', bytes: 2, total: 10, remotePath: '/c.txt', status: 'error' })

    vi.advanceTimersByTime(8000)
    expect(mod.transferTasks.value['k7']).toBeUndefined()
  })
})

vi.mock('@store/userConfigStore', () => ({
  userConfigStore: () => ({
    getUserConfig: { theme: 'dark', background: { image: '' } }
  })
}))

vi.mock('@/utils/themeUtils', () => ({
  addSystemThemeListener: vi.fn(() => () => {}),
  getActualTheme: vi.fn(() => 'dark')
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      files: {
        taskList: 'Transfer List',
        collapseTransferList: 'Collapse',
        expandTransferList: 'Expand',
        download: 'Download',
        upload: 'Upload',
        dragTransfer: 'Drag Transfer',
        scanning: 'Scanning',
        waiting: 'Waiting'
      }
    }
  }
})

const stubs = {
  'a-progress': {
    name: 'AProgress',
    props: ['percent', 'type', 'size', 'strokeWidth', 'showInfo', 'status'],
    template: `<div class="a-progress" :data-percent="percent" :data-type="type"></div>`
  },
  'a-button': {
    name: 'AButton',
    props: ['type', 'danger', 'title'],
    emits: ['click'],
    template: `<button class="a-button" :title="title" @click="$emit('click', $event)"><slot name="icon" /><slot /></button>`
  },
  'a-row': { name: 'ARow', template: `<div class="a-row"><slot /></div>` },
  'a-col': { name: 'ACol', template: `<div class="a-col"><slot /></div>` },
  ArrowUpOutlined: { template: '<span class="icon-up" />' },
  ArrowDownOutlined: { template: '<span class="icon-down" />' },
  SwapOutlined: { template: '<span class="icon-swap" />' },
  MinusOutlined: { template: '<span class="icon-minus" />' },
  CloseOutlined: { template: '<span class="icon-close" />' },
  DownOutlined: { template: '<span class="icon-down-arrow" />' },
  RightOutlined: { template: '<span class="icon-right-arrow" />' }
}

describe('fileTransferProgress.vue', () => {
  beforeEach(() => {
    ;(window as any).api = {
      onTransferProgress: vi.fn(),
      cancelFileTask: vi.fn()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).api
  })

  const importComp = async () => {
    vi.resetModules()
    const mod = await import('../fileTransfer')
    mod.transferTasks.value = {}
    const Comp = (await import('../fileTransferProgress.vue')).default
    return { Comp, mod }
  }

  const seedTask = (mod: any, overrides: Partial<any> = {}) => {
    const taskKey = overrides.taskKey ?? `t-${Math.random().toString(36).slice(2, 8)}`
    mod.transferTasks.value[taskKey] = {
      id: taskKey,
      taskKey,
      name: overrides.name ?? 'file.bin',
      progress: overrides.progress ?? 0,
      remotePath: '/x/file.bin',
      speed: '0 KB/s',
      type: overrides.type ?? 'upload',
      lastBytes: 0,
      lastTime: 0,
      status: overrides.status ?? 'running',
      createdAt: Date.now(),
      sortIndex: 0,
      ...overrides
    }
    return taskKey
  }

  const mountComp = (Comp: any) =>
    mount(Comp, {
      global: {
        plugins: [i18n],
        stubs
      },
      attachTo: document.body
    })

  it('renders nothing when there are no transfer tasks', async () => {
    const { Comp } = await importComp()
    const wrapper = mountComp(Comp)
    expect(wrapper.find('.transfer-fab').exists()).toBe(false)
    expect(wrapper.find('.transfer-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders expanded panel by default when there are tasks', async () => {
    const { Comp, mod } = await importComp()
    seedTask(mod, { type: 'upload', progress: 50 })
    const wrapper = mountComp(Comp)
    await flushPromises()

    expect(wrapper.find('.transfer-panel').exists()).toBe(true)
    expect(wrapper.find('.transfer-fab').exists()).toBe(false)
    expect(wrapper.find('.collapse-btn').exists()).toBe(true)
    wrapper.unmount()
  })

  it('collapses to FAB when collapse button is clicked, and expands again on FAB click', async () => {
    const { Comp, mod } = await importComp()
    seedTask(mod, { type: 'upload', progress: 25 })
    const wrapper = mountComp(Comp)
    await flushPromises()

    await wrapper.find('.collapse-btn').trigger('click')
    expect(wrapper.find('.transfer-panel').exists()).toBe(false)
    expect(wrapper.find('.transfer-fab').exists()).toBe(true)

    await wrapper.find('.transfer-fab').trigger('click')
    expect(wrapper.find('.transfer-panel').exists()).toBe(true)
    expect(wrapper.find('.transfer-fab').exists()).toBe(false)
    wrapper.unmount()
  })

  it('FAB shows badge with the count of parent tasks', async () => {
    const { Comp, mod } = await importComp()
    seedTask(mod, { taskKey: 'a', type: 'upload', progress: 10 })
    seedTask(mod, { taskKey: 'b', type: 'download', progress: 30 })
    seedTask(mod, { taskKey: 'c', type: 'upload', progress: 50 })
    const wrapper = mountComp(Comp)
    await flushPromises()

    await wrapper.find('.collapse-btn').trigger('click')
    const badge = wrapper.find('.fab-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('3')
    wrapper.unmount()
  })

  it('FAB badge clamps to 99+ when there are more than 99 tasks', async () => {
    const { Comp, mod } = await importComp()
    for (let i = 0; i < 101; i++) {
      seedTask(mod, { taskKey: `k${i}`, type: 'upload', progress: 0 })
    }
    const wrapper = mountComp(Comp)
    await flushPromises()

    await wrapper.find('.collapse-btn').trigger('click')
    expect(wrapper.find('.fab-badge').text()).toBe('99+')
    wrapper.unmount()
  })

  it('FAB progress ring reflects average progress across parent tasks', async () => {
    const { Comp, mod } = await importComp()
    seedTask(mod, { taskKey: 'a', type: 'upload', progress: 20 })
    seedTask(mod, { taskKey: 'b', type: 'download', progress: 80 })
    const wrapper = mountComp(Comp)
    await flushPromises()

    await wrapper.find('.collapse-btn').trigger('click')
    const ring = wrapper.find('.fab-ring')
    expect(ring.exists()).toBe(true)
    expect(ring.attributes('data-percent')).toBe('50')
    wrapper.unmount()
  })

  it('FAB shows ArrowUp icon when only uploads are active', async () => {
    const { Comp, mod } = await importComp()
    seedTask(mod, { type: 'upload' })
    const wrapper = mountComp(Comp)
    await flushPromises()
    await wrapper.find('.collapse-btn').trigger('click')

    expect(wrapper.find('.icon-up').exists()).toBe(true)
    expect(wrapper.find('.icon-down').exists()).toBe(false)
    wrapper.unmount()
  })

  it('FAB shows ArrowDown icon when only downloads are active', async () => {
    const { Comp, mod } = await importComp()
    seedTask(mod, { type: 'download' })
    const wrapper = mountComp(Comp)
    await flushPromises()
    await wrapper.find('.collapse-btn').trigger('click')

    expect(wrapper.find('.icon-down').exists()).toBe(true)
    expect(wrapper.find('.icon-up').exists()).toBe(false)
    wrapper.unmount()
  })

  it('FAB shows Swap icon when both uploads and downloads are active', async () => {
    const { Comp, mod } = await importComp()
    seedTask(mod, { taskKey: 'a', type: 'upload' })
    seedTask(mod, { taskKey: 'b', type: 'download' })
    const wrapper = mountComp(Comp)
    await flushPromises()
    await wrapper.find('.collapse-btn').trigger('click')

    expect(wrapper.find('.icon-swap').exists()).toBe(true)
    wrapper.unmount()
  })

  it('FAB toggles via keyboard (Enter/Space)', async () => {
    const { Comp, mod } = await importComp()
    seedTask(mod, { type: 'upload' })
    const wrapper = mountComp(Comp)
    await flushPromises()
    await wrapper.find('.collapse-btn').trigger('click')

    await wrapper.find('.transfer-fab').trigger('keydown.enter')
    expect(wrapper.find('.transfer-panel').exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides the entire UI when the last task disappears', async () => {
    const { Comp, mod } = await importComp()
    const key = seedTask(mod, { type: 'upload' })
    const wrapper = mountComp(Comp)
    await flushPromises()
    expect(wrapper.find('.transfer-panel').exists()).toBe(true)

    delete mod.transferTasks.value[key]
    await flushPromises()

    expect(wrapper.find('.transfer-panel').exists()).toBe(false)
    expect(wrapper.find('.transfer-fab').exists()).toBe(false)
    wrapper.unmount()
  })
})
