import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, VueWrapper } from '@vue/test-utils'
import Dashboard from '../dashboard.vue'
import eventBus from '@/utils/eventBus'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@/utils/eventBus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/utils/branding', () => ({
  getDefaultBrandingConfig: () => ({ logoDarkUrl: 'dark.svg', logoLightUrl: 'light.svg' }),
  loadBrandingConfig: vi.fn().mockResolvedValue({ logoDarkUrl: 'dark.svg', logoLightUrl: 'light.svg' })
}))

vi.mock('@/services/shortcutService', () => ({
  shortcutService: {
    getShortcuts: () => ({ quickJump: 'Command+P' }),
    formatShortcut: (shortcut: string) => shortcut.replace('Command', '⌘')
  }
}))

describe('dashboard shortcut hints', () => {
  let wrapper: VueWrapper<any> | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.clearAllMocks()
  })

  it('lists quick jump after the asset list, with its configured keys', async () => {
    wrapper = mount(Dashboard)
    await flushPromises()

    const items = wrapper.findAll('.shortcut-item').map((item) => ({
      description: item.find('.shortcut-description').text(),
      keys: item.findAll('kbd').map((key) => key.text())
    }))

    expect(items.map((item) => item.description)).toEqual([
      'shortcuts.hints.sendOrToggleAi',
      'shortcuts.hints.toggleLeftSidebar',
      'shortcuts.hints.quickJump',
      'shortcuts.hints.openSettings',
      'shortcuts.hints.openCommandDialog',
      'shortcuts.hints.toggleLayout'
    ])
    expect(items[2].keys).toEqual(['⌘', 'P'])
  })

  it('opens the quick jump palette when its row is clicked', async () => {
    wrapper = mount(Dashboard)
    await flushPromises()

    await wrapper.findAll('.shortcut-item')[2].trigger('click')

    expect(eventBus.emit).toHaveBeenCalledWith('toggleQuickJump')
  })
})
