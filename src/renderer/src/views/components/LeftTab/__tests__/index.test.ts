import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LeftTab from '../index.vue'
import { menuTabsData } from '../constants/data'

vi.mock('@/utils/permission', () => ({
  removeToken: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}))

vi.mock('@/api/user/user', () => ({
  userLogOut: vi.fn()
}))

vi.mock('@/store/index', () => ({
  userInfoStore: vi.fn(() => ({
    stashMenu: 'workspace',
    updateStashMenu: vi.fn(),
    userInfo: {
      name: 'Tester',
      email: 'tester@example.com'
    }
  }))
}))

vi.mock('@/main', () => ({
  pinia: {}
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn()
  }
}))

vi.mock('@/services/shortcutService', () => ({
  shortcutService: {
    init: vi.fn()
  }
}))

vi.mock('@/services/dataSyncService', () => ({
  dataSyncService: {
    getInitializationStatus: vi.fn(() => false),
    disableDataSync: vi.fn(),
    reset: vi.fn()
  }
}))

vi.mock('@/services/chatSyncService', () => ({
  chatSyncService: {
    disable: vi.fn()
  }
}))

vi.mock('@/utils/convertFileLocalResourceSrc', () => ({
  convertFileLocalResourceSrc: (value: string) => value
}))

describe('LeftTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).createRendererLogger = vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
    ;(window as any).api = {
      getPluginViews: vi.fn(async () => []),
      onPluginMetadataChanged: vi.fn(() => vi.fn())
    }
    window.localStorage.clear()
  })

  it('includes database in menuTabsData', () => {
    expect(menuTabsData.some((item) => item.key === 'database')).toBe(true)
  })

  it('emits toggle-menu when database menu is clicked', async () => {
    const wrapper = mount(LeftTab, {
      global: {
        stubs: {
          'a-tooltip': {
            template: '<div><slot /></div>'
          }
        },
        mocks: {
          $t: (key: string) => key
        }
      }
    })

    const databaseIndex = menuTabsData.findIndex((item) => item.key === 'database')
    expect(databaseIndex).toBeGreaterThan(-1)

    const menuItems = wrapper.findAll('.term_menu')
    await menuItems[databaseIndex].trigger('click')

    const emitted = wrapper.emitted('toggle-menu')
    expect(emitted).toBeTruthy()
    expect(emitted?.[0]?.[0]).toMatchObject({
      menu: 'database',
      type: 'dif',
      isPlugin: false
    })
  })
})
