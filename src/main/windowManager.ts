import { BrowserWindow, shell, session } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

/**
 * Create and manage the main BrowserWindow.
 * The latest Cookie URL will be passed back via callback to avoid circular dependencies.
 */
export async function createMainWindow(onCookieUrlChange?: (url: string) => void, shouldPreventClose?: () => boolean): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 1344,
    height: 756,
    minWidth: 1060,
    minHeight: 600,
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: '#141414',
            symbolColor: '#fff',
            height: 27
          }
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
        mainWindow.hide()
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

  return mainWindow
}
