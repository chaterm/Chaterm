import * as fs from 'fs'
import path from 'path'
import { clearInstallHints, clearVersionProviders, listPlugins, PluginManifest, registerInstallHint, registerVersionProvider } from './pluginManager'
import { BrowserWindow } from 'electron'
import type { PluginHost, PluginHostModules, VersionProviderFn } from './pluginHost'
import { PluginStorageContext } from './pluginGlobalState'
import { ExternalAssetCache } from './pluginIpc'
import { capabilityRegistry, BastionCapability, BastionDefinition } from '../ssh/capabilityRegistry'
import { createLogger } from '@logging'

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

  clearVersionProviders()
  clearInstallHints()
  handlePluginChange()
  treeProviders.clear()
  pluginCommands.clear()
  globalContext.clear()

  capabilityRegistry.clearBastions()
  const storage = new PluginStorageContext()

  let hostModules: PluginHostModules = {}
  try {
    hostModules = {
      ssh2: require('ssh2')
    }
  } catch (e) {
    logger.warn('ssh2 module not available for plugins', { error: e instanceof Error ? e.message : String(e) })
  }

  for (const p of plugins) {
    if (!p.enabled) continue

    const manifestPath = path.join(p.path, 'plugin.json')
    if (!fs.existsSync(manifestPath)) continue

    let manifest: PluginManifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest
    } catch (e) {
      logger.error('Invalid manifest for plugin', { pluginId: p.id, error: e instanceof Error ? e.message : String(e) })
      continue
    }

    const entry = path.join(p.path, manifest.main)
    if (!fs.existsSync(entry)) {
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
        logger.info('Plugin registered', { pluginId: p.id })
      } else {
        logger.info('Plugin has no register()', { pluginId: p.id })
      }
    } catch (e) {
      logger.error('Plugin load error', { pluginId: p.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
}
