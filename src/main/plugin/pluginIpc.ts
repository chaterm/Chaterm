import { ipcMain } from 'electron'
import { pluginCommands, treeProviders } from './pluginLoader'
import { listPlugins } from './pluginManager'
import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { ConnectionInfo } from '../agent/integrations/remote-terminal'
const logger = createLogger('plugin')

const globalContext = new Map<string, any>()

export function setupPluginIpc() {
  // Retrieve all views defined by plugins
  ipcMain.handle('plugin:get-views', async () => {
    const plugins = listPlugins()
    const result: any[] = []

    for (const p of plugins) {
      if (!p.enabled) continue

      const manifestPath = path.join(p.path, 'plugin.json')
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
          if (manifest.contributes?.views) {
            manifest.contributes.views.forEach((v: any) => {
              let iconPath = v.icon
              if (iconPath && iconPath.includes('.')) {
                const fullIconPath = path.join(p.path, iconPath)
                if (fs.existsSync(fullIconPath)) {
                  iconPath = pathToFileURL(fullIconPath).href
                }
              }
              result.push({
                id: v.id,
                name: v.name,
                icon: iconPath
              })
            })
          }
        } catch (e) {}
      }
    }
    return result
  })

  // Obtain metadata of the view
  ipcMain.handle('plugin:get-view-metadata', async (_event, viewId) => {
    const plugins = listPlugins()
    for (const p of plugins) {
      const manifestPath = path.join(p.path, 'plugin.json')
      if (!fs.existsSync(manifestPath)) continue

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        const view = manifest.contributes?.views?.find((v: any) => v.id === viewId)

        if (view) {
          const menus = manifest.contributes?.menus || {}
          return {
            id: viewId,
            name: view.name,
            welcomes: manifest.contributes?.viewsWelcome?.filter((w: any) => w.view === viewId) || [],
            menus: menus
          }
        }
      } catch (e) {
        logger.error('Manifest parsing failed', { error: e instanceof Error ? e.message : String(e) })
      }
    }
    return null
  })

  // View tree data and context interface
  ipcMain.handle('plugin:get-tree-nodes', async (_event, { viewId, element }) => {
    const provider = treeProviders.get(viewId)
    if (!provider) return []
    const nodes = await provider.getChildren(element)
    return JSON.parse(JSON.stringify(nodes))
  })

  ipcMain.handle('plugin:get-all-contexts', () => {
    return Object.fromEntries(globalContext)
  })

  // Set context interface
  ipcMain.on('plugin:set-context', (event, { key, value }) => {
    globalContext.set(key, value)
    event.sender.send('plugin:context-updated', { key, value })
  })

  // File system interface (for use by the generic editor CommonConfigEditor)
  // Read file
  ipcMain.handle('plugin:read-file', async (_event, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8')
      }
      return ''
    } catch (e) {
      logger.error('Failed to read the file', { filePath, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  })

  ipcMain.handle('plugin:write-file', async (_event, { filePath, content }) => {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(filePath, content, 'utf8')
      return true
    } catch (e) {
      logger.error('Failed to write to the file', { filePath, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  })

  ipcMain.handle('plugin:execute-command', async (event, { commandId, args }) => {
    //Internal core command processing logic (like core.openPluginEditor)
    switch (commandId) {
      case 'core.openCommonConfigEditor':
        event.sender.send('plugin:open-editor-request', args)
        return

      case 'core.openUserTab':
        event.sender.send('plugin:open-user-tab-request', args)
        return
    }

    // host.registerCommand
    const commandHandler = pluginCommands.get(commandId)
    if (commandHandler) {
      try {
        // Support array parameter expansion
        return Array.isArray(args) ? await commandHandler(...args) : await commandHandler(args)
      } catch (e) {
        logger.error('Command execution error', { commandId, error: e instanceof Error ? e.message : String(e) })
        throw e
      }
    }

    logger.warn('Command handler not found', { commandId })
    return null
  })
}
export const ExternalAssetCache = new Map<string, ConnectionInfo>()
