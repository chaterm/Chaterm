import { beforeEach, describe, expect, it, vi } from 'vitest'

const setMenuMock = vi.hoisted(() => vi.fn())
const setApplicationMenuMock = vi.hoisted(() => vi.fn())
const buildFromTemplateMock = vi.hoisted(() => vi.fn((template) => ({ template })))

vi.mock('electron', () => ({
  app: {
    name: 'Chaterm',
    getLocale: vi.fn(() => 'en-US'),
    dock: {
      setMenu: setMenuMock
    }
  },
  Menu: {
    setApplicationMenu: setApplicationMenuMock,
    buildFromTemplate: buildFromTemplateMock
  }
}))

function findMenuItem(template: any[], label: string): any | null {
  for (const item of template) {
    if (item.label === label) {
      return item
    }

    if (Array.isArray(item.submenu)) {
      const found = findMenuItem(item.submenu, label)
      if (found) {
        return found
      }
    }
  }

  return null
}

describe('window menu', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('adds New Window to the application menu on all platforms', async () => {
    const createAppWindow = vi.fn().mockResolvedValue(undefined)
    const { registerWindowMenu } = await import('./windowMenu')

    registerWindowMenu({
      createAppWindow,
      platform: 'win32',
      locale: 'en-US'
    })

    const appTemplate = buildFromTemplateMock.mock.calls[0][0]
    const newWindowItem = findMenuItem(appTemplate, 'New Window')
    expect(newWindowItem).toEqual(expect.objectContaining({ accelerator: 'CommandOrControl+Shift+N' }))
    expect(setApplicationMenuMock).toHaveBeenCalledWith({ template: appTemplate })
  })

  it('creates a window from the application menu item', async () => {
    const createAppWindow = vi.fn().mockResolvedValue(undefined)
    const { registerWindowMenu } = await import('./windowMenu')

    registerWindowMenu({
      createAppWindow,
      platform: 'linux',
      locale: 'en-US'
    })

    const template = buildFromTemplateMock.mock.calls[0][0]
    await findMenuItem(template, 'New Window').click()

    expect(createAppWindow).toHaveBeenCalledTimes(1)
  })

  it('adds New Window to the macOS Dock menu as an additional entry', async () => {
    const createAppWindow = vi.fn().mockResolvedValue(undefined)
    const { registerWindowMenu } = await import('./windowMenu')

    registerWindowMenu({
      createAppWindow,
      platform: 'darwin',
      locale: 'en-US'
    })

    const dockTemplate = buildFromTemplateMock.mock.calls[1][0]
    expect(dockTemplate).toEqual([
      expect.objectContaining({
        label: 'New Window',
        accelerator: 'CommandOrControl+Shift+N'
      })
    ])
    expect(setMenuMock).toHaveBeenCalledWith({ template: dockTemplate })
  })

  it('uses Chinese labels for Chinese locales', async () => {
    const { registerWindowMenu } = await import('./windowMenu')

    registerWindowMenu({
      createAppWindow: vi.fn(),
      platform: 'darwin',
      locale: 'zh-CN'
    })

    const appTemplate = buildFromTemplateMock.mock.calls[0][0]
    expect(findMenuItem(appTemplate, '新建窗口')).toEqual(expect.objectContaining({ accelerator: 'CommandOrControl+Shift+N' }))
  })
})
