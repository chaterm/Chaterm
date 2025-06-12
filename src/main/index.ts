import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { registerSSHHandlers } from './ssh/sshHandle'
import { registerRemoteTerminalHandlers } from './ssh/agentHandle'
import { autoCompleteDatabaseService, ChatermDatabaseService } from './storage/database'
import { Controller } from './agent/core/controller'
import { createExtensionContext } from './agent/core/controller/context'
import { ElectronOutputChannel } from './agent/core/controller/outputChannel'
import { executeRemoteCommand } from './agent/integrations/remote-terminal/example'
import {
  initializeStorageMain,
  testStorageFromMain as testRendererStorageFromMain
} from './agent/core/storage/state'
import { getTaskMetadata } from './agent/core/storage/disk'
import { HeartbeatManager } from './heartBeatManager'
let mainWindow: BrowserWindow
let COOKIE_URL = 'http://localhost'
let browserWindow: BrowserWindow | null = null
let lastWidth: number = 1344 // 默认窗口宽度
let lastHeight: number = 756 // 默认窗口高度

let autoCompleteService: autoCompleteDatabaseService
let chatermDbService: ChatermDatabaseService
let controller: Controller

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
        standard:
          '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif',
        serif: 'serif',
        sansSerif: 'sans-serif',
        monospace: 'monospace'
      }
    }
  })

  // 窗口拖拽功能
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // if (!is.dev) {
    //   console.log('🔧 [Debug] Opening DevTools in packaged app for debugging')
    //   mainWindow.webContents.openDevTools()
    // }
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
    const url = mainWindow.webContents.getURL()
    // 替换 file:// 协议为 http://localhost（防止 cookie 失效问题）
    if (url.startsWith('file://')) {
      COOKIE_URL = 'http://localhost'
    } else {
      COOKIE_URL = url
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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  if (process.platform === 'darwin') {
    app.dock.setIcon(join(__dirname, '../../resources/icon.png'))
  }

  // 注册窗口拖拽处理程序（只注册一次）
  ipcMain.handle('custom-adsorption', (_, res) => {
    const { appX, appY, width, height } = res

    // 获取屏幕尺寸
    const { screen } = require('electron')
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    // 计算边界吸附
    let finalX = Math.round(appX)
    let finalY = Math.round(appY)

    // 左右边界吸附
    if (Math.abs(appX) < 20) {
      finalX = 0
    } else if (Math.abs(screenWidth - (appX + width)) < 20) {
      finalX = Math.round(screenWidth - width)
    }

    // 上下边界吸附
    if (Math.abs(appY) < 20) {
      finalY = 0
    } else if (Math.abs(screenHeight - (appY + height)) < 20) {
      finalY = Math.round(screenHeight - height)
    }

    // 直接设置窗口位置，使用更小的缓动系数实现平滑效果
    const currentBounds = mainWindow.getBounds()
    const newX = Math.round(currentBounds.x + (finalX - currentBounds.x) * 0.5)
    const newY = Math.round(currentBounds.y + (finalY - currentBounds.y) * 0.5)

    mainWindow.setBounds({
      x: newX,
      y: newY,
      width: Math.round(width),
      height: Math.round(height)
    })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  setupIPC()
  await createWindow()

  // 初始化存储系统
  initializeStorageMain(mainWindow)

  // 注册ssh组件
  registerSSHHandlers()
  registerRemoteTerminalHandlers()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  try {
    const context = createExtensionContext()
    const outputChannel = new ElectronOutputChannel()

    controller = new Controller(context, outputChannel, (message) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('main-to-webview', message)
        return Promise.resolve(true)
      }
      return Promise.resolve(false)
    })
  } catch (error) {
    console.error('Failed to initialize Controller:', error)
  }

  // Call the test function (imported from ./agent/core/storage/state.ts)
  if (mainWindow && mainWindow.webContents) {
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => {
        console.log(
          '[Main Index] Main window finished loading. Calling testRendererStorageFromMain.'
        )
        testRendererStorageFromMain()
      })
    } else {
      console.log(
        '[Main Index] Main window already loaded. Calling testRendererStorageFromMain directly.'
      )
      testRendererStorageFromMain()
    }
  } else {
    console.warn(
      '[Main Index] mainWindow or webContents not available when trying to schedule testRendererStorageFromMain.'
    )
  }
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const hbManager = new HeartbeatManager()
ipcMain.handle('heartbeat-start', (event, { heartbeatId, interval }) => {
  hbManager.start(heartbeatId, interval, event.sender)
})

// 2. 渲染进程请求关闭心跳
ipcMain.handle('heartbeat-stop', (event, { heartbeatId }) => {
  hbManager.stop(heartbeatId)
})

// Add the before-quit event listener here or towards the end of the file
app.on('before-quit', async () => {
  console.log('Application is about to quit. Disposing resources...')
  if (controller) {
    try {
      await controller.dispose()
      console.log('Controller disposed successfully.')
    } catch (error) {
      console.error('Error during controller disposal:', error)
    }
  }
})

const getCookieByName = async (name) => {
  try {
    if (!COOKIE_URL) {
      return { success: false, error: 'Cookie URL not initialized' }
    }
    const cookies = await session.defaultSession.cookies.get({ url: COOKIE_URL })
    const targetCookie = cookies.find((cookie) => cookie.name === name)
    return targetCookie
      ? { success: true, value: targetCookie.value }
      : { success: false, value: null }
  } catch (error) {
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
  ipcMain.handle('window:maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.maximize()
    }
  })

  ipcMain.handle('window:unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
        if (lastWidth && lastHeight) {
          // 获取当前窗口所在的显示器
          const { screen } = require('electron')
          const currentDisplay = screen.getDisplayNearestPoint(mainWindow.getBounds())
          const { width: screenWidth, height: screenHeight } = currentDisplay.workAreaSize

          // 计算窗口在当前显示器中的居中位置
          const x = Math.floor((screenWidth - lastWidth) / 2) + currentDisplay.bounds.x
          const y = Math.floor((screenHeight - lastHeight) / 2) + currentDisplay.bounds.y

          mainWindow.setBounds({
            x,
            y,
            width: lastWidth,
            height: lastHeight
          })
        }
      }
    }
  })

  ipcMain.handle('window:is-maximized', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow.isMaximized()
    }
    return false
  })

  ipcMain.handle('cancel-task', async () => {
    console.log('cancel-task')
    if (controller) {
      return await controller.cancelTask()
    }
    return null
  })
  // 添加从渲染进程到主进程的消息处理器
  ipcMain.handle('webview-to-main', async (_, message) => {
    console.log('webview-to-main', message)
    if (controller) {
      return await controller.handleWebviewMessage(message)
    }
    return null
  })

  // 添加从主进程到渲染进程的消息处理器
  ipcMain.on('main-to-webview', (_, message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-to-webview', message)
    }
  })
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

ipcMain.handle('agent-chaterm-messages', async (_, data) => {
  try {
    const { taskId } = data
    const result = chatermDbService.getSavedChatermMessages(taskId)
    return result
  } catch (error) {
    console.error('Chaterm获取UI消息失败:', error)
    return null
  }
})

// 这段代码是新增的，用于处理来自渲染进程的调用
ipcMain.handle('execute-remote-command', async () => {
  console.log('Received execute-remote-command IPC call') // 添加日志
  try {
    const output = await executeRemoteCommand()
    console.log('executeRemoteCommand output:', output) // 添加日志
    return { success: true, output }
  } catch (error) {
    console.error('Failed to execute remote command in main process:', error) // 修改日志
    if (error instanceof Error) {
      return {
        success: false,
        error: { message: error.message, stack: error.stack, name: error.name }
      }
    }
    return { success: false, error: { message: 'An unknown error occurred in main process' } } // 修改日志
  }
})

ipcMain.handle('get-task-metadata', async (_event, { taskId }) => {
  try {
    const metadata = await getTaskMetadata(taskId)
    return { success: true, data: metadata }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: { message: error.message } }
    }
  }
})

ipcMain.handle('get-user-hosts', async (_, data) => {
  try {
    const { search } = data
    const result = chatermDbService.getUserHosts(search)
    return result
  } catch (error) {
    console.error('Chaterm获取用户主机列表失败:', error)
    return null
  }
})
