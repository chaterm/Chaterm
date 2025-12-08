import { app, shell, BrowserWindow, ipcMain, session, net, protocol } from 'electron'
import path, { join } from 'path'
import { electronApp } from '@electron-toolkit/utils'
import { is } from '@electron-toolkit/utils'
import axios from 'axios'
import * as fs from 'fs/promises'
import { startDataSync } from './storage/data_sync/index'
import type { SyncController as DataSyncController } from './storage/data_sync/core/SyncController'
import { getChatermDbPathForUser, getCurrentUserId, setMainWindowWebContents } from './storage/db/connection'

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
import { versionPromptService } from './version/versionPromptService'

import * as fsSync from 'fs'
import { pathToFileURL } from 'url'
import { loadAllPlugins } from './plugin/pluginLoader'
import { installPlugin, listPlugins, PluginManifest, uninstallPlugin, getAllPluginVersions } from './plugin/pluginManager'
import { getPluginDetailsByName } from './plugin/pluginDetails'
import { getActualTheme, applyThemeToTitleBar, loadUserTheme } from './themeManager'

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
  setMainWindowWebContents(mainWindow.webContents)
}

// Send request to renderer process and wait for response
export async function getUserConfigFromRenderer(): Promise<any> {
  if (!mainWindow) throw new Error('mainWindow not ready')

  const wc = mainWindow.webContents

  // Wait for renderer process to load
  if (wc.isLoadingMainFrame()) {
    await new Promise<void>((resolve) => wc.once('did-finish-load', () => resolve()))
  }

  return new Promise((resolve, reject) => {
    const responseHandler = (_event: Electron.IpcMainEvent, config: any) => {
      cleanup()
      resolve(config)
    }

    const errorHandler = (_event: Electron.IpcMainEvent, errMsg: string) => {
      cleanup()
      reject(new Error(errMsg))
    }

    const cleanup = () => {
      ipcMain.removeListener('userConfig:get-response', responseHandler)
      ipcMain.removeListener('userConfig:get-error', errorHandler)
    }

    ipcMain.on('userConfig:get-response', responseHandler)
    ipcMain.on('userConfig:get-error', errorHandler)

    console.log('Main process sending userConfig:get to renderer process')
    wc.send('userConfig:get')
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  if (process.platform === 'darwin') {
    app.dock.setIcon(join(__dirname, '../../resources/icon.png'))
  }

  protocol.handle('local-resource', (request) => {
    let filePath = request.url.slice('local-resource://'.length)
    filePath = decodeURIComponent(filePath)

    if (filePath.length >= 2 && /[A-Z]/.test(filePath[0]) && filePath[1] === '/') {
      filePath = filePath[0] + ':' + filePath.slice(1)
    } else if (process.platform !== 'win32' && !filePath.startsWith('/') && !filePath.includes(':')) {
      if (filePath.startsWith('Users/') || filePath.startsWith('home/') || filePath.startsWith('var/') || filePath.startsWith('opt/')) {
        filePath = '/' + filePath
      }
    }

    try {
      const fileUrl = pathToFileURL(filePath).toString()
      return net.fetch(fileUrl)
    } catch (error) {
      console.error('Error in local-resource handler:', error)
      return new Response('File Not Found', { status: 404 })
    }
  })

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

    // Create a message sender that routes messages to dedicated IPC channels
    const messageSender = (message) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Route commandGenerationResponse to its dedicated channel
        if (message.type === 'commandGenerationResponse') {
          mainWindow.webContents.send('command-generation-response', {
            command: message.command,
            error: message.error,
            tabId: message.tabId
          })
          return Promise.resolve(true)
        }

        // Route mcpServersUpdate to its dedicated channel for backward compatibility
        if (message.type === 'mcpServersUpdate') {
          mainWindow.webContents.send('mcp:status-update', message.mcpServers)
          return Promise.resolve(true)
        }

        // Route mcpServerUpdate (singular) to its dedicated channel for granular updates
        if (message.type === 'mcpServerUpdate') {
          mainWindow.webContents.send('mcp:server-update', message.mcpServer)
          return Promise.resolve(true)
        }

        // Route mcpConfigFileChanged to its dedicated channel
        if (message.type === 'mcpConfigFileChanged') {
          mainWindow.webContents.send('mcp:config-file-changed', message.content)
          return Promise.resolve(true)
        }

        // Default: send to the general channel for other message types
        mainWindow.webContents.send('main-to-webview', message)
        return Promise.resolve(true)
      }
      return Promise.resolve(false)
    }

    controller = new Controller(context, outputChannel, messageSender, ensureMcpConfigFileExists)
  } catch (error) {
    console.error('Failed to initialize Controller:', error)
  }

  // Initialize security configuration on startup
  try {
    const SecurityConfigModule = await import('./agent/core/security/SecurityConfig')
    const { SecurityConfigManager } = SecurityConfigModule
    const securityManager = new SecurityConfigManager()

    // Ensure security config file exists on startup
    await securityManager.loadConfig()
    console.log('Security configuration initialized successfully')
  } catch (error) {
    console.error('Failed to initialize security configuration:', error)
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

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isExternal = !url.startsWith('http://localhost') && !url.startsWith('file://') && !url.startsWith('chaterm://')

    if (isExternal) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

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

/**
 * Ensure MCP configuration file exists, create with default config if not
 * @returns Promise<string> - The absolute path to the MCP configuration file
 */
export async function ensureMcpConfigFileExists(): Promise<string> {
  const configPath = join(app.getPath('userData'), 'setting', 'mcp_settings.json')
  const configDir = join(app.getPath('userData'), 'setting')

  try {
    // Ensure directory exists
    await fs.mkdir(configDir, { recursive: true })

    // Check if file exists
    try {
      await fs.access(configPath)
    } catch (error: any) {
      // File doesn't exist, create with default configuration
      if (error.code === 'ENOENT') {
        const defaultConfig = {
          mcpServers: {}
        }
        await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8')
        console.log('[MCP] Created default configuration file at:', configPath)
      } else {
        throw error
      }
    }

    return configPath
  } catch (error) {
    console.error('[MCP] Failed to ensure config file exists:', error)
    throw error
  }
}

// MCP configuration file path
ipcMain.handle('mcp:get-config-path', async () => {
  return await ensureMcpConfigFileExists()
})

// Get initial MCP server list
ipcMain.handle('mcp:get-servers', async () => {
  try {
    if (controller && controller.mcpHub) {
      return controller.mcpHub.getAllServers()
    }
    return []
  } catch (error) {
    console.error('Failed to get MCP servers:', error)
    return []
  }
})

// Toggle MCP server disabled state
ipcMain.handle('toggle-mcp-server', async (_event, serverName: string, disabled: boolean) => {
  try {
    if (controller && controller.mcpHub) {
      await controller.mcpHub.toggleServerDisabled(serverName, disabled)
    } else {
      throw new Error('Controller or McpHub not initialized')
    }
  } catch (error) {
    console.error('Failed to toggle MCP server:', error)
    throw error
  }
})

// Delete MCP server
ipcMain.handle('delete-mcp-server', async (_event, serverName: string) => {
  try {
    if (controller && controller.mcpHub) {
      await controller.mcpHub.deleteServer(serverName)
    } else {
      throw new Error('Controller or McpHub not initialized')
    }
  } catch (error) {
    console.error('Failed to delete MCP server:', error)
    throw error
  }
})

// MCP tool state management
ipcMain.handle('mcp:get-tool-state', async (_event, serverName: string, toolName: string) => {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    return dbService.getMcpToolState(serverName, toolName)
  } catch (error) {
    console.error('Failed to get MCP tool state:', error)
    throw error
  }
})

ipcMain.handle('mcp:set-tool-state', async (_event, serverName: string, toolName: string, enabled: boolean) => {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    dbService.setMcpToolState(serverName, toolName, enabled)
  } catch (error) {
    console.error('Failed to set MCP tool state:', error)
    throw error
  }
})

ipcMain.handle('mcp:set-tool-auto-approve', async (_event, serverName: string, toolName: string, autoApprove: boolean) => {
  try {
    if (controller && controller.mcpHub) {
      await controller.mcpHub.toggleToolAutoApprove(serverName, [toolName], autoApprove)
    } else {
      throw new Error('Controller or McpHub not initialized')
    }
  } catch (error) {
    console.error('Failed to set MCP tool auto-approve:', error)
    throw error
  }
})

ipcMain.handle('mcp:get-all-tool-states', async () => {
  try {
    const dbService = await ChatermDatabaseService.getInstance()
    return dbService.getAllMcpToolStates()
  } catch (error) {
    console.error('Failed to get all MCP tool states:', error)
    throw error
  }
})

// Execute IP detection asynchronously
ipcMain.handle('detect-ip-location', async () => {
  try {
    const isMainlandChina = await detectIPLocation()

    // Cache detection result, valid for 24 hours
    global.ipDetectionCache = {
      isMainlandChina,
      timestamp: Date.now()
    }

    return { success: true, isMainlandChina }
  } catch (error) {
    console.error('[Main Process] IP detection failed:', error)
    // Set default value
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

ipcMain.handle('dialog:openFile', async (event, options) => {
  const { dialog } = require('electron')
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), options)
  return result
})

ipcMain.handle('saveCustomBackground', async (_, sourcePath: string) => {
  try {
    const fs = require('fs/promises')
    const path = require('path')
    const userDataPath = app.getPath('userData')
    const targetDir = path.join(userDataPath, 'backgrounds')

    // Ensure directory exists
    await fs.mkdir(targetDir, { recursive: true })

    const ext = path.extname(sourcePath)
    const fileName = `custom_bg${ext}`
    const targetPath = path.join(targetDir, fileName)

    // Remove any existing custom_bg files to avoid conflicts (e.g. different extensions)
    try {
      const files = await fs.readdir(targetDir)
      for (const file of files) {
        if (file.startsWith('custom_bg')) {
          await fs.unlink(path.join(targetDir, file))
        }
      }
    } catch (e) {
      // Ignore error if directory reading fails (though we just created it)
    }

    await fs.copyFile(sourcePath, targetPath)

    return { success: true, path: targetPath, fileName }
  } catch (error) {
    console.error('Failed to save custom background:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
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

      // Check if user switch occurred (user ID changed)
      const previousUserId = getCurrentUserId()
      const isUserSwitch = previousUserId && previousUserId !== targetUserId

      setCurrentUserId(targetUserId)
      chatermDbService = await ChatermDatabaseService.getInstance(targetUserId)
      autoCompleteService = await autoCompleteDatabaseService.getInstance(targetUserId)

      // Load and apply user theme configuration
      const dbTheme = await loadUserTheme(chatermDbService)
      if (dbTheme) {
        applyThemeToTitleBar(mainWindow, dbTheme)
      }

      // Sync authentication info, ensure completion before data sync starts
      try {
        // Get user authentication info and set it to encryption service
        const ctmToken = await event.sender.executeJavaScript("localStorage.getItem('ctm-token')")
        if (ctmToken && ctmToken !== 'guest_token') {
          console.log(`Setting authentication info for user ${targetUserId}...`)
          envelopeEncryptionService.setAuthInfo(ctmToken, targetUserId.toString())
          console.log(`Authentication info set completed for user ${targetUserId}`)
        } else {
          console.warn(`No valid authentication token found for user ${targetUserId}`)
        }

        // User switch completed, data sync will be re-initialized by renderer process
        if (isUserSwitch) {
          console.log(`User switch detected: ${previousUserId} -> ${targetUserId}, data sync will be handled by renderer process`)
        }
      } catch (error) {
        console.warn('Exception setting authentication info:', error)
        if (isUserSwitch) {
          console.log(`Authentication info setting failed, user switch: ${previousUserId} -> ${targetUserId}`)
        }
      }

      return { success: true, theme: dbTheme }
    } catch (error) {
      console.error('Database initialization failed:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  })

  // ==================== IndexedDB Migration Related IPC Handlers ====================

  // Handler 1: Migration status query
  ipcMain.handle('db:migration:status', async (_event, params: { dataSource?: string }) => {
    try {
      const userId = getCurrentUserId()
      if (!userId) {
        throw new Error('User not logged in')
      }

      const db = await ChatermDatabaseService.getInstance(userId)

      if (params?.dataSource) {
        return db.getMigrationStatus(params.dataSource)
      } else {
        return db.getAllMigrationStatus()
      }
    } catch (error) {
      console.error('db:migration:status error:', error)
      throw error
    }
  })

  // Handler 2: Alias query
  ipcMain.handle('db:aliases:query', async (_event, params: { action: string; searchText?: string; alias?: string }) => {
    try {
      const userId = getCurrentUserId()
      if (!userId) {
        throw new Error('User not logged in')
      }

      // Parameter validation
      if (!['getAll', 'search', 'getByAlias'].includes(params.action)) {
        throw new Error('Invalid action type')
      }

      if (params.action === 'search' && !params.searchText) {
        throw new Error('search action requires searchText parameter')
      }

      if (params.action === 'getByAlias' && !params.alias) {
        throw new Error('getByAlias action requires alias parameter')
      }

      const db = await ChatermDatabaseService.getInstance(userId)

      switch (params.action) {
        case 'getAll':
          return db.getAliases()
        case 'search':
          return db.searchAliases(params.searchText!)
        case 'getByAlias': {
          const result = db.getAliasByName(params.alias!)
          return result ? [result] : []
        }
        default:
          throw new Error('Invalid action')
      }
    } catch (error) {
      console.error('db:aliases:query error:', error)
      throw error
    }
  })

  // Handler 3: Alias mutation
  ipcMain.handle('db:aliases:mutate', async (_event, params: { action: string; data?: any; alias?: string }) => {
    try {
      const userId = getCurrentUserId()
      if (!userId) {
        throw new Error('User not logged in')
      }

      // Parameter validation
      if (!['save', 'delete'].includes(params.action)) {
        throw new Error('Invalid action type')
      }

      if (params.action === 'save' && !params.data) {
        throw new Error('save action requires data parameter')
      }

      if (params.action === 'delete' && !params.alias) {
        throw new Error('delete action requires alias parameter')
      }

      const db = await ChatermDatabaseService.getInstance(userId)

      switch (params.action) {
        case 'save':
          return db.saveAlias(params.data)
        case 'delete':
          return db.deleteAlias(params.alias!)
        default:
          throw new Error('Invalid action')
      }
    } catch (error) {
      console.error('db:aliases:mutate error:', error)
      throw error
    }
  })

  // Handler 4: KV read
  ipcMain.handle('db:kv:get', async (_event, params: { key?: string }) => {
    try {
      let userId = getCurrentUserId()

      if (!userId) {
        userId = getGuestUserId()
      }

      const db = await ChatermDatabaseService.getInstance(userId)

      if (params?.key) {
        const row = db.getKeyValue(params.key)
        if (row && row.value) {
          // Use safeParse to deserialize superjson formatted data
          const { safeParse } = await import('./storage/db/json-serializer')
          const parsedValue = await safeParse(row.value)
          return { ...row, value: JSON.stringify(parsedValue) }
        }
        return row
      } else {
        return db.getAllKeys()
      }
    } catch (error) {
      console.error('db:kv:get error:', error)
      throw error
    }
  })

  // Handler 5: KV mutation
  ipcMain.handle('db:kv:mutate', async (_event, params: { action: string; key: string; value?: string }) => {
    try {
      let userId = getCurrentUserId()

      if (!userId) {
        userId = getGuestUserId()
      }

      // Parameter validation
      if (!['set', 'delete'].includes(params.action)) {
        throw new Error('Invalid action type')
      }

      if (!params.key) {
        throw new Error('key parameter is required')
      }

      if (params.action === 'set' && params.value === undefined) {
        throw new Error('set action requires value parameter')
      }

      const db = await ChatermDatabaseService.getInstance(userId)

      switch (params.action) {
        case 'set': {
          // First parse JSON string into object
          const valueObj = JSON.parse(params.value!)
          // Use safeStringify to serialize into superjson format
          const { safeStringify } = await import('./storage/db/json-serializer')
          const result = await safeStringify(valueObj)
          if (!result.success) {
            throw new Error(`Failed to serialize value: ${result.error}`)
          }
          return db.setKeyValue({
            key: params.key,
            value: result.data!,
            updated_at: Date.now()
          })
        }
        case 'delete':
          return db.deleteKeyValue(params.key)
        default:
          throw new Error('Invalid action')
      }
    } catch (error) {
      console.error('db:kv:mutate error:', error)
      throw error
    }
  })

  // Unified version related operation handler
  ipcMain.handle('version:operation', async (_event, operation: string, payload?: any) => {
    try {
      switch (operation) {
        case 'getPrompt':
          return await versionPromptService.getVersionPrompt()

        case 'dismissPrompt':
          await versionPromptService.dismissPrompt()
          return

        case 'getReleaseNotes':
          return await versionPromptService.getReleaseNotes(payload?.version)

        default:
          throw new Error(`Unknown version operation: ${operation}`)
      }
    } catch (error) {
      console.error(`version:operation [${operation}] error:`, error)
      throw error
    }
  })

  // Handler 6: IndexedDB migration data read (renderer process response)
  // This handler listens to 'indexdb-migration:request-data' event from renderer process and responds

  // ==================== Original IPC Handlers ====================

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

  ipcMain.handle('cancel-task', async (_event, payload?: { tabId?: string }) => {
    console.log('cancel-task', payload)
    if (controller) {
      return await controller.cancelTask(payload?.tabId)
    }
    return null
  })

  ipcMain.handle('graceful-cancel-task', async (_event, payload?: { tabId?: string }) => {
    console.log('graceful-cancel-task', payload)
    if (controller) {
      return await controller.gracefulCancelTask(payload?.tabId)
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

  // Data sync start/stop
  ipcMain.handle('data-sync:set-enabled', async (_evt, enabled: boolean) => {
    try {
      const uid = getCurrentUserId()
      if (!uid) {
        throw new Error('User ID is required')
      }

      if (enabled) {
        if (!dataSyncController) {
          const dbPath = getChatermDbPathForUser(uid)
          console.log(`Starting data sync service for user ${uid}...`)
          const instance = await startDataSync(dbPath)
          dataSyncController = instance
        }

        // Enable sync
        const syncStateManager = dataSyncController.getSyncStateManager()
        if (syncStateManager) {
          syncStateManager.enableSync(uid)
        }
      } else {
        // Disable sync
        if (dataSyncController) {
          const syncStateManager = dataSyncController.getSyncStateManager()
          if (syncStateManager) {
            syncStateManager.disableSync()
          }

          console.log('Stopping data sync service...')
          await dataSyncController.destroy()
          dataSyncController = null
          console.log('Data sync service stopped')
        }
      }
      return { success: true }
    } catch (e: any) {
      console.warn('Failed to handle data-sync:set-enabled:', e?.message || e)
      return { success: false, error: e?.message || String(e) }
    }
  })

  // Get user sync status
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

      // Get full sync timer status
      let fullSyncTimerStatus: any = null
      try {
        fullSyncTimerStatus = dataSyncController.getFullSyncTimerStatus()
      } catch (error) {
        console.warn('Failed to get full sync timer status:', error)
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
      console.warn('Failed to get user sync status:', e?.message || e)
      return { success: false, error: e?.message || String(e) }
    }
  })

  // Execute full sync immediately
  ipcMain.handle('data-sync:full-sync-now', async () => {
    try {
      if (!dataSyncController) {
        return { success: false, error: 'Data sync controller not initialized' }
      }

      const result = await dataSyncController.fullSyncNow()
      return { success: result }
    } catch (e: any) {
      console.warn('Failed to execute manual full sync:', e?.message || e)
      return { success: false, error: e?.message || String(e) }
    }
  })

  // Update full sync interval
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
      console.warn('Failed to update full sync interval:', e?.message || e)
      return { success: false, error: e?.message || String(e) }
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
      applyThemeToTitleBar(mainWindow, theme)
      // Notify renderer process that theme has been updated
      const actualTheme = getActualTheme(theme)
      mainWindow.webContents.send('theme-updated', actualTheme)
      return true
    }
    return false
  })

  // Add system theme change listener for Windows
  if (process.platform === 'win32') {
    const { nativeTheme } = require('electron')
    nativeTheme.on('updated', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Check if current theme is auto mode
        // We'll get this from the renderer process
        mainWindow.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
      }
    })
  }

  ipcMain.handle('main-window-init', async (_, theme) => {
    await winReady
    applyThemeToTitleBar(mainWindow, theme)
  })

  ipcMain.handle('main-window-show', async () => {
    await winReady
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  })

  // Security configuration handler
  ipcMain.handle('security-open-config', async () => {
    try {
      // Use dynamic import instead of require to avoid path issues
      const SecurityConfigModule = await import('./agent/core/security/SecurityConfig')
      const { SecurityConfigManager } = SecurityConfigModule
      const securityManager = new SecurityConfigManager()

      // Directly open config file (file already ensured to exist on startup)
      await securityManager.openConfigFile()

      return { success: true }
    } catch (error) {
      console.error('Failed to open security config:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // Get security configuration file path
  ipcMain.handle('security-get-config-path', async () => {
    try {
      const SecurityConfigModule = await import('./agent/core/security/SecurityConfig')
      const { SecurityConfigManager } = SecurityConfigModule
      const securityManager = new SecurityConfigManager()
      return securityManager.getConfigPath()
    } catch (error) {
      console.error('Failed to get security config path:', error)
      throw new Error(`Failed to get security config path: ${error instanceof Error ? error.message : String(error)}`)
    }
  })

  // Read security configuration file
  ipcMain.handle('security-read-config', async () => {
    try {
      const SecurityConfigModule = await import('./agent/core/security/SecurityConfig')
      const { SecurityConfigManager } = SecurityConfigModule
      const securityManager = new SecurityConfigManager()
      const fs = await import('fs/promises')
      const configPath = securityManager.getConfigPath()

      // Ensure file exists, if not generate default config
      try {
        await fs.access(configPath)
      } catch {
        // File doesn't exist, generate default config
        await securityManager.loadConfig() // This will automatically generate default config file
      }

      const content = await fs.readFile(configPath, 'utf-8')
      console.log(`Security config file read from: ${configPath}, length: ${content.length}`)
      return content
    } catch (error) {
      console.error('Failed to read security config:', error)
      throw new Error(`Failed to read security config: ${error instanceof Error ? error.message : String(error)}`)
    }
  })

  // Write security configuration file
  ipcMain.handle('security-write-config', async (_, content: string) => {
    try {
      const SecurityConfigModule = await import('./agent/core/security/SecurityConfig')
      const { SecurityConfigManager } = SecurityConfigModule
      const securityManager = new SecurityConfigManager()
      const fs = await import('fs/promises')
      const configPath = securityManager.getConfigPath()
      await fs.writeFile(configPath, content, 'utf-8')

      // Reload configuration to apply changes
      await securityManager.loadConfig()

      // Notify CommandSecurityManager instance to reload config (hot reload)
      // This allows configuration changes to take effect immediately without restart
      if (controller) {
        try {
          await controller.reloadSecurityConfigForAllTasks()
          console.log('[SecurityConfig] Hot reloaded configuration in all active Tasks')
        } catch (error) {
          console.warn('[SecurityConfig] Failed to hot reload configuration in Tasks:', error)
          // This is not critical - config will be loaded on next task creation
        }
      }

      return { success: true }
    } catch (error) {
      console.error('Failed to write security config:', error)
      throw new Error(`Failed to write security config: ${error instanceof Error ? error.message : String(error)}`)
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
    const result = await chatermDbService.getLocalAssetRoute(searchType, params || [])
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

ipcMain.handle('asset-create-or-update', async (_, data) => {
  try {
    const { form } = data
    const result = chatermDbService.createOrUpdateAsset(form)
    return result
  } catch (error) {
    console.error('Chaterm create or update asset failed:', error)
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

//XTS file parsing processor
ipcMain.handle('parseXtsFile', async (_, data) => {
  try {
    const { data: zipData, fileName } = data
    console.log(`Starting XTS file parsing: ${fileName}`)

    const AdmZip = require('adm-zip')
    const iconv = require('iconv-lite')

    //Convert the array back to Buffer
    const buffer = Buffer.from(zipData)

    let zip
    let zipEntries

    try {
      zip = new AdmZip(buffer)
      zipEntries = zip.getEntries()
    } catch (error) {
      console.error('Failed to create ZIP object:', error)
      throw error
    }

    console.log(`Found ${zipEntries.length} entries in ZIP file`)

    const sessions: any[] = []

    // Iterate through all files in ZIP
    for (const entry of zipEntries) {
      if (entry.isDirectory) continue

      // 1. Handle filename encoding
      // adm-zip defaults to UTF-8 decoding, which may produce garbled text if it fails
      // We prioritize using rawEntryName (Buffer) for detection
      let entryName = entry.entryName
      let rawNameBuffer = entry.rawEntryName

      // If no rawEntryName, try to fall back from entryName to Buffer (not very reliable, but as a fallback)
      if (!rawNameBuffer) {
        rawNameBuffer = Buffer.from(entryName, 'binary')
      }

      // Try to detect encoding: prioritize GBK/GB18030 (common Chinese archive encoding), then UTF-8
      // If UTF-8 decoding doesn't produce garbled characters, consider it UTF-8, otherwise try GBK
      const utf8Name = rawNameBuffer.toString('utf8')
      if (!utf8Name.includes('') && !utf8Name.includes('♦')) {
        entryName = utf8Name
      } else {
        // Try GBK decoding
        try {
          const gbkName = iconv.decode(rawNameBuffer, 'gbk')
          entryName = gbkName
        } catch (e) {
          // If GBK fails, keep original or use UTF-8
          entryName = utf8Name
        }
      }

      // 2. Read file content and handle content encoding
      let content = ''
      try {
        const rawContent = entry.getData()

        // Check BOM (Byte Order Mark)
        if (rawContent.length >= 2 && rawContent[0] === 0xff && rawContent[1] === 0xfe) {
          // UTF-16 LE
          content = iconv.decode(rawContent, 'utf-16le')
          console.log(`Detected UTF-16 LE BOM for ${entryName}`)
        } else if (rawContent.length >= 2 && rawContent[0] === 0xfe && rawContent[1] === 0xff) {
          // UTF-16 BE
          content = iconv.decode(rawContent, 'utf-16be')
          console.log(`Detected UTF-16 BE BOM for ${entryName}`)
        } else {
          // No BOM, try UTF-8
          const utf8Content = rawContent.toString('utf8')
          // Check if it contains null bytes (UTF-16 characteristic) or lots of garbled text
          if (!utf8Content.includes('\0') && !utf8Content.includes('')) {
            content = utf8Content
          } else {
            // Try GBK
            content = iconv.decode(rawContent, 'gbk')
          }
        }
      } catch (e) {
        console.warn(`Failed to read content for ${entryName}`)
        continue
      }

      // 3. Check if it's a session file
      let isSessionFile = false
      const fileNamePart = entryName.split('/').pop() || entryName

      // Case A: Standard .xsh file
      if (fileNamePart.toLowerCase().endsWith('.xsh')) {
        isSessionFile = true
      }
      // Case B: Other files with extensions (e.g., .zcf) -> strictly ignore
      else if (fileNamePart.includes('.')) {
        isSessionFile = false
        // console.log(`Ignored non-xsh file: ${entryName}`)
      }
      // Case C: Files without extension (e.g., "D:\session_xsh") -> check content characteristics
      else {
        // Strictly check content characteristics to avoid misidentifying random files
        if (content.includes('[SessionInfo]') || content.includes('[CONNECTION]') || (content.includes('Host=') && content.includes('Protocol='))) {
          isSessionFile = true
          console.log(`Detected session file by content (no extension): ${entryName}`)
        }
      }

      if (isSessionFile) {
        try {
          const sessionFileName = entryName.split('/').pop() || entryName

          // Parse single XSH file
          const session = parseXSHContent(content, sessionFileName, entryName)

          if (session.host && session.username) {
            // Extract group information from path
            const pathParts = entryName.split('/')
            let groupName = 'Default'

            if (pathParts.length > 1) {
              // Use directory name as group
              groupName = pathParts[pathParts.length - 2] || 'Default'
            }

            session.groupName = groupName
            sessions.push(session)
          }
        } catch (error) {
          console.error(`Failed to parse session file ${entryName}:`, error)
        }
      }
    }

    console.log(`Total sessions parsed: ${sessions.length}`)

    return {
      success: true,
      sessions: sessions,
      count: sessions.length
    }
  } catch (error) {
    console.error('XTS file parsing failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      sessions: []
    }
  }
})

// XSH file content parsing function
function parseXSHContent(content: string, fileName: string, fullPath?: string): any {
  console.log(`Parsing XSH content for file: ${fileName}`)
  console.log(`Full path: ${fullPath || 'N/A'}`)

  const session: any = {}
  const lines = content.split('\n')

  // Extract session name from filename (remove .xsh extension)
  session.name = fileName.replace('.xsh', '')

  let foundHost = false
  let foundUsername = false
  let currentSection = ''

  console.log(`Total lines in file: ${lines.length}`)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()

    // Skip empty lines
    if (!trimmedLine) continue

    // console.log(`Line ${i}: "${trimmedLine}"`)

    // Check if it's a section header [SECTION]
    if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
      currentSection = trimmedLine
      console.log(`  -> Section: ${currentSection}`)
      continue
    }

    if (trimmedLine.includes('=')) {
      const equalIndex = trimmedLine.indexOf('=')
      const key = trimmedLine.substring(0, equalIndex).trim()
      const value = trimmedLine.substring(equalIndex + 1).trim()

      // console.log(`  -> Parsed: "${key}" = "${value}" (in section: ${currentSection})`)

      // Match by field name, case-insensitive
      const lowerKey = key.toLowerCase()

      if (lowerKey === 'host' || lowerKey === 'hostname') {
        session.host = value
        foundHost = true
        console.log(`*** Found host: ${value}`)
      } else if (lowerKey === 'port') {
        session.port = parseInt(value) || 22
        console.log(`*** Found port: ${session.port}`)
      } else if (lowerKey === 'username' || lowerKey === 'user') {
        session.username = value
        foundUsername = true
        console.log(`*** Found username: ${value}`)
      } else if (lowerKey === 'password') {
        // XShell passwords are usually encrypted, only check if it exists
        if (value && value !== '') {
          session.password = '' // Don't save encrypted password, user needs to re-enter
          console.log(`*** Found password (encrypted)`)
        }
      } else if (lowerKey === 'userkey') {
        // Non-empty UserKey field indicates key-based authentication
        if (value && value !== '') {
          session.authType = 'keyBased'
          session.keyFile = value
          console.log(`*** Found UserKey: ${value} - setting authType to keyBased`)
        }
      } else if (lowerKey === 'protocol' || lowerKey === 'protocolname' || lowerKey === 'protocol name') {
        session.protocol = value
        console.log(`*** Found protocol: ${value}`)
      } else if (lowerKey === 'description') {
        // Description information is only logged, does not update session name
        if (value && value !== 'Xshell session file') {
          console.log(`*** Found description: ${value}`)
        }
      }
    }
  }

  // Improved host information extraction logic
  if (!foundHost || !foundUsername) {
    console.log(`Missing required fields (host: ${foundHost}, username: ${foundUsername}), trying to extract from filename and path`)

    // Try to extract host information from filename and path
    const extractHostFromText = (text: string): string | null => {
      // Try to extract IP address
      const ipMatch = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
      if (ipMatch) {
        return ipMatch[1]
      }

      // Try to extract domain name
      const domainMatch = text.match(/([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}/g)
      if (domainMatch && domainMatch.length > 0) {
        return domainMatch[0]
      }

      // Try to extract hostname (alphanumeric combination)
      const hostnameMatch = text.match(/([a-zA-Z][a-zA-Z0-9\-_]{2,})/g)
      if (hostnameMatch && hostnameMatch.length > 0) {
        // Filter out common non-hostname words
        const excludeWords = ['root', 'admin', 'user', 'ubuntu', 'centos', 'server', 'host', 'ssh', 'connection']
        const validHostnames = hostnameMatch.filter((h) => !excludeWords.includes(h.toLowerCase()) && h.length >= 3)
        if (validHostnames.length > 0) {
          return validHostnames[0]
        }
      }

      return null
    }

    // If host not found, try to extract from filename and path
    if (!foundHost) {
      let extractedHost = extractHostFromText(fileName)

      // If not found in filename, try to extract from full path
      if (!extractedHost && fullPath) {
        extractedHost = extractHostFromText(fullPath)
      }

      if (extractedHost) {
        session.host = extractedHost
        foundHost = true
        console.log(`*** Extracted host from filename/path: ${session.host}`)
      } else {
        // If still not found, use filename as hostname
        const cleanFileName = fileName.replace('.xsh', '').replace(/[^a-zA-Z0-9\-_.]/g, '')
        if (cleanFileName.length > 0) {
          session.host = cleanFileName
          foundHost = true
          console.log(`*** Using cleaned filename as host: ${session.host}`)
        }
      }
    }

    // If filename contains common username patterns
    if (!foundUsername) {
      const commonUsers = ['root', 'admin', 'user', 'ubuntu', 'centos', 'administrator']
      const searchText = (fileName + ' ' + (fullPath || '')).toLowerCase()

      for (const user of commonUsers) {
        if (searchText.includes(user)) {
          session.username = user
          foundUsername = true
          console.log(`*** Extracted username from filename/path: ${session.username}`)
          break
        }
      }

      // If still not found, set default username
      if (!foundUsername) {
        session.username = 'root' // Changed to default to root instead of 'undefined'
        console.log(`*** Setting default username: ${session.username}`)
      }
    }
  }

  // Set default values
  if (!session.port) session.port = 22
  if (!session.protocol) session.protocol = 'SSH'
  if (!session.authType) session.authType = 'password'

  console.log(`Final session data:`, {
    name: session.name,
    host: session.host,
    port: session.port,
    username: session.username,
    protocol: session.protocol,
    foundHost,
    foundUsername,
    fileName,
    fullPath
  })

  return session
}

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
    const { search, limit = 50, offset = 0 } = data
    const result = chatermDbService.getUserHosts(search, limit, offset)
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
        // taskId should be provided in data if needed, otherwise undefined
        const taskId = data?.taskId
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

// 插件

ipcMain.handle('plugins.install', async (_event, pluginFilePath: string) => {
  const record = installPlugin(pluginFilePath)
  loadAllPlugins()
  return record
})

ipcMain.handle('plugins.uninstall', async (_event, pluginName: string) => {
  uninstallPlugin(pluginName)
  loadAllPlugins()
  return { ok: true }
})

ipcMain.handle('plugins.listUi', async () => {
  const registry = listPlugins()
  const uiItems: any[] = []

  for (const p of registry) {
    const manifestPath = path.join(p.path, 'plugin.json')
    if (!fsSync.existsSync(manifestPath)) continue

    const manifest = JSON.parse(fsSync.readFileSync(manifestPath, 'utf8')) as PluginManifest

    let iconUrl: string | null = null
    if (manifest.icon) {
      const iconFsPath = path.join(p.path, manifest.icon)
      if (fsSync.existsSync(iconFsPath)) {
        iconUrl = pathToFileURL(iconFsPath).toString()
      }
    }

    uiItems.push({
      id: p.id,
      version: p.version,
      enabled: p.enabled,
      name: manifest.displayName ?? manifest.id,
      description: manifest.description ?? '',
      iconUrl,
      tabName: p.id
    })
  }

  return uiItems
})
ipcMain.handle('plugins.getPluginsVersion', async () => {
  return await getAllPluginVersions()
})
ipcMain.handle('plugins.details', async (_event, pluginName: string) => {
  return getPluginDetailsByName(pluginName)
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

    // 获取本地插件版本信息
    let localPluginsEncoded = ''
    try {
      const localPlugins = await getAllPluginVersions()
      const localPluginsJson = JSON.stringify(localPlugins)
      localPluginsEncoded = encodeURIComponent(localPluginsJson)
    } catch (error) {
      console.error('Failed to get plugin versions:', error)
      // 如果获取失败，使用空对象
      localPluginsEncoded = encodeURIComponent(JSON.stringify({}))
    }

    // 根据IP地址选择不同的登录URL
    let externalLoginUrl
    if (isMainlandChinaIpAddress) {
      // 中国大陆IP使用国内服务器
      externalLoginUrl = `https://chaterm.intsig.net/login?client_id=chaterm&state=${state}&redirect_uri=chaterm://auth/callback&mac_address=${encodeURIComponent(macAddress)}&local_plugins=${localPluginsEncoded}`
    } else {
      // 非中国大陆IP使用国际服务器
      externalLoginUrl = `https://login.chaterm.ai/login?client_id=chaterm&state=${state}&redirect_uri=chaterm://auth/callback&mac_address=${encodeURIComponent(macAddress)}&local_plugins=${localPluginsEncoded}`
    }

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
