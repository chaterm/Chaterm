import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { is } from '@electron-toolkit/utils'

// Set environment variables
process.env.IS_DEV = is.dev ? 'true' : 'false'

// 修正开发环境下通过 chaterm:// 协议启动时参数错乱的问题
if (process.env.IS_DEV === 'true' && process.argv[1] && process.argv[1].startsWith('chaterm://')) {
  const protocolArg = process.argv[1]
  process.argv.splice(1, 1)
  process.argv.push(protocolArg)
}

import { registerSSHHandlers } from './ssh/sshHandle'
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
import { telemetryService, checkIsFirstLaunch } from './agent/services/telemetry/TelemetryService'

let mainWindow: BrowserWindow
let COOKIE_URL = 'http://localhost'
let browserWindow: BrowserWindow | null = null
let lastWidth: number = 1344 // Default window width
let lastHeight: number = 756 // Default window height
let forceQuit = false

let autoCompleteService: autoCompleteDatabaseService
let chatermDbService: ChatermDatabaseService
let controller: Controller

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

  // Initialize storage system
  initializeStorageMain(mainWindow)

  // Register SSH components
  registerSSHHandlers()
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
      setCurrentUserId(targetUserId)
      chatermDbService = await ChatermDatabaseService.getInstance(targetUserId)
      autoCompleteService = await autoCompleteDatabaseService.getInstance(targetUserId)
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
  // Add message handler from renderer process to main process
  ipcMain.handle('webview-to-main', async (_, message) => {
    console.log('webview-to-main', message)
    if (controller) {
      return await controller.handleWebviewMessage(message)
    }
    return null
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
  const protocolArg = process.argv.find((arg) => arg.startsWith('chaterm://'))
  if (protocolArg) {
    app.whenReady().then(() => {
      handleProtocolRedirect(protocolArg)
    })
  }
}

// Process protocol redirection
const handleProtocolRedirect = (url: string) => {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (!mainWindow) return

  // Parse the token and user information in the URL
  const urlObj = new URL(url)
  const userInfo = urlObj.searchParams.get('userInfo')
  const method = urlObj.searchParams.get('method')
  if (userInfo) {
    try {
      // Send data to the rendering process
      mainWindow.webContents.send('external-login-success', {
        userInfo: JSON.parse(userInfo),
        method: method
      })
    } catch (error) {
      console.error('Failed to process external login data:', error)
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
    // Replace here with your external login URL, which needs to include information about redirecting back to the application
    const externalLoginUrl = `https://login.chaterm.ai/login?client_id=chaterm&state=${state}&redirect_uri=chaterm://auth/callback`
    await shell.openExternal(externalLoginUrl)
    return { success: true }
  } catch (error: any) {
    console.error('Failed to open external login page:', error)
    return { success: false, error: error.message }
  }
})
