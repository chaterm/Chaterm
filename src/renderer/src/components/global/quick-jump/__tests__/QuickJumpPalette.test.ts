import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import QuickJumpPalette from '../QuickJumpPalette.vue'
import eventBus from '@/utils/eventBus'
import { executeScript } from '@views/components/Ssh/utils/commandScript'
import { message } from 'ant-design-vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@/utils/eventBus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@views/components/Ssh/utils/commandScript', () => ({
  executeScript: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ant-design-vue')>()
  return { ...actual, message: { ...actual.message, warning: vi.fn() } }
})

const recentNode = {
  key: 'recent_uuid-prod_10.0.0.5_root',
  title: 'prod',
  uuid: 'uuid-prod',
  ip: '10.0.0.5',
  username: 'root',
  asset_type: 'person',
  isRecentConnection: true,
  lastConnected: '2026-04-20 10:00:00'
}
const olderNode = { ...recentNode, key: 'recent_uuid-old', title: 'old', uuid: 'uuid-old', ip: '10.0.0.6', lastConnected: '2026-04-01 10:00:00' }
const staging = { key: 'g_staging', title: 'staging', uuid: 'uuid-staging', ip: '10.0.1.1', username: 'ops', asset_type: 'person' }

const treeNode = (node: typeof recentNode) => ({ ...node, key: `g_${node.title}`, isRecentConnection: undefined, lastConnected: undefined })
const personTree = [
  { key: 'recent_connections', title: 'Recent', children: [recentNode, olderNode] },
  { key: 'g', title: 'Group', children: [treeNode(recentNode), treeNode(olderNode), staging] }
]

const api = {
  getLocalAssetRoute: vi.fn(),
  userSnippetOperation: vi.fn(),
  kbListDir: vi.fn()
}

describe('QuickJumpPalette', () => {
  let wrapper: VueWrapper<any> | null = null

  const mountPalette = async (props: Record<string, unknown> = {}) => {
    wrapper = mount(QuickJumpPalette, {
      props: {
        visible: true,
        tabs: [{ id: 'panel_1', title: 'prod-shell', subtitle: '10.0.0.5' }],
        activeTerminalTabId: 'term-1',
        ...props
      },
      attachTo: document.body,
      global: { stubs: { teleport: true } }
    })
    await flushPromises()
    return wrapper
  }

  const rowIds = () => wrapper!.findAll('.quick-jump-row').map((row) => row.attributes('data-row-id'))
  const activeRowId = () => wrapper!.find('.quick-jump-row.is-active').attributes('data-row-id')
  const press = async (key: string, init: KeyboardEventInit = {}) => {
    await wrapper!.find('.quick-jump-input').trigger('keydown', { key, ...init })
    await flushPromises()
  }

  beforeEach(() => {
    api.getLocalAssetRoute.mockImplementation(async ({ params }: { params: string[] }) => ({
      data: { routers: params[0] === 'person' ? personTree : [] }
    }))
    api.userSnippetOperation.mockResolvedValue({ data: { snippets: [{ uuid: 's1', snippet_name: 'disk usage', snippet_content: 'df -h' }] } })
    api.kbListDir.mockImplementation(async (relDir: string) =>
      relDir === ''
        ? [
            { name: 'ops', relPath: 'ops', type: 'dir' },
            { name: 'guide.md', relPath: 'guide.md', type: 'file' }
          ]
        : [{ name: 'runbook.md', relPath: 'ops/runbook.md', type: 'file' }]
    )
    ;(window as any).api = api
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.clearAllMocks()
  })

  it('opens with recent connections expanded and the newest one highlighted', async () => {
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus')

    await mountPalette()

    expect(rowIds()).toEqual(['group:recent', 'recent:uuid:uuid-prod', 'recent:uuid:uuid-old', 'group:tabs', 'group:snippets', 'group:knowledge'])
    expect(activeRowId()).toBe('recent:uuid:uuid-prod')
    expect(wrapper!.find('.quick-jump-input').attributes('placeholder')).toBe('quickJump.placeholder')
    expect(wrapper!.find('.quick-jump-input').attributes('aria-label')).toBe('quickJump.placeholder')
    expect(focusSpy).toHaveBeenCalledTimes(1)
    focusSpy.mockRestore()
  })

  it('connects to the highlighted recent host on Enter and closes without refocusing', async () => {
    await mountPalette()

    await press('Enter')

    expect(eventBus.emit).toHaveBeenCalledWith('currentClickServer', recentNode)
    expect(eventBus.emit).toHaveBeenCalledWith('getAllOpenedHosts')
    expect(eventBus.emit).not.toHaveBeenCalledWith('focusActiveTerminal', expect.anything())
    expect(wrapper!.emitted('update:visible')![0]).toEqual([false])
  })

  it('moves the highlight with the arrow keys and wraps around', async () => {
    await mountPalette()

    await press('ArrowDown')
    expect(activeRowId()).toBe('recent:uuid:uuid-old')
    await press('ArrowUp')
    await press('ArrowUp')
    expect(activeRowId()).toBe('group:recent')
    await press('ArrowUp')
    expect(activeRowId()).toBe('group:knowledge')
    await press('ArrowDown')
    expect(activeRowId()).toBe('group:recent')
  })

  it('expands and collapses groups with Enter and the horizontal arrows', async () => {
    await mountPalette()

    await press('ArrowDown')
    await press('ArrowDown')
    expect(activeRowId()).toBe('group:tabs')

    await press('Enter')
    expect(rowIds()).toContain('tab:panel_1')
    expect(wrapper!.find('[data-row-id="group:tabs"]').attributes('aria-expanded')).toBe('true')

    await press('ArrowLeft')
    expect(rowIds()).not.toContain('tab:panel_1')

    await press('ArrowRight')
    expect(rowIds()).toContain('tab:panel_1')

    await press('ArrowDown')
    expect(activeRowId()).toBe('tab:panel_1')
    await press('ArrowRight')
    expect(activeRowId()).toBe('tab:panel_1')
    await press('ArrowLeft')
    expect(rowIds()).toContain('tab:panel_1')
    expect(activeRowId()).toBe('group:tabs')
    await press('ArrowLeft')
    expect(rowIds()).not.toContain('tab:panel_1')
  })

  it('does not toggle anything when ArrowLeft or ArrowRight is pressed without a highlight', async () => {
    api.getLocalAssetRoute.mockResolvedValue({ data: { routers: [] } })
    api.userSnippetOperation.mockResolvedValue({ data: { snippets: [] } })
    api.kbListDir.mockResolvedValue([])
    await mountPalette({ tabs: [] })

    await press('ArrowLeft')
    await press('ArrowRight')
    await press('Enter')

    expect(rowIds()).toEqual([])
    expect(eventBus.emit).not.toHaveBeenCalled()
  })

  it('switches to a tab', async () => {
    await mountPalette()

    await wrapper!.find('[data-row-id="group:tabs"]').trigger('click')
    await wrapper!.find('[data-row-id="tab:panel_1"]').trigger('click')

    expect(wrapper!.emitted('selectTab')![0]).toEqual(['panel_1'])
    expect(wrapper!.emitted('update:visible')![0]).toEqual([false])
  })

  it('runs a snippet in the active terminal and returns focus to it', async () => {
    await mountPalette()

    await wrapper!.find('[data-row-id="group:snippets"]').trigger('click')
    await wrapper!.find('[data-row-id="snippet:s1"]').trigger('click')

    expect(executeScript).toHaveBeenCalledTimes(1)
    const [content, terminal, autoExecute] = vi.mocked(executeScript).mock.calls[0]
    expect(content).toBe('df -h')
    expect(autoExecute).toBe(true)
    terminal.write('df -h\r')
    expect(eventBus.emit).toHaveBeenCalledWith('autoExecuteCode', { command: 'df -h\r', tabId: 'term-1' })
    expect(eventBus.emit).toHaveBeenCalledWith('focusActiveTerminal', 'term-1')
    expect(wrapper!.emitted('update:visible')![0]).toEqual([false])
  })

  it('warns and stays open when a snippet is chosen without an active terminal', async () => {
    await mountPalette({ activeTerminalTabId: null })

    await wrapper!.find('[data-row-id="group:snippets"]').trigger('click')
    await wrapper!.find('[data-row-id="snippet:s1"]').trigger('click')

    expect(message.warning).toHaveBeenCalledWith('macro.noActiveTerminal')
    expect(executeScript).not.toHaveBeenCalled()
    expect(wrapper!.emitted('update:visible')).toBeUndefined()
  })

  it('opens a knowledge base file in the editor tab', async () => {
    await mountPalette()

    await wrapper!.find('[data-row-id="group:knowledge"]').trigger('click')
    await wrapper!.find('[data-row-id="kbdir:ops"]').trigger('click')
    await wrapper!.find('[data-row-id="kb:ops/runbook.md"]').trigger('click')

    expect(eventBus.emit).toHaveBeenCalledWith('openUserTab', {
      key: 'KnowledgeCenterEditor',
      title: 'runbook.md',
      id: 'kb:ops/runbook.md',
      props: { relPath: 'ops/runbook.md' }
    })
    expect(wrapper!.emitted('update:visible')![0]).toEqual([false])
  })

  it('shows the knowledge base like its list: folders first, closed, then files, with icons and depth', async () => {
    await mountPalette()

    await wrapper!.find('[data-row-id="group:knowledge"]').trigger('click')
    expect(rowIds().filter((id) => id!.startsWith('kb'))).toEqual(['kbdir:ops', 'kb:guide.md'])
    const folder = wrapper!.find('[data-row-id="kbdir:ops"]')
    expect(folder.attributes('aria-expanded')).toBe('false')
    expect(folder.attributes('aria-level')).toBe('2')
    expect(folder.find('.anticon-caret-right').exists()).toBe(true)
    expect(folder.find('.anticon-folder').exists()).toBe(true)
    const topFile = wrapper!.find('[data-row-id="kb:guide.md"]')
    expect(topFile.find('.anticon-file').exists()).toBe(true)
    expect(topFile.find('.quick-jump-subtitle').exists()).toBe(false)

    await folder.trigger('click')
    const opened = wrapper!.find('[data-row-id="kbdir:ops"]')
    expect(opened.attributes('aria-expanded')).toBe('true')
    expect(opened.find('.anticon-caret-down').exists()).toBe(true)
    expect(opened.find('.anticon-folder-open').exists()).toBe(true)
    const nested = wrapper!.find('[data-row-id="kb:ops/runbook.md"]')
    expect(nested.attributes('aria-level')).toBe('3')
    expect(nested.attributes('style')).toContain('--depth: 1')
    expect(rowIds().filter((id) => id!.startsWith('kb'))).toEqual(['kbdir:ops', 'kb:ops/runbook.md', 'kb:guide.md'])
  })

  it('opens and closes folders with the keyboard and walks back up with the left arrow', async () => {
    await mountPalette()
    await wrapper!.find('[data-row-id="group:knowledge"]').trigger('click')
    expect(activeRowId()).toBe('group:knowledge')

    await press('ArrowDown')
    expect(activeRowId()).toBe('kbdir:ops')
    await press('ArrowRight')
    expect(rowIds()).toContain('kb:ops/runbook.md')
    expect(activeRowId()).toBe('kbdir:ops')

    await press('ArrowDown')
    expect(activeRowId()).toBe('kb:ops/runbook.md')
    await press('ArrowLeft')
    expect(activeRowId()).toBe('kbdir:ops')
    expect(rowIds()).toContain('kb:ops/runbook.md')

    await press('ArrowLeft')
    expect(rowIds()).not.toContain('kb:ops/runbook.md')
    await press('ArrowLeft')
    expect(activeRowId()).toBe('group:knowledge')

    await press('ArrowDown')
    await press('ArrowDown')
    expect(activeRowId()).toBe('kb:guide.md')
    await press('ArrowLeft')
    expect(activeRowId()).toBe('group:knowledge')

    await press('ArrowDown')
    await press('Enter')
    expect(rowIds()).toContain('kb:ops/runbook.md')
    await press('Enter')
    expect(rowIds()).not.toContain('kb:ops/runbook.md')
  })

  it('opens the folders above a matching file on its own while searching', async () => {
    await mountPalette()

    await wrapper!.find('.quick-jump-input').setValue('runbook')
    await flushPromises()

    const knowledge = rowIds().filter((id) => id!.startsWith('kb') || id === 'group:knowledge')
    expect(knowledge).toEqual(['group:knowledge', 'kbdir:ops', 'kb:ops/runbook.md'])
    const folder = wrapper!.find('[data-row-id="kbdir:ops"]')
    expect(folder.attributes('aria-expanded')).toBeUndefined()
    expect(folder.find('.anticon-folder-open').exists()).toBe(true)
    expect(folder.find('.anticon-caret-down').exists()).toBe(false)

    await folder.trigger('click')
    expect(rowIds()).toContain('kb:ops/runbook.md')
    expect(activeRowId()).toBe('kb:ops/runbook.md')
  })

  it('searches every host, with recent ones first, and keeps the horizontal arrows for the caret', async () => {
    await mountPalette()

    await wrapper!.find('.quick-jump-input').setValue('10.0.')
    await flushPromises()

    expect(rowIds()).toEqual(['group:hosts', 'host:uuid:uuid-prod', 'host:uuid:uuid-old', 'host:uuid:uuid-staging'])
    expect(activeRowId()).toBe('host:uuid:uuid-prod')
    expect(wrapper!.find('[data-row-id="group:hosts"]').attributes('aria-expanded')).toBeUndefined()

    await press('ArrowLeft')
    await press('ArrowRight')
    expect(rowIds()).toHaveLength(4)

    await wrapper!.find('[data-row-id="group:hosts"]').trigger('click')
    expect(rowIds()).toHaveLength(4)

    await wrapper!.find('.quick-jump-input').setValue('staging')
    await flushPromises()
    await press('Enter')
    expect(eventBus.emit).toHaveBeenCalledWith('currentClickServer', staging)
  })

  it('restarts from the first result when the query changes', async () => {
    await mountPalette()
    await wrapper!.find('.quick-jump-input').setValue('10.0.')
    await flushPromises()
    await press('ArrowDown')
    expect(activeRowId()).toBe('host:uuid:uuid-old')

    await wrapper!.find('.quick-jump-input').setValue('10.0.1')
    await flushPromises()

    expect(activeRowId()).toBe('host:uuid:uuid-staging')
  })

  it('closes on Escape, giving focus back to the terminal', async () => {
    await mountPalette()

    await press('Escape')

    expect(wrapper!.emitted('update:visible')![0]).toEqual([false])
    expect(eventBus.emit).toHaveBeenCalledWith('focusActiveTerminal', 'term-1')
  })

  it('closes without a focus request when there is no active terminal', async () => {
    await mountPalette({ activeTerminalTabId: null })

    await press('Escape')

    expect(wrapper!.emitted('update:visible')![0]).toEqual([false])
    expect(eventBus.emit).not.toHaveBeenCalled()
  })

  it('closes when the backdrop is pressed but not when the panel is', async () => {
    await mountPalette()

    await wrapper!.find('.quick-jump-panel').trigger('mousedown')
    expect(wrapper!.emitted('update:visible')).toBeUndefined()

    await wrapper!.find('.quick-jump-overlay').trigger('mousedown')
    expect(wrapper!.emitted('update:visible')![0]).toEqual([false])
  })

  it('ignores keys while an input method is composing', async () => {
    await mountPalette()

    await press('Enter', { isComposing: true })
    await press('ArrowDown', { keyCode: 229 })

    expect(eventBus.emit).not.toHaveBeenCalled()
    expect(activeRowId()).toBe('recent:uuid:uuid-prod')
  })

  it('moves the highlight on real mouse movement only', async () => {
    await mountPalette()
    const target = wrapper!.find('[data-row-id="recent:uuid:uuid-old"]')

    await target.trigger('mousemove', { movementX: 0, movementY: 0 })
    expect(activeRowId()).toBe('recent:uuid:uuid-prod')

    await target.trigger('mousemove', { movementX: 3, movementY: 0 })
    expect(activeRowId()).toBe('recent:uuid:uuid-old')
  })

  it('hides the knowledge base group when the feature is disabled', async () => {
    vi.stubEnv('RENDERER_KB_SEARCH_ENABLED', 'false')
    vi.resetModules()
    const { default: Palette } = await import('../QuickJumpPalette.vue')

    wrapper = mount(Palette, {
      props: { visible: true, tabs: [], activeTerminalTabId: null },
      attachTo: document.body,
      global: { stubs: { teleport: true } }
    })
    await flushPromises()

    expect(api.kbListDir).not.toHaveBeenCalled()
    expect(rowIds().some((id) => id?.startsWith('group:knowledge'))).toBe(false)
    vi.unstubAllEnvs()
  })

  it('tolerates failing sources and keeps the rest', async () => {
    api.getLocalAssetRoute.mockRejectedValue(new Error('boom'))
    api.userSnippetOperation.mockRejectedValue(new Error('boom'))
    api.kbListDir.mockRejectedValue(new Error('boom'))

    await mountPalette()

    expect(rowIds()).toEqual(['group:tabs'])
  })

  it('treats missing payloads as empty lists', async () => {
    api.getLocalAssetRoute.mockResolvedValue(undefined)
    api.userSnippetOperation.mockResolvedValue(undefined)
    api.kbListDir.mockResolvedValue([])

    await mountPalette()

    expect(rowIds()).toEqual(['group:tabs'])
  })

  it('reloads and resets its state each time it opens, and drops data on close', async () => {
    await mountPalette()
    await wrapper!.find('.quick-jump-input').setValue('staging')
    await flushPromises()

    await wrapper!.setProps({ visible: false })
    expect(wrapper!.find('.quick-jump-overlay').exists()).toBe(false)

    await wrapper!.setProps({ visible: true })
    await flushPromises()

    expect((wrapper!.find('.quick-jump-input').element as HTMLInputElement).value).toBe('')
    expect(rowIds()[0]).toBe('group:recent')
    expect(api.getLocalAssetRoute).toHaveBeenCalledTimes(4)
  })

  it('discards a slow source that resolves after the palette was closed', async () => {
    let resolveTree: (value: unknown) => void = () => {}
    api.getLocalAssetRoute.mockImplementation(() => new Promise((resolve) => (resolveTree = resolve)))
    await mountPalette()

    await wrapper!.setProps({ visible: false })
    resolveTree({ data: { routers: personTree } })
    await flushPromises()
    await wrapper!.setProps({ visible: true })
    await nextTick()

    expect(rowIds()).not.toContain('recent:uuid:uuid-prod')
  })
})
