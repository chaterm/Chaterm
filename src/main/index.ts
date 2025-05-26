import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { registerSSHHandlers } from './sshHandle'
import { autoCompleteDatabaseService, ChatermDatabaseService } from './database'
let mainWindow: BrowserWindow
let COOKIE_URL = ''
let browserWindow: BrowserWindow | null = null

let autoCompleteService: autoCompleteDatabaseService
let chatermDbService: ChatermDatabaseService

async function createWindow(): Promise<void> {
  autoCompleteService = await autoCompleteDatabaseService.getInstance()
  chatermDbService = await ChatermDatabaseService.getInstance()
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
    const newBounds = {
      x: res.appX,
      y: res.appY,
      width: res.width,
      height: res.height
    }
    mainWindow.setBounds(newBounds, true)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  setupIPC()
  createWindow()

  // 注册ssh组件
  registerSSHHandlers()

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

function createBrowserWindow(url: string): void {
  // 如果浏览器窗口已经存在，就聚焦
  if (browserWindow && !browserWindow.isDestroyed()) {
    browserWindow.focus()
    browserWindow.loadURL(url)
    return
  }

  // 创建新的浏览器窗口
  browserWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    parent: mainWindow,
    webPreferences: {
      preload: join(__dirname, '../preload/browser-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 加载指定 URL
  browserWindow.loadURL(url)

  // 监听 URL 变化
  browserWindow.webContents.on('did-navigate', (_, url) => {
    console.log('新窗口导航到了:', url)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('url-changed', url)
    }

    // 更新导航状态
    updateNavigationState()
  })

  browserWindow.webContents.on('did-navigate-in-page', (_, url) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('url-changed', url)
    }

    // 更新导航状态
    updateNavigationState()
  })

  // 处理窗口关闭事件
  browserWindow.on('closed', () => {
    browserWindow = null
  })
}

function updateNavigationState(): void {
  if (browserWindow && !browserWindow.isDestroyed() && mainWindow && !mainWindow.isDestroyed()) {
    const canGoBack = browserWindow.webContents.canGoBack()
    const canGoForward = browserWindow.webContents.canGoForward()

    mainWindow.webContents.send('navigation-state-changed', {
      canGoBack,
      canGoForward
    })
  }
}
// 设置 IPC 处理
function setupIPC(): void {
  // 打开浏览器窗口
  ipcMain.on('open-browser-window', (_, url) => {
    createBrowserWindow(url)
  })

  // 浏览器导航控制
  ipcMain.on('browser-go-back', () => {
    if (browserWindow && !browserWindow.isDestroyed() && browserWindow.webContents.canGoBack()) {
      browserWindow.webContents.goBack()
      // 导航完成后会触发 did-navigate 事件，从而更新导航状态
    }
  })

  ipcMain.on('browser-go-forward', () => {
    if (browserWindow && !browserWindow.isDestroyed() && browserWindow.webContents.canGoForward()) {
      browserWindow.webContents.goForward()
      // 导航完成后会触发 did-navigate 事件，从而更新导航状态
    }
  })

  ipcMain.on('browser-refresh', () => {
    if (browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.webContents.reload()
    }
  })

  // 处理 SPA 路由变化
  ipcMain.on('spa-url-changed', (_, url) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('url-changed', url)
    }
  })
}

ipcMain.handle('query-command', async (_, data) => {
  try {
    const { command, ip } = data
    const result = autoCompleteService.queryCommand(command, ip)
    return result
  } catch (error) {
    console.error('查询命令失败:', error)
    return null
  }
})

ipcMain.handle('insert-command', async (_, data) => {
  try {
    const { command, ip } = data
    const result = autoCompleteService.insertCommand(command, ip)
    return result
  } catch (error) {
    console.error('插入命令失败:', error)
    return null
  }
})

// Chaterm数据库相关的IPC处理程序
ipcMain.handle('asset-route-local-get', async (_, data) => {
  try {
    const { searchType, params } = data
    const result = chatermDbService.getLocalAssetRoute(searchType, params || [])
    return result
  } catch (error) {
    console.error('Chaterm查询失败:', error)
    return null
  }
})

ipcMain.handle('asset-route-local-update', async (_, data) => {
  try {
    const { uuid, label } = data
    const result = chatermDbService.updateLocalAssetLabel(uuid, label)
    return result
  } catch (error) {
    console.error('Chaterm修改数据失败:', error)
    return null
  }
})

ipcMain.handle('asset-route-local-favorite', async (_, data) => {
  try {
    const { uuid, status } = data
    const result = chatermDbService.updateLocalAsseFavorite(uuid, status)
    return result
  } catch (error) {
    console.error('Chaterm修改数据失败:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-get', async () => {
  try {
    const result = chatermDbService.getKeyChainSelect()
    return result
  } catch (error) {
    console.error('Chaterm获取数据失败:', error)
    return null
  }
})

ipcMain.handle('asset-group-local-get', async () => {
  try {
    const result = chatermDbService.getAssetGroup()
    return result
  } catch (error) {
    console.error('Chaterm获取数据失败:', error)
    return null
  }
})

ipcMain.handle('asset-delete', async (_, data) => {
  try {
    const { uuid } = data
    const result = chatermDbService.deleteAsset(uuid)
    return result
  } catch (error) {
    console.error('Chaterm删除数据失败:', error)
    return null
  }
})

ipcMain.handle('asset-create', async (_, data) => {
  try {
    const { form } = data
    const result = chatermDbService.createAsset(form)
    return result
  } catch (error) {
    console.error('Chaterm创建资产失败:', error)
    return null
  }
})

ipcMain.handle('asset-update', async (_, data) => {
  try {
    const { form } = data
    const result = chatermDbService.updateAsset(form)
    return result
  } catch (error) {
    console.error('Chaterm修改资产失败:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-get-list', async () => {
  try {
    const result = chatermDbService.getKeyChainList()
    return result
  } catch (error) {
    console.error('Chaterm获取资产失败:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-create', async (_, data) => {
  try {
    const { form } = data
    const result = chatermDbService.createKeyChain(form)
    return result
  } catch (error) {
    console.error('Chaterm创建密钥失败:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-delete', async (_, data) => {
  try {
    const { id } = data
    const result = chatermDbService.deleteKeyChain(id)
    return result
  } catch (error) {
    console.error('Chaterm删除密钥失败:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-get-info', async (_, data) => {
  try {
    const { id } = data
    const result = chatermDbService.getKeyChainInfo(id)
    return result
  } catch (error) {
    console.error('Chaterm获取密钥失败:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-update', async (_, data) => {
  try {
    const { form } = data
    const result = chatermDbService.updateKeyChain(form)
    return result
  } catch (error) {
    console.error('Chaterm修改密钥失败:', error)
    return null
  }
})
ipcMain.handle('chaterm-connect-asset-info', async (_, data) => {
  try {
    const { uuid } = data
    const result = chatermDbService.connectAssetInfo(uuid)
    return result
  } catch (error) {
    console.error('Chaterm获取资产信息失败:', error)
    return null
  }
})
