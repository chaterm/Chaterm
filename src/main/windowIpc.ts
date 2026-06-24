import { BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent } from 'electron'
import type { WindowCreationResult } from './windowManager'

type MarkFn = (name: string) => void
type CollectTimelineFn = (window: BrowserWindow) => void

export interface RegisterWindowIpcHandlersOptions {
  createAppWindow: () => Promise<WindowCreationResult>
  getFallbackWindow: () => BrowserWindow | null | undefined
  winReady: Promise<unknown>
  mark: MarkFn
  isDev: boolean
  collectAndLogTimeline?: CollectTimelineFn
  defaultWidth?: number
  defaultHeight?: number
}

const DEFAULT_WINDOW_WIDTH = 1344
const DEFAULT_WINDOW_HEIGHT = 756

const isUsableWindow = (window: BrowserWindow | null | undefined): window is BrowserWindow => Boolean(window && !window.isDestroyed())

const getWindowFromEvent = (event: IpcMainInvokeEvent, getFallbackWindow: () => BrowserWindow | null | undefined): BrowserWindow | null => {
  const eventWindow = BrowserWindow.fromWebContents(event.sender)
  if (isUsableWindow(eventWindow)) {
    return eventWindow
  }

  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (isUsableWindow(focusedWindow)) {
    return focusedWindow
  }

  const fallbackWindow = getFallbackWindow()
  if (isUsableWindow(fallbackWindow)) {
    return fallbackWindow
  }

  return BrowserWindow.getAllWindows().find((window) => isUsableWindow(window)) ?? null
}

export function registerWindowIpcHandlers(options: RegisterWindowIpcHandlersOptions): void {
  const width = options.defaultWidth ?? DEFAULT_WINDOW_WIDTH
  const height = options.defaultHeight ?? DEFAULT_WINDOW_HEIGHT
  const getTargetWindow = (event: IpcMainInvokeEvent): BrowserWindow | null => getWindowFromEvent(event, options.getFallbackWindow)

  ipcMain.handle('custom-adsorption', (event, res) => {
    const targetWindow = getTargetWindow(event)
    if (!targetWindow) {
      return
    }

    const { appX, appY } = res
    const nextWidth = Math.round(res.width)
    const nextHeight = Math.round(res.height)
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    let finalX = Math.round(appX)
    let finalY = Math.round(appY)

    if (Math.abs(appX) < 20) {
      finalX = 0
    } else if (Math.abs(screenWidth - (appX + nextWidth)) < 20) {
      finalX = Math.round(screenWidth - nextWidth)
    }

    if (Math.abs(appY) < 20) {
      finalY = 0
    } else if (Math.abs(screenHeight - (appY + nextHeight)) < 20) {
      finalY = Math.round(screenHeight - nextHeight)
    }

    const currentBounds = targetWindow.getBounds()
    const newX = Math.round(currentBounds.x + (finalX - currentBounds.x) * 0.5)
    const newY = Math.round(currentBounds.y + (finalY - currentBounds.y) * 0.5)

    targetWindow.setBounds({
      x: newX,
      y: newY,
      width: nextWidth,
      height: nextHeight
    })
  })

  ipcMain.handle('window:new', async () => {
    const result = await options.createAppWindow()
    return { windowId: result.window.id }
  })

  ipcMain.handle('window:maximize', (event) => {
    getTargetWindow(event)?.maximize()
  })

  ipcMain.handle('window:unmaximize', (event) => {
    const targetWindow = getTargetWindow(event)
    if (!targetWindow || !targetWindow.isMaximized()) {
      return
    }

    targetWindow.unmaximize()
    const currentDisplay = screen.getDisplayNearestPoint(targetWindow.getBounds())
    const { width: screenWidth, height: screenHeight } = currentDisplay.workAreaSize
    const x = Math.floor((screenWidth - width) / 2) + currentDisplay.bounds.x
    const y = Math.floor((screenHeight - height) / 2) + currentDisplay.bounds.y

    targetWindow.setBounds({
      x,
      y,
      width,
      height
    })
  })

  ipcMain.handle('window:is-maximized', (event) => {
    return getTargetWindow(event)?.isMaximized() ?? false
  })

  ipcMain.handle('window:minimize', (event) => {
    getTargetWindow(event)?.minimize()
  })

  ipcMain.handle('window:close', (event) => {
    getTargetWindow(event)?.close()
  })

  ipcMain.handle('main-window-show', async (event) => {
    options.mark('chaterm/main/willShowWindow')
    await options.winReady

    const targetWindow = getTargetWindow(event)
    if (targetWindow && !targetWindow.isVisible()) {
      targetWindow.show()
    }

    options.mark('chaterm/main/didShowWindow')
    if (options.isDev && targetWindow) {
      options.collectAndLogTimeline?.(targetWindow)
    }
  })
}
