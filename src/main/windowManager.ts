import { BrowserWindow, shell, session, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getEdition } from './config/edition'

/**
 * Create and manage the main BrowserWindow.
 * The latest Cookie URL will be passed back via callback to avoid circular dependencies.
 */
export async function createMainWindow(onCookieUrlChange?: (url: string) => void, shouldPreventClose?: () => boolean): Promise<BrowserWindow> {
  // Set window title based on edition
  const edition = getEdition()
  const windowTitle = edition === 'cn' ? 'Chaterm CN' : 'Chaterm'

  const mainWindow = new BrowserWindow({
    width: 1344,
    height: 756,
    minWidth: 1060,
    minHeight: 600,
    title: windowTitle,
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin'
      ? {
          frame: false
        }
      : {}),
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local resources (file://)
      defaultFontFamily: {
        standard: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif',
        serif: 'serif',
        sansSerif: 'sans-serif',
        monospace: 'monospace'
      }
    }
  })

  /**
   * Show the window only after the 'ready-to-show' event to avoid a white flash.
   */
  // mainWindow.on('ready-to-show', () => {
  //   mainWindow.show()
  // })

  /**
   * On macOS the red close button merely hides the window instead of quitting the app.
   */
  if (process.platform === 'darwin') {
    mainWindow.on('close', (event) => {
      if (shouldPreventClose ? shouldPreventClose() : true) {
        event.preventDefault()
        // Exit fullscreen before hiding to prevent black screen issue on macOS
        if (mainWindow.isFullScreen()) {
          mainWindow.once('leave-full-screen', () => {
            mainWindow.hide()
          })
          mainWindow.setFullScreen(false)
        } else {
          if (mainWindow.isMaximized()) {
            mainWindow.unmaximize()
          }
          mainWindow.hide()
        }
      }
    })
  }

  /**
   * Intercept window.open; allow SSO URLs, while opening everything else in the system browser.
   */
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    if (details.url.includes('sso')) {
      return { action: 'allow' }
    }
    return { action: 'deny' }
  })

  // Load the dev-server URL in development, or the local HTML file in production
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Listen for URL changes so we can update the Cookie URL via callback
  mainWindow.webContents.on('did-finish-load', () => {
    const url = mainWindow.webContents.getURL()
    const cookieUrl = url.startsWith('file://') ? 'http://localhost' : url
    onCookieUrlChange?.(cookieUrl)
  })

  /**
   * Allow WebSocket connections that use the ws:// scheme.
   */
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['ws://*/*'] }, (details, callback) => {
    callback({ cancel: false, redirectURL: details.url })
  })

  // Listen for window state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized')
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:unmaximized')
  })

  // Disable Command+R (macOS) / Ctrl+R (Windows/Linux) reload shortcut
  // while preserving Ctrl+R for terminal reverse history search (reverse-i-search)
  let isTerminalFocused = false
  ipcMain.on('terminal:focus-changed', (_event, focused: boolean) => {
    isTerminalFocused = focused
  })
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'r' || input.key === 'R') && !input.alt && !input.shift) {
      if (process.platform === 'darwin') {
        // On macOS: block Cmd+R (reload), allow Ctrl+R (terminal reverse-i-search)
        if (input.meta) {
          event.preventDefault()
        }
      } else {
        // On Windows/Linux: block Ctrl+R only when terminal is not focused
        if (input.control && !isTerminalFocused) {
          event.preventDefault()
        }
      }
    }
  })

  return mainWindow
}
