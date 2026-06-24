import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcHandleMock = vi.hoisted(() => vi.fn())
const fromWebContentsMock = vi.hoisted(() => vi.fn())
const getFocusedWindowMock = vi.hoisted(() => vi.fn())
const getAllWindowsMock = vi.hoisted(() => vi.fn())
const getDisplayNearestPointMock = vi.hoisted(() =>
  vi.fn(() => ({
    bounds: { x: 10, y: 20 },
    workAreaSize: { width: 1920, height: 1080 }
  }))
)

vi.mock('electron', () => ({
  ipcMain: { handle: ipcHandleMock },
  BrowserWindow: {
    fromWebContents: fromWebContentsMock,
    getFocusedWindow: getFocusedWindowMock,
    getAllWindows: getAllWindowsMock
  },
  screen: {
    getDisplayNearestPoint: getDisplayNearestPointMock
  }
}))

function createMockWindow(id: number) {
  return {
    id,
    webContents: { id, send: vi.fn() },
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => false),
    show: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: vi.fn(() => false),
    minimize: vi.fn(),
    close: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1344, height: 756 })),
    setBounds: vi.fn()
  }
}

function getRegisteredHandler(channel: string) {
  const handler = ipcHandleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1]
  expect(handler).toBeTypeOf('function')
  return handler
}

describe('window IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getAllWindowsMock.mockReturnValue([])
    getFocusedWindowMock.mockReturnValue(null)
    fromWebContentsMock.mockReturnValue(null)
  })

  it('creates a new main window through window:new', async () => {
    const newWindow = createMockWindow(2)
    const createAppWindow = vi.fn().mockResolvedValue({
      window: newWindow,
      contentLoaded: Promise.resolve()
    })

    const { registerWindowIpcHandlers } = await import('./windowIpc')
    registerWindowIpcHandlers({
      createAppWindow,
      getFallbackWindow: () => null,
      winReady: Promise.resolve(),
      mark: vi.fn(),
      isDev: false
    })

    const handler = getRegisteredHandler('window:new')
    await expect(handler({ sender: {} })).resolves.toEqual({ windowId: 2 })
    expect(createAppWindow).toHaveBeenCalledTimes(1)
  })

  it('minimizes the window that sent the IPC event', async () => {
    const firstWindow = createMockWindow(1)
    const secondWindow = createMockWindow(2)
    fromWebContentsMock.mockReturnValue(secondWindow)

    const { registerWindowIpcHandlers } = await import('./windowIpc')
    registerWindowIpcHandlers({
      createAppWindow: vi.fn(),
      getFallbackWindow: () => firstWindow as unknown as Electron.BrowserWindow,
      winReady: Promise.resolve(),
      mark: vi.fn(),
      isDev: false
    })

    const handler = getRegisteredHandler('window:minimize')
    await handler({ sender: secondWindow.webContents })

    expect(secondWindow.minimize).toHaveBeenCalledTimes(1)
    expect(firstWindow.minimize).not.toHaveBeenCalled()
  })

  it('shows the window that sent main-window-show', async () => {
    const firstWindow = createMockWindow(1)
    const secondWindow = createMockWindow(2)
    const collectAndLogTimeline = vi.fn()
    fromWebContentsMock.mockReturnValue(secondWindow)

    const { registerWindowIpcHandlers } = await import('./windowIpc')
    registerWindowIpcHandlers({
      createAppWindow: vi.fn(),
      getFallbackWindow: () => firstWindow as unknown as Electron.BrowserWindow,
      winReady: Promise.resolve(),
      mark: vi.fn(),
      isDev: true,
      collectAndLogTimeline
    })

    const handler = getRegisteredHandler('main-window-show')
    await handler({ sender: secondWindow.webContents })

    expect(secondWindow.show).toHaveBeenCalledTimes(1)
    expect(firstWindow.show).not.toHaveBeenCalled()
    expect(collectAndLogTimeline).toHaveBeenCalledWith(secondWindow)
  })

  it('restores the sender window to the default centered bounds', async () => {
    const targetWindow = createMockWindow(2)
    targetWindow.isMaximized.mockReturnValue(true)
    fromWebContentsMock.mockReturnValue(targetWindow)

    const { registerWindowIpcHandlers } = await import('./windowIpc')
    registerWindowIpcHandlers({
      createAppWindow: vi.fn(),
      getFallbackWindow: () => null,
      winReady: Promise.resolve(),
      mark: vi.fn(),
      isDev: false
    })

    const handler = getRegisteredHandler('window:unmaximize')
    await handler({ sender: targetWindow.webContents })

    expect(targetWindow.unmaximize).toHaveBeenCalledTimes(1)
    expect(targetWindow.setBounds).toHaveBeenCalledWith({
      x: 298,
      y: 182,
      width: 1344,
      height: 756
    })
  })
})
