import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { is } from '@electron-toolkit/utils'
import axios from 'axios'
import { startDataSync } from './storage/data_sync/index'
import type { SyncController as DataSyncController } from './storage/data_sync/core/SyncController'
import { getChatermDbPathForUser, getCurrentUserId } from './storage/db/connection'

// Set environment variables
process.env.IS_DEV = is.dev ? 'true' : 'false'

import { registerSSHHandlers } from './ssh/sshHandle'
import { registerLocalSSHHandlers } from './ssh/localSSHHandle'
import { registerRemoteTerminalHandlers } from './ssh/agentHandle'
import { autoCompleteDatabaseService, ChatermDatabaseService, setCurrentUserId } from './storage/database'
import { getGuestUserId } from './storage/db/connection'
import { Controller } from './agent/core/controller'
import { createExtensionContext } from './agent/core/controller/context'
import { ElectronOutputChannel } from './agent/core/controller/outputChannel'
import { executeRemoteCommand } from './agent/integrations/remote-terminal/example'
import { initializeStorageMain, testStorageFromMain as testRendererStorageFromMain, getGlobalState } from './agent/core/storage/state'
import { getTaskMetadata } from './agent/core/storage/disk'
import { HeartbeatManager } from './heartBeatManager'
import { createMainWindow } from './windowManager'
import { registerUpdater } from './updater'
import { telemetryService, checkIsFirstLaunch, getMacAddress } from './agent/services/telemetry/TelemetryService'
import { envelopeEncryptionService } from './storage/data_sync/envelope_encryption/service'

let mainWindow: BrowserWindow
let COOKIE_URL = 'http://localhost'
let browserWindow: BrowserWindow | null = null
let lastWidth: number = 1344 // Default window width
let lastHeight: number = 756 // Default window height
let forceQuit = false

let autoCompleteService: autoCompleteDatabaseService
let chatermDbService: ChatermDatabaseService
let controller: Controller
let dataSyncController: DataSyncController | null = null

let winReadyResolve
let winReady = new Promise((resolve) => (winReadyResolve = resolve))
async function createWindow(): Promise<void> {
  mainWindow = await createMainWindow(
    (url: string) => {
      COOKIE_URL = url
    },
    () => !forceQuit
  )
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  if (process.platform === 'darwin') {
    app.dock.setIcon(join(__dirname, '../../resources/icon.png'))
  }

  // Register window drag handler (register only once)
  ipcMain.handle('custom-adsorption', (_, res) => {
    const { appX, appY, width, height } = res

    // Get screen dimensions
    const { screen } = require('electron')
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    // Calculate boundary snapping
    let finalX = Math.round(appX)
    let finalY = Math.round(appY)

    // Left and right boundary snapping
    if (Math.abs(appX) < 20) {
      finalX = 0
    } else if (Math.abs(screenWidth - (appX + width)) < 20) {
      finalX = Math.round(screenWidth - width)
    }

    // Top and bottom boundary snapping
    if (Math.abs(appY) < 20) {
      finalY = 0
    } else if (Math.abs(screenHeight - (appY + height)) < 20) {
      finalY = Math.round(screenHeight - height)
    }

    // Directly set window position, using smaller easing coefficient for smooth effect
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

  app.on('browser-window-created', (_, window) => {})

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  setupIPC()
  await createWindow()
  winReadyResolve()
  // Initialize storage system
  initializeStorageMain(mainWindow)

  // Register SSH components
  registerSSHHandlers()
  registerLocalSSHHandlers()
  registerRemoteTerminalHandlers()
  registerUpdater(mainWindow)
  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow) {
      mainWindow.show()
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
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

  // Function to initialize telemetry setting
  const initializeTelemetrySetting = async () => {
    let telemetrySetting
    try {
      telemetrySetting = await getGlobalState('telemetrySetting')
    } catch (error) {
      telemetrySetting = 'enabled'
    }

    if (controller) {
      await controller.updateTelemetrySetting(telemetrySetting)
    }

    const isFirstLaunch = checkIsFirstLaunch()

    if (isFirstLaunch) {
      telemetryService.captureAppFirstLaunch()
    }

    telemetryService.captureAppStarted()
  }

  // Call the test function (imported from ./agent/core/storage/state.ts)
  if (mainWindow && mainWindow.webContents) {
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => {
        console.log('[Main Index] Main window finished loading. Calling testRendererStorageFromMain.')
        testRendererStorageFromMain()
      })
    } else {
      console.log('[Main Index] Main window already loaded. Calling testRendererStorageFromMain directly.')
      testRendererStorageFromMain()
    }
  } else {
    console.warn('[Main Index] mainWindow or webContents not available when trying to schedule testRendererStorageFromMain.')
  }
  setTimeout(initializeTelemetrySetting, 1000)
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

// 2. Renderer process requests to stop heartbeat
ipcMain.handle('heartbeat-stop', (_, { heartbeatId }) => {
  hbManager.stop(heartbeatId)
})

// Add the before-quit event listener here or towards the end of the file
app.on('before-quit', async () => {
  forceQuit = true
  console.log('Application is about to quit. Disposing resources...')
  if (controller) {
    try {
      await controller.dispose()
      console.log('Controller disposed successfully.')
    } catch (error) {
      console.error('Error during controller disposal:', error)
    }
  }
  if (dataSyncController) {
    try {
      await dataSyncController.destroy()
      dataSyncController = null
      console.log('Data sync controller disposed successfully.')
    } catch (error) {
      console.error('Error during data sync controller disposal:', error)
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
    return targetCookie ? { success: true, value: targetCookie.value } : { success: false, value: null }
  } catch (error) {
    return { success: false, error }
  }
}
ipcMain.handle('get-platform', () => {
  return process.platform
})

// 异步执行IP检测
ipcMain.handle('detect-ip-location', async () => {
  try {
    const isMainlandChina = await detectIPLocation()

    // 缓存检测结果，有效期24小时
    global.ipDetectionCache = {
      isMainlandChina,
      timestamp: Date.now()
    }

    return { success: true, isMainlandChina }
  } catch (error) {
    console.error('[主进程] IP检测失败:', error)
    // 设置默认值
    global.ipDetectionCache = {
      isMainlandChina: true,
      timestamp: Date.now()
    }
    return { success: false, isMainlandChina: true, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// Get all Cookies
const getAllCookies = async () => {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: COOKIE_URL })
    return { success: true, cookies }
  } catch (error) {
    // console.error('readAll Cookie failed:', error)
    return { success: false, error }
  }
}
// Remove Cookie method
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

ipcMain.handle('get-cookie-url', () => COOKIE_URL) // Return Cookie URL
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
  // If browser window already exists, focus it
  if (browserWindow && !browserWindow.isDestroyed()) {
    browserWindow.focus()
    browserWindow.loadURL(url)
    return
  }

  // Create new browser window
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

  // Load specified URL
  browserWindow.loadURL(url)

  // Listen for URL changes
  browserWindow.webContents.on('did-navigate', (_, url) => {
    console.log('New window navigated to:', url)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('url-changed', url)
    }

    // Update navigation state
    updateNavigationState()
  })

  browserWindow.webContents.on('did-navigate-in-page', (_, url) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('url-changed', url)
    }

    // Update navigation state
    updateNavigationState()
  })

  // Handle window close event
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

// Setup IPC handlers
function setupIPC(): void {
  ipcMain.handle('init-user-database', async (event, { uid }) => {
    try {
      const isSkippedLogin = await event.sender.executeJavaScript("localStorage.getItem('login-skipped') === 'true'")
      const targetUserId = uid || (isSkippedLogin ? getGuestUserId() : null)
      if (!targetUserId) {
        throw new Error('User ID is required')
      }

      // 检查是否为用户切换（用户ID发生变化）
      const previousUserId = getCurrentUserId()
      const isUserSwitch = previousUserId && previousUserId !== targetUserId

      setCurrentUserId(targetUserId)
      chatermDbService = await ChatermDatabaseService.getInstance(targetUserId)
      autoCompleteService = await autoCompleteDatabaseService.getInstance(targetUserId)

      // 同步设置认证信息，确保在数据同步启动前完成
      try {
        // 获取用户认证信息并设置到加密服务
        const ctmToken = await event.sender.executeJavaScript("localStorage.getItem('ctm-token')")
        if (ctmToken && ctmToken !== 'guest_token') {
          console.log(`为用户 ${targetUserId} 设置认证信息...`)
          envelopeEncryptionService.setAuthInfo(ctmToken, targetUserId.toString())
          console.log(`用户 ${targetUserId} 认证信息设置完成`)
        } else {
          console.warn(`用户 ${targetUserId} 未找到有效的认证token`)
        }

        // 用户切换完成，数据同步将由渲染进程重新初始化
        if (isUserSwitch) {
          console.log(`检测到用户切换: ${previousUserId} -> ${targetUserId}，数据同步将由渲染进程处理`)
        }
      } catch (error) {
        console.warn('设置认证信息异常:', error)
        if (isUserSwitch) {
          console.log(`认证信息设置失败，用户切换: ${previousUserId} -> ${targetUserId}`)
        }
      }

      return { success: true }
    } catch (error) {
      console.error('Database initialization failed:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  })

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
          // Get the display where the current window is located
          const { screen } = require('electron')
          const currentDisplay = screen.getDisplayNearestPoint(mainWindow.getBounds())
          const { width: screenWidth, height: screenHeight } = currentDisplay.workAreaSize

          // Calculate the centered position of the window on the current display
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

  ipcMain.handle('graceful-cancel-task', async () => {
    console.log('graceful-cancel-task')
    if (controller) {
      return await controller.gracefulCancelTask()
    }
    return null
  })
  // Add message handler from renderer process to main process
  ipcMain.handle('webview-to-main', async (_, message) => {
    console.log('webview-to-main', message)
    if (controller) {
      return await controller.handleWebviewMessage(message)
    }
    return null
  })

  // 数据同步启停
  ipcMain.handle('data-sync:set-enabled', async (_evt, enabled: boolean) => {
    try {
      const uid = getCurrentUserId()
      if (!uid) {
        throw new Error('User ID is required')
      }

      if (enabled) {
        if (!dataSyncController) {
          const dbPath = getChatermDbPathForUser(uid)
          console.log(`为用户 ${uid} 启动数据同步服务...`)
          const instance = await startDataSync(dbPath)
          dataSyncController = instance
        }

        // 启用同步
        const syncStateManager = dataSyncController.getSyncStateManager()
        if (syncStateManager) {
          syncStateManager.enableSync(uid)
        }
      } else {
        // 禁用同步
        if (dataSyncController) {
          const syncStateManager = dataSyncController.getSyncStateManager()
          if (syncStateManager) {
            syncStateManager.disableSync()
          }

          console.log('停止数据同步服务...')
          await dataSyncController.destroy()
          dataSyncController = null
          console.log('数据同步服务已停止')
        }
      }
      return { success: true }
    } catch (e: any) {
      console.warn('处理 data-sync:set-enabled 失败:', e?.message || e)
      return { success: false, error: e?.message || String(e) }
    }
  })

  // 获取用户同步状态
  ipcMain.handle('data-sync:get-user-status', async () => {
    try {
      const uid = getCurrentUserId()
      if (!uid) {
        return { success: false, error: 'User ID is required' }
      }

      if (!dataSyncController) {
        return {
          success: true,
          data: {
            userId: uid,
            enabled: false,
            state: { state: 'disabled', enabled: false },
            hasController: false,
            fullSyncTimer: null
          }
        }
      }

      const syncStateManager = dataSyncController.getSyncStateManager()
      const syncStatus = syncStateManager ? syncStateManager.getCurrentStatus() : null

      // 获取全量同步定时器状态
      let fullSyncTimerStatus: any = null
      try {
        fullSyncTimerStatus = dataSyncController.getFullSyncTimerStatus()
      } catch (error) {
        console.warn('获取全量同步定时器状态失败:', error)
      }

      return {
        success: true,
        data: {
          userId: uid,
          enabled: syncStatus?.enabled || false,
          state: syncStatus,
          hasController: true,
          fullSyncTimer: fullSyncTimerStatus
        }
      }
    } catch (e: any) {
      console.warn('获取用户同步状态失败:', e?.message || e)
      return { success: false, error: e?.message || String(e) }
    }
  })

  // 立即执行全量同步
  ipcMain.handle('data-sync:full-sync-now', async () => {
    try {
      if (!dataSyncController) {
        return { success: false, error: 'Data sync controller not initialized' }
      }

      const result = await dataSyncController.fullSyncNow()
      return { success: result }
    } catch (e: any) {
      console.warn('手动全量同步失败:', e?.message || e)
      return { success: false, error: e?.message || String(e) }
    }
  })

  // 更新全量同步间隔
  ipcMain.handle('data-sync:update-full-sync-interval', async (_evt, intervalHours: number) => {
    try {
      if (!dataSyncController) {
        return { success: false, error: 'Data sync controller not initialized' }
      }

      if (intervalHours <= 0) {
        return { success: false, error: 'Interval must be greater than 0 hours' }
      }

      dataSyncController.updateFullSyncInterval(intervalHours)
      return { success: true }
    } catch (e: any) {
      console.warn('更新全量同步间隔失败:', e?.message || e)
      return { success: false, error: e?.message || String(e) }
    }
  })

  // Add message handler from main process to renderer process
  ipcMain.on('main-to-webview', (_, message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-to-webview', message)
    }
  })
  // Open browser window
  ipcMain.on('open-browser-window', (_, url) => {
    createBrowserWindow(url)
  })

  // Browser navigation control
  ipcMain.on('browser-go-back', () => {
    if (browserWindow && !browserWindow.isDestroyed() && browserWindow.webContents.canGoBack()) {
      browserWindow.webContents.goBack()
      // After navigation completes, the did-navigate event will be triggered, thus updating the navigation state
    }
  })

  ipcMain.on('browser-go-forward', () => {
    if (browserWindow && !browserWindow.isDestroyed() && browserWindow.webContents.canGoForward()) {
      browserWindow.webContents.goForward()
      // After navigation completes, the did-navigate event will be triggered, thus updating the navigation state
    }
  })

  ipcMain.on('browser-refresh', () => {
    if (browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.webContents.reload()
    }
  })

  // Handle SPA route changes
  ipcMain.on('spa-url-changed', (_, url) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('url-changed', url)
    }
  })

  ipcMain.handle('update-theme', (_, theme) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Update title bar color
      if (process.platform !== 'darwin') {
        mainWindow.setTitleBarOverlay({
          color: theme === 'dark' ? '#141414' : '#ffffff',
          symbolColor: theme === 'dark' ? '#ffffff' : '#141414',
          height: 27
        })
      }
      // Notify renderer process that theme has been updated
      mainWindow.webContents.send('theme-updated', theme)
      return true
    }
    return false
  })

  ipcMain.handle('main-window-init', async (_, theme) => {
    await winReady
    if (process.platform !== 'darwin') {
      mainWindow.setTitleBarOverlay({
        color: theme === 'dark' ? '#141414' : '#ffffff',
        symbolColor: theme === 'dark' ? '#ffffff' : '#141414',
        height: 27
      })
    }
  })

  ipcMain.handle('main-window-show', async () => {
    await winReady
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  })
}

// Initialize user database
ipcMain.handle('query-command', async (_, data) => {
  try {
    const { command, ip } = data
    const result = autoCompleteService.queryCommand(command, ip)
    return result
  } catch (error) {
    console.error('Query command failed:', error)
    return null
  }
})

ipcMain.handle('insert-command', async (_, data) => {
  try {
    const { command, ip } = data
    const result = autoCompleteService.insertCommand(command, ip)
    return result
  } catch (error) {
    console.error('Insert command failed:', error)
    return null
  }
})

// Chaterm database related IPC handlers
ipcMain.handle('asset-route-local-get', async (_, data) => {
  try {
    const { searchType, params } = data
    const result = chatermDbService.getLocalAssetRoute(searchType, params || [])
    return result
  } catch (error) {
    console.error('Chaterm query failed:', error)
    return null
  }
})

ipcMain.handle('asset-route-local-update', async (_, data) => {
  try {
    const { uuid, label } = data
    const result = chatermDbService.updateLocalAssetLabel(uuid, label)
    return result
  } catch (error) {
    console.error('Chaterm data modification failed:', error)
    return null
  }
})

ipcMain.handle('asset-route-local-favorite', async (_, data) => {
  try {
    const { uuid, status } = data
    const result = chatermDbService.updateLocalAsseFavorite(uuid, status)
    return result
  } catch (error) {
    console.error('Chaterm data modification failed:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-get', async () => {
  try {
    const result = chatermDbService.getKeyChainSelect()
    return result
  } catch (error) {
    console.error('Chaterm get data failed:', error)
    return null
  }
})

ipcMain.handle('asset-group-local-get', async () => {
  try {
    const result = chatermDbService.getAssetGroup()
    return result
  } catch (error) {
    console.error('Chaterm get data failed:', error)
    return null
  }
})

ipcMain.handle('asset-delete', async (_, data) => {
  try {
    const { uuid } = data
    const result = chatermDbService.deleteAsset(uuid)
    return result
  } catch (error) {
    console.error('Chaterm delete data failed:', error)
    return null
  }
})

ipcMain.handle('asset-create', async (_, data) => {
  try {
    const { form } = data
    const result = chatermDbService.createAsset(form)
    return result
  } catch (error) {
    console.error('Chaterm create asset failed:', error)
    return null
  }
})

ipcMain.handle('asset-update', async (_, data) => {
  try {
    const { form } = data
    const result = chatermDbService.updateAsset(form)
    return result
  } catch (error) {
    console.error('Chaterm update asset failed:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-get-list', async () => {
  try {
    const result = chatermDbService.getKeyChainList()
    return result
  } catch (error) {
    console.error('Chaterm get asset failed:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-create', async (_, data) => {
  try {
    const { form } = data
    const result = chatermDbService.createKeyChain(form)
    return result
  } catch (error) {
    console.error('Chaterm create keychain failed:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-delete', async (_, data) => {
  try {
    const { id } = data
    const result = chatermDbService.deleteKeyChain(id)
    return result
  } catch (error) {
    console.error('Chaterm delete keychain failed:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-get-info', async (_, data) => {
  try {
    const { id } = data
    const result = chatermDbService.getKeyChainInfo(id)
    return result
  } catch (error) {
    console.error('Chaterm get keychain failed:', error)
    return null
  }
})

ipcMain.handle('key-chain-local-update', async (_, data) => {
  try {
    const { form } = data
    const result = chatermDbService.updateKeyChain(form)
    return result
  } catch (error) {
    console.error('Chaterm update keychain failed:', error)
    return null
  }
})

ipcMain.handle('chaterm-connect-asset-info', async (_, data) => {
  try {
    const { uuid } = data
    const result = chatermDbService.connectAssetInfo(uuid)
    return result
  } catch (error) {
    console.error('Chaterm get asset info failed:', error)
    return null
  }
})

ipcMain.handle('agent-chaterm-messages', async (_, data) => {
  try {
    const { taskId } = data
    const result = chatermDbService.getSavedChatermMessages(taskId)
    return result
  } catch (error) {
    console.error('Chaterm get UI messages failed:', error)
    return null
  }
})

// This code is newly added to handle calls from the renderer process
ipcMain.handle('execute-remote-command', async () => {
  console.log('Received execute-remote-command IPC call') // Add log
  try {
    const output = await executeRemoteCommand()
    console.log('executeRemoteCommand output:', output) // Add log
    return { success: true, output }
  } catch (error) {
    console.error('Failed to execute remote command in main process:', error) // Modified log
    if (error instanceof Error) {
      return {
        success: false,
        error: { message: error.message, stack: error.stack, name: error.name }
      }
    }
    return { success: false, error: { message: 'An unknown error occurred in main process' } } // Modified log
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
    return { success: false, error: { message: 'Unknown error occurred' } }
  }
})

ipcMain.handle('get-user-hosts', async (_, data) => {
  try {
    const { search } = data
    const result = chatermDbService.getUserHosts(search)
    return result
  } catch (error) {
    console.error('Chaterm get user hosts list failed:', error)
    return null
  }
})

ipcMain.handle('user-snippet-operation', async (_, data) => {
  try {
    const { operation, params } = data
    const result = chatermDbService.userSnippetOperation(operation, params)
    return result
  } catch (error) {
    console.error('Chaterm user snippet operation failed:', error)
    return {
      code: 500,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
})

ipcMain.handle('validate-api-key', async (_, configuration) => {
  if (controller) {
    // If no configuration data is passed, return error
    if (!configuration) {
      return { isValid: false, error: 'No API configuration provided' }
    }
    return await controller.validateApiKey(configuration)
  }
  return { isValid: false, error: 'Controller not initialized' }
})

ipcMain.handle('refresh-organization-assets', async (event, data) => {
  try {
    const { organizationUuid, jumpServerConfig } = data

    // 生成唯一的连接ID用于二次验证
    const connectionId = `refresh-assets-${organizationUuid}-${Date.now()}`

    // 创建二次验证处理器，用于与渲染进程交互
    const keyboardInteractiveHandler = async (prompts: any[], finish: (responses: string[]) => void) => {
      return new Promise<void>((resolve, reject) => {
        // 发送二次验证请求到渲染进程
        event.sender.send('ssh:keyboard-interactive-request', {
          id: connectionId,
          prompts: prompts.map((p) => p.prompt)
        })

        // 设置超时
        const timeoutId = setTimeout(() => {
          ipcMain.removeAllListeners(`ssh:keyboard-interactive-response:${connectionId}`)
          ipcMain.removeAllListeners(`ssh:keyboard-interactive-cancel:${connectionId}`)
          finish([])
          event.sender.send('ssh:keyboard-interactive-timeout', { id: connectionId })
          reject(new Error('二次验证超时'))
        }, 30000) // 30秒超时

        // 监听用户响应
        ipcMain.once(`ssh:keyboard-interactive-response:${connectionId}`, (_evt, responses) => {
          clearTimeout(timeoutId)
          finish(responses)
          resolve() // 立即 resolve，验证结果会通过 authResultCallback 处理
        })

        // 监听用户取消
        ipcMain.once(`ssh:keyboard-interactive-cancel:${connectionId}`, () => {
          clearTimeout(timeoutId)
          finish([])
          reject(new Error('用户取消了二次验证'))
        })
      })
    }

    // 创建验证结果回调
    const authResultCallback = (success: boolean, error?: string) => {
      console.log('主进程: authResultCallback 被调用，success:', success, 'error:', error)
      if (success) {
        console.log('主进程: 二次验证成功，发送成功事件到前端')
        event.sender.send('ssh:keyboard-interactive-result', { id: connectionId, status: 'success' })
      } else {
        console.log('主进程: 二次验证失败，发送失败事件到前端', error)
        event.sender.send('ssh:keyboard-interactive-result', { id: connectionId, status: 'failed' })
      }
    }

    const result = await chatermDbService.refreshOrganizationAssetsWithAuth(
      organizationUuid,
      jumpServerConfig,
      keyboardInteractiveHandler,
      authResultCallback
    )
    return result
  } catch (error) {
    console.error('刷新企业资产失败:', error)
    return { data: { message: 'failed', error: error instanceof Error ? error.message : String(error) } }
  }
})

ipcMain.handle('organization-asset-favorite', async (_, data) => {
  try {
    const { organizationUuid, host, status } = data

    if (!organizationUuid || !host || status === undefined) {
      console.error('参数不完整:', { organizationUuid, host, status })
      return { data: { message: 'failed', error: '参数不完整' } }
    }

    const result = chatermDbService.updateOrganizationAssetFavorite(organizationUuid, host, status)
    return result
  } catch (error) {
    console.error('主进程 organization-asset-favorite 错误:', error)
    return { data: { message: 'failed', error: error instanceof Error ? error.message : String(error) } }
  }
})

ipcMain.handle('organization-asset-comment', async (_, data) => {
  try {
    const { organizationUuid, host, comment } = data

    if (!organizationUuid || !host) {
      console.error('参数不完整:', { organizationUuid, host, comment })
      return { data: { message: 'failed', error: '参数不完整' } }
    }

    const result = chatermDbService.updateOrganizationAssetComment(organizationUuid, host, comment || '')
    return result
  } catch (error) {
    console.error('主进程 organization-asset-comment 错误:', error)
    return { data: { message: 'failed', error: error instanceof Error ? error.message : String(error) } }
  }
})

// 自定义文件夹管理IPC处理器
ipcMain.handle('create-custom-folder', async (_, data) => {
  try {
    const { name, description } = data

    if (!name) {
      console.error('参数不完整:', { name, description })
      return { data: { message: 'failed', error: '文件夹名称不能为空' } }
    }

    const result = chatermDbService.createCustomFolder(name, description)
    return result
  } catch (error) {
    console.error('主进程 create-custom-folder 错误:', error)
    return { data: { message: 'failed', error: error instanceof Error ? error.message : String(error) } }
  }
})

ipcMain.handle('get-custom-folders', async () => {
  try {
    const result = chatermDbService.getCustomFolders()
    return result
  } catch (error) {
    console.error('主进程 get-custom-folders 错误:', error)
    return { data: { message: 'failed', error: error instanceof Error ? error.message : String(error) } }
  }
})

ipcMain.handle('update-custom-folder', async (_, data) => {
  try {
    const { folderUuid, name, description } = data

    if (!folderUuid || !name) {
      console.error('参数不完整:', { folderUuid, name, description })
      return { data: { message: 'failed', error: '文件夹UUID和名称不能为空' } }
    }

    const result = chatermDbService.updateCustomFolder(folderUuid, name, description)
    return result
  } catch (error) {
    console.error('主进程 update-custom-folder 错误:', error)
    return { data: { message: 'failed', error: error instanceof Error ? error.message : String(error) } }
  }
})

ipcMain.handle('delete-custom-folder', async (_, data) => {
  try {
    const { folderUuid } = data

    if (!folderUuid) {
      console.error('参数不完整:', { folderUuid })
      return { data: { message: 'failed', error: '文件夹UUID不能为空' } }
    }

    const result = chatermDbService.deleteCustomFolder(folderUuid)
    return result
  } catch (error) {
    console.error('主进程 delete-custom-folder 错误:', error)
    return { data: { message: 'failed', error: error instanceof Error ? error.message : String(error) } }
  }
})

ipcMain.handle('move-asset-to-folder', async (_, data) => {
  try {
    const { folderUuid, organizationUuid, assetHost } = data

    if (!folderUuid || !organizationUuid || !assetHost) {
      console.error('参数不完整:', { folderUuid, organizationUuid, assetHost })
      return { data: { message: 'failed', error: '参数不完整' } }
    }

    const result = chatermDbService.moveAssetToFolder(folderUuid, organizationUuid, assetHost)
    return result
  } catch (error) {
    console.error('主进程 move-asset-to-folder 错误:', error)
    return { data: { message: 'failed', error: error instanceof Error ? error.message : String(error) } }
  }
})

ipcMain.handle('remove-asset-from-folder', async (_, data) => {
  try {
    const { folderUuid, organizationUuid, assetHost } = data

    if (!folderUuid || !organizationUuid || !assetHost) {
      console.error('参数不完整:', { folderUuid, organizationUuid, assetHost })
      return { data: { message: 'failed', error: '参数不完整' } }
    }

    const result = chatermDbService.removeAssetFromFolder(folderUuid, organizationUuid, assetHost)
    return result
  } catch (error) {
    console.error('主进程 remove-asset-from-folder 错误:', error)
    return { data: { message: 'failed', error: error instanceof Error ? error.message : String(error) } }
  }
})

ipcMain.handle('get-assets-in-folder', async (_, data) => {
  try {
    const { folderUuid } = data

    if (!folderUuid) {
      console.error('参数不完整:', { folderUuid })
      return { data: { message: 'failed', error: '文件夹UUID不能为空' } }
    }

    const result = chatermDbService.getAssetsInFolder(folderUuid)
    return result
  } catch (error) {
    console.error('主进程 get-assets-in-folder 错误:', error)
    return { data: { message: 'failed', error: error instanceof Error ? error.message : String(error) } }
  }
})

ipcMain.handle('capture-telemetry-event', async (_, { eventType, data }) => {
  try {
    switch (eventType) {
      case 'button_click':
        const taskId = controller?.task?.taskId
        telemetryService.captureButtonClick(data.button, taskId, data.properties)
        break
      default:
        console.warn('Unknown telemetry event type:', eventType)
    }
    return { success: true }
  } catch (error) {
    console.error('Failed to capture telemetry event:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// Register the agreement before the app is ready
if (!app.isDefaultProtocolClient('chaterm')) {
  app.setAsDefaultProtocolClient('chaterm')
}

// Linux 下处理 chaterm:// 协议参数
if (process.platform === 'linux') {
  // 为 Linux 平台实现单实例锁，确保只有一个应用实例运行
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    // 如果无法获取锁，说明已经有一个实例在运行，退出当前实例
    app.quit()
  } else {
    // 监听第二个实例的启动
    app.on('second-instance', (_event, commandLine, _workingDirectory) => {
      // 有人试图运行第二个实例，我们应该聚焦到我们的窗口
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }

      // 处理协议 URL
      const protocolUrl = commandLine.find((arg) => arg.startsWith('chaterm://'))
      if (protocolUrl) {
        handleProtocolRedirect(protocolUrl)
      }
    })
  }

  // 处理应用启动时的协议参数
  const protocolArg = process.argv.find((arg) => arg.startsWith('chaterm://'))
  if (protocolArg) {
    app.whenReady().then(() => {
      handleProtocolRedirect(protocolArg)
    })
  }

  // 为 Linux 添加额外的 IPC 处理程序，用于处理应用运行过程中的协议调用
  ipcMain.handle('handle-protocol-url', async (_, url) => {
    if (url && url.startsWith('chaterm://')) {
      handleProtocolRedirect(url)
      return { success: true }
    }
    return { success: false, error: 'Invalid protocol URL' }
  })
}

// Process protocol redirection
const handleProtocolRedirect = async (url: string) => {
  // 获取主窗口
  let targetWindow = BrowserWindow.getAllWindows()[0]

  // 在 Linux 平台上，尝试找到发起登录的原始窗口
  if (process.platform === 'linux') {
    try {
      // 尝试从 cookie 中获取原始窗口 ID
      const authStateCookie = await session.defaultSession.cookies.get({
        url: COOKIE_URL,
        name: 'chaterm_auth_state'
      })

      if (authStateCookie && authStateCookie.length > 0) {
        const authState = JSON.parse(authStateCookie[0].value)
        const originalWindowId = authState.windowId

        // 尝试找到原始窗口
        const originalWindow = BrowserWindow.fromId(originalWindowId)
        if (originalWindow && !originalWindow.isDestroyed()) {
          targetWindow = originalWindow
          console.log('找到原始窗口，ID:', originalWindowId)

          // 清除认证状态 cookie
          await session.defaultSession.cookies.remove(COOKIE_URL, 'chaterm_auth_state')
        }
      }
    } catch (error) {
      console.error('获取原始窗口失败:', error)
    }
  }

  if (!targetWindow) {
    console.error('找不到可用窗口来处理协议重定向')
    return
  }

  // 解析 URL 中的令牌和用户信息
  const urlObj = new URL(url)
  const userInfo = urlObj.searchParams.get('userInfo')
  const method = urlObj.searchParams.get('method')

  if (userInfo) {
    try {
      // 将数据发送到渲染进程
      targetWindow.webContents.send('external-login-success', {
        userInfo: JSON.parse(userInfo),
        method: method
      })

      // 确保窗口可见并聚焦
      if (targetWindow.isMinimized()) {
        targetWindow.restore()
      }
      targetWindow.focus()

      // 外部登录成功后，检查是否需要重启数据同步服务
      // 注意：这里我们不能直接获取用户ID，因为渲染进程还没有处理完登录逻辑
      // 所以我们在渲染进程处理完登录后，通过init-user-database来处理数据同步重启
      console.log('外部登录成功，等待渲染进程处理用户初始化...')
    } catch (error) {
      console.error('处理外部登录数据失败:', error)
    }
  }
}

// Activation of Processing Protocol in Windows
if (process.platform === 'win32') {
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    app.quit()
  } else {
    app.on('second-instance', (_event, commandLine) => {
      // Someone is trying to run the second instance, we should focus on our window
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }

      // Processing Protocol URL
      const url = commandLine.pop()
      if (url && url.startsWith('chaterm://')) {
        handleProtocolRedirect(url)
      }
    })
  }
}

// Protocol Activation in macOS Processing
app.on('open-url', (_event, url) => {
  if (url.startsWith('chaterm://')) {
    handleProtocolRedirect(url)
  }
})

// Add IPC handler after creating Window function
ipcMain.handle('open-external-login', async () => {
  try {
    // Generate a random state value for security verification
    const state = Math.random().toString(36).substring(2)
    // Store status values for subsequent verification
    global.authState = state

    // 检测IP地址并选择合适的登录URL
    const isMainlandChinaIpAddress = global.ipDetectionCache?.isMainlandChina ?? true

    // 获取MAC地址
    const macAddress = getMacAddress()

    // 根据IP地址选择不同的登录URL
    let externalLoginUrl
    if (isMainlandChinaIpAddress) {
      // 中国大陆IP使用国内服务器
      externalLoginUrl = `https://chaterm.intsig.net/login?client_id=chaterm&state=${state}&redirect_uri=chaterm://auth/callback&mac_address=${encodeURIComponent(macAddress)}`
    } else {
      // 非中国大陆IP使用国际服务器
      externalLoginUrl = `https://login.chaterm.ai/login?client_id=chaterm&state=${state}&redirect_uri=chaterm://auth/callback&mac_address=${encodeURIComponent(macAddress)}`
    }
    // externalLoginUrl = `http://127.0.0.1:5174/login?client_id=chaterm&state=${state}&redirect_uri=chaterm://auth/callback&mac_address=${encodeURIComponent(macAddress)}`

    // 在 Linux 平台上，将状态保存到本地存储，以便新实例可以访问
    if (process.platform === 'linux') {
      try {
        // 保存当前窗口 ID，以便回调时可以找到正确的窗口
        const windowId = mainWindow.id
        await session.defaultSession.cookies.set({
          url: COOKIE_URL,
          name: 'chaterm_auth_state',
          value: JSON.stringify({ state, windowId }),
          expirationDate: Date.now() / 1000 + 600 // 10分钟过期
        })
      } catch (error) {
        console.error('Failed to save auth state:', error)
      }
    }

    // 打开外部登录页面
    await shell.openExternal(externalLoginUrl)
    return { success: true }
  } catch (error) {
    console.error('Failed to open external login page:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// 全局类型声明
declare global {
  namespace NodeJS {
    interface Global {
      authState: string
      ipDetectionCache:
        | {
            isMainlandChina: boolean
            timestamp: number
          }
        | undefined
    }
  }
}

// IP检测相关的类型定义
interface IPDetectionResponse {
  status: string
  country: string
  countryCode: string
  region: string
  regionName: string
  city: string
  query: string
  isp: string
}

// IP检测函数
async function detectIPLocation(): Promise<boolean> {
  try {
    // 获取系统代理设置
    const proxySettings = await session.defaultSession.resolveProxy('https://api.ipify.org')
    console.log('[IP检测] 系统代理设置:', proxySettings)

    // 配置axios代理
    let axiosConfig: any = {
      timeout: 2000, // 增加超时时间到2秒
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    }

    // 如果系统有代理设置，配置axios使用代理
    if (proxySettings && proxySettings !== 'DIRECT') {
      let proxyConfig: any = {}

      if (proxySettings.startsWith('PROXY ')) {
        // HTTP代理
        const proxyUrl = proxySettings.replace('PROXY ', '')
        const [host, port] = proxyUrl.split(':')
        proxyConfig = {
          host: host,
          port: parseInt(port) || 80,
          protocol: 'http'
        }
      } else if (proxySettings.startsWith('SOCKS ')) {
        // SOCKS代理
        const proxyUrl = proxySettings.replace('SOCKS ', '')
        const [host, port] = proxyUrl.split(':')
        proxyConfig = {
          host: host,
          port: parseInt(port) || 1080,
          protocol: 'socks'
        }
      } else if (proxySettings.startsWith('HTTPS ')) {
        // HTTPS代理
        const proxyUrl = proxySettings.replace('HTTPS ', '')
        const [host, port] = proxyUrl.split(':')
        proxyConfig = {
          host: host,
          port: parseInt(port) || 443,
          protocol: 'https'
        }
      }

      if (Object.keys(proxyConfig).length > 0) {
        axiosConfig.proxy = proxyConfig
        console.log('[IP检测] 使用系统代理:', proxyConfig)
      }
    }

    // 尝试多个IP检测服务
    let clientIP: string | null = null

    // 定义多个IP检测服务
    const ipServices = [
      {
        name: 'icanhazip',
        url: 'https://icanhazip.com',
        extract: (data: any) => data.trim()
      },
      {
        name: 'httpbin',
        url: 'https://httpbin.org/ip',
        extract: (data: any) => data.origin
      },
      {
        name: 'ipify',
        url: 'https://api.ipify.org?format=json',
        extract: (data: any) => data.ip
      },
      {
        name: 'ip-api',
        url: 'http://ip-api.com/json',
        extract: (data: any) => data.query
      },
      {
        name: 'ipinfo',
        url: 'https://ipinfo.io/json',
        extract: (data: any) => data.ip
      }
    ]

    // 依次尝试每个服务
    for (const service of ipServices) {
      try {
        console.log(`[IP检测] 尝试服务: ${service.name}`)
        const response = await axios.get(service.url, axiosConfig)
        clientIP = service.extract(response.data)
        console.log(`[IP检测] ${service.name} 获取到IP地址:`, clientIP)
        break // 成功获取后跳出循环
      } catch (error) {
        console.warn(`[IP检测] ${service.name} 服务失败:`, error instanceof Error ? error.message : 'Unknown error')
      }
    }

    if (!clientIP) {
      console.error('[IP检测] 所有IP服务都失败')
      throw new Error('无法获取公网IP地址')
    }

    // 使用ip-api.com检测IP位置
    const ipDetectionResponseOrigin = await axios.get<IPDetectionResponse>(`http://ip-api.com/json/${clientIP}`, {
      timeout: 2000, // 2秒超时
      proxy: axiosConfig.proxy // 使用相同的代理设置
    })
    const ipDetectionResponse = ipDetectionResponseOrigin.data
    if (ipDetectionResponse.status === 'success') {
      // 判断是否为中国大陆（排除台湾、香港、澳门）
      const isMainlandChina =
        ipDetectionResponse.countryCode === 'CN' &&
        ipDetectionResponse.country === 'China' &&
        !['Taiwan', 'Hong Kong', 'Macao'].includes(ipDetectionResponse.regionName)
      console.log('[IP检测] 检测结果:', {
        ip: ipDetectionResponse.query,
        country: ipDetectionResponse.country,
        countryCode: ipDetectionResponse.countryCode,
        region: ipDetectionResponse.regionName,
        city: ipDetectionResponse.city,
        isp: ipDetectionResponse.isp,
        isMainlandChina: isMainlandChina
      })

      return isMainlandChina
    } else {
      console.warn('[IP检测] API返回错误')
      // 如果API失败，默认返回true
      return true
    }
  } catch (error) {
    console.error('[IP检测] 检测失败:', error)
    // 如果检测失败，默认返回true
    return true
  }
}
