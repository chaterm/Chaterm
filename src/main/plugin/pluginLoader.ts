import * as fs from 'fs'
import path from 'path'
import { clearInstallHints, clearVersionProviders, listPlugins, PluginManifest, registerInstallHint, registerVersionProvider } from './pluginManager'
import { BrowserWindow } from 'electron'
import type { PluginHost, PluginHostModules, VersionProviderFn } from './pluginHost'
import { PluginStorageContext } from './pluginGlobalState'
import { ExternalAssetCache } from './pluginIpc'
import { capabilityRegistry, BastionCapability, BastionDefinition } from '../ssh/capabilityRegistry'
const logger = createLogger('plugin')

export interface PluginModule {
  register(host: PluginHost): void | Promise<void>
}

export const treeProviders = new Map<string, any>()
export const pluginCommands = new Map<string, (...args: any[]) => any>()
export const globalContext = new Map<string, any>()

function broadcast(channel: string, ...args: any[]) {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  })
}

async function handlePluginChange() {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('plugin:metadata-changed')
    }
  })
}
export async function loadAllPlugins() {
  const plugins = listPlugins()
  const enabledPlugins = plugins.filter((plugin) => plugin.enabled)
  logger.info('Starting plugin load', {
    event: 'plugin.load.start',
    totalPlugins: plugins.length,
    enabledPlugins: enabledPlugins.length
  })

  clearVersionProviders()
  clearInstallHints()
  handlePluginChange()
  treeProviders.clear()
  pluginCommands.clear()
  globalContext.clear()

  capabilityRegistry.clearBastions()
  const storage = new PluginStorageContext()
  let loadedCount = 0
  let failedCount = 0
  let skippedCount = 0

  let hostModules: PluginHostModules = {}
  try {
    hostModules = {
      ssh2: require('ssh2')
    }
  } catch (e) {
    logger.warn('ssh2 module not available for plugins', { error: e instanceof Error ? e.message : String(e) })
  }

  for (const p of plugins) {
    if (!p.enabled) {
      skippedCount++
      continue
    }

    const manifestPath = path.join(p.path, 'plugin.json')
    if (!fs.existsSync(manifestPath)) {
      skippedCount++
      logger.warn('Plugin manifest not found, skipping plugin', {
        event: 'plugin.load.manifest.missing',
        pluginId: p.id
      })
      continue
    }

    let manifest: PluginManifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest
    } catch (e) {
      failedCount++
      logger.error('Invalid manifest for plugin', { pluginId: p.id, error: e instanceof Error ? e.message : String(e) })
      continue
    }

    const entry = path.join(p.path, manifest.main)
    if (!fs.existsSync(entry)) {
      failedCount++
      logger.error('Main entry not found for plugin', { pluginId: p.id })
      continue
    }

    const host: PluginHost = {
      registerVersionProvider(fn: VersionProviderFn) {
        registerVersionProvider(p.id, fn)
      },
      registerInstallHint(hint) {
        registerInstallHint(p.id, hint)
      },
      registerBastionCapability(capability: BastionCapability) {
        capabilityRegistry.registerBastion(capability)
      },
      registerBastionDefinition(definition: BastionDefinition) {
        capabilityRegistry.registerBastionDefinition(definition)
      },
      globalState: storage.globalState,
      workspaceState: storage.workspaceState,
      secrets: storage.secrets,
      logger: {
        createLogger(module: string) {
          const normalized = module.trim()
          if (!normalized) {
            return createLogger(`plugin/${p.id}`)
          }
          if (normalized.startsWith('plugin/')) {
            return createLogger(normalized)
          }
          return createLogger(`plugin/${p.id}/${normalized}`)
        }
      },

      registerTreeDataProvider(viewId: string, provider: any) {
        treeProviders.set(viewId, provider)
      },

      registerCommand(commandId: string, handler: (...args: any[]) => any) {
        pluginCommands.set(commandId, handler)
      },

      async executeCommand(commandId: string, ...args: any[]) {
        // Check the custom commands registered by the plugin
        const handler = pluginCommands.get(commandId)
        if (handler) {
          const actualArgs = Array.isArray(args) ? args[0] : args
          return await handler(actualArgs)
        }
        if (commandId === 'core:registerAsset') {
          const connectionInfo = Array.isArray(args) ? args[0] : args
          const uuid = connectionInfo.uuid || connectionInfo.id
          if (uuid) {
            connectionInfo.source = 'plugin'
            ExternalAssetCache.set(uuid, connectionInfo)
            return true
          }
          return false
        }
        // Open editor
        if (commandId === 'core.openCommonConfigEditor') {
          broadcast('plugin:open-editor-request', args[0])
          return
        }

        // Open SSH Tab
        if (commandId === 'core.openUserTab') {
          broadcast('plugin:open-user-tab-request', args[0])
          return
        }
      },

      setContext(key: string, value: any) {
        globalContext.set(key, value)
        broadcast('plugin:context-updated', { key, value })
      },

      refreshTree(viewId: string) {
        broadcast(`plugin:refresh-view:${viewId}`)
      },

      asAbsolutePath(relativePath: string) {
        return path.join(p.path, relativePath)
      },

      async readFile(filePath: string) {
        try {
          if (!fs.existsSync(filePath)) return ''
          return fs.readFileSync(filePath, 'utf8')
        } catch (e) {
          logger.warn('Plugin readFile failed', {
            event: 'plugin.host.read_file.error',
            pluginId: p.id,
            filePath,
            error: e instanceof Error ? e.message : String(e)
          })
          return ''
        }
      },

      async writeFile(filePath: string, content: string) {
        try {
          const dir = path.dirname(filePath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(filePath, content, 'utf8')
          return true
        } catch (e) {
          logger.warn('Plugin writeFile failed', {
            event: 'plugin.host.write_file.error',
            pluginId: p.id,
            filePath,
            error: e instanceof Error ? e.message : String(e)
          })
          return false
        }
      },
      modules: hostModules
    }

    try {
      delete require.cache[require.resolve(entry)]
      const mod: PluginModule = require(entry)
      if (typeof mod.register === 'function') {
        await mod.register(host)
        loadedCount++
        logger.debug('Plugin registered', { event: 'plugin.load.registered', pluginId: p.id })
      } else {
        loadedCount++
        logger.warn('Plugin has no register(), loaded without setup', {
          event: 'plugin.load.register.missing',
          pluginId: p.id
        })
      }
    } catch (e) {
      failedCount++
      logger.error('Plugin load error', { pluginId: p.id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  logger.info('Plugin load completed', {
    event: 'plugin.load.complete',
    totalPlugins: plugins.length,
    enabledPlugins: enabledPlugins.length,
    loadedCount,
    failedCount,
    skippedCount
  })
}
