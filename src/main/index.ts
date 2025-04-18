import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow
let COOKIE_URL = ''

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1344,
    height: 756,
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: '#1a1a1a',
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
      nodeIntegration: false
    }
  })

  // 窗口拖拽功能
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    if (details.url.includes('sso')) {
      return { action: 'allow' }
    } else {
      return { action: 'deny' }
    }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  // 动态获取 URL
  mainWindow.webContents.on('did-finish-load', () => {
    COOKIE_URL = mainWindow.webContents.getURL()
    // 替换 file:// 协议为 http://localhost（防止 cookie 失效问题）
    if (COOKIE_URL.startsWith('file://')) {
      COOKIE_URL = 'http://localhost'
    }
  })

  // 配置 WebSocket 连接
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['ws://*/*'] }, (details, callback) => {
    callback({
      cancel: false,
      redirectURL: details.url
    })
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  // 注册窗口拖拽处理程序（只注册一次）
  ipcMain.handle('custom-adsorption', (_, res) => {
    mainWindow.setPosition(res.appX, res.appY)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const getCookieByName = async (name) => {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: COOKIE_URL })
    const targetCookie = cookies.find((cookie) => cookie.name === name)
    return targetCookie
      ? { success: true, value: targetCookie.value }
      : { success: false, value: null }
  } catch (error) {
    // console.error('Cookie read failed:', error)
    return { success: false, error }
  }
}
ipcMain.handle('get-platform', () => {
  return process.platform
})

// 获取所有 Cookies
const getAllCookies = async () => {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: COOKIE_URL })
    return { success: true, cookies }
  } catch (error) {
    // console.error('readAll Cookie failed:', error)
    return { success: false, error }
  }
}
// 移除 Cookie 方法
const removeCookie = async (name) => {
  try {
    await session.defaultSession.cookies.remove(COOKIE_URL, name)
    // console.log(`removeSuccess Cookie: ${name} (${COOKIE_URL})`)
    return { success: true }
  } catch (error) {
    // console.error(`removeFailed Cookie  (${COOKIE_URL}, ${name}):`, error)
    return { success: false, error }
  }
}

ipcMain.handle('get-cookie-url', () => COOKIE_URL) // 返回 Cookie URL
ipcMain.handle('set-cookie', async (_, name, value, expirationDays) => {
  const expirationDate = new Date()
  expirationDate.setDate(expirationDate.getDate() + expirationDays)

  const cookie = {
    url: COOKIE_URL,
    name,
    value,
    expirationDate: expirationDate.getTime() / 1000
  }

  try {
    await session.defaultSession.cookies.set(cookie)
    return { success: true }
  } catch (error) {
    // console.error('Cookie set failed:', error)
    return { success: false, error }
  }
})
ipcMain.handle('get-cookie', async (_, name) => {
  if (name) {
    return getCookieByName(name)
  } else {
    return getAllCookies()
  }
})
ipcMain.handle('remove-cookie', async (_, { name }) => {
  return await removeCookie(name)
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
