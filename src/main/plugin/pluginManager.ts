import * as fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { getUserDataPath } from '../config/edition'
import { getCurrentUserId, getGuestUserId } from '../storage/db/connection'
const logger = createLogger('plugin')

export interface PluginI18nStrings {
  displayName?: string
  description?: string
}

export interface PluginManifest {
  id: string
  displayName: string
  version: string
  description?: string
  main: string
  icon?: string
  type?: string
  contributes?: {
    views?: Array<{
      id: string
      name: string
      icon?: string
    }>
  }
  i18n?: Record<string, PluginI18nStrings>
}

export interface InstalledPlugin {
  id: string
  displayName: string
  version: string
  path: string
  enabled: boolean
}

// Database directory name - must match connection.ts DB_DIR_NAME
const DB_DIR_NAME = 'chaterm_db'

// Lazy getters to ensure path is resolved after initUserDataPath() is called
function getExtensionsRoot(): string {
  const userId = getCurrentUserId() ?? getGuestUserId()
  return path.join(getUserDataPath(), DB_DIR_NAME, `${userId}`, 'plugins')
}

function getRegistryPath(): string {
  return path.join(getExtensionsRoot(), 'plugins.json')
}

export function getPluginCacheRoot(): string {
  return path.join(getExtensionsRoot(), '.cache')
}

function readRegistry(): InstalledPlugin[] {
  const regPath = getRegistryPath()
  if (!fs.existsSync(regPath)) return []
  try {
    const raw = fs.readFileSync(regPath, 'utf8')
    return JSON.parse(raw) as InstalledPlugin[]
  } catch {
    return []
  }
}

function writeRegistry(list: InstalledPlugin[]) {
  const extRoot = getExtensionsRoot()
  if (!fs.existsSync(extRoot)) {
    fs.mkdirSync(extRoot, { recursive: true })
  }
  fs.writeFileSync(getRegistryPath(), JSON.stringify(list, null, 2), 'utf8')
}

export function listPlugins(): InstalledPlugin[] {
  return readRegistry()
}

export function installPlugin(pluginFilePath: string): InstalledPlugin {
  logger.info('Installing plugin package', {
    event: 'plugin.install.start',
    packageName: path.basename(pluginFilePath)
  })

  try {
    const extRoot = getExtensionsRoot()
    if (!fs.existsSync(extRoot)) {
      fs.mkdirSync(extRoot, { recursive: true })
    }

    const tmpDir = fs.mkdtempSync(path.join(extRoot, 'tmp-'))
    const zip = new AdmZip(pluginFilePath)
    zip.extractAllTo(tmpDir, true)

    const manifestPath = path.join(tmpDir, 'plugin.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error('plugin.json not found in plugin package')
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest
    if (!manifest.id || !manifest.version || !manifest.main) {
      throw new Error('invalid plugin manifest')
    }

    const finalDirName = `${manifest.id}-${manifest.version}`
    const finalDir = path.join(extRoot, finalDirName)

    if (fs.existsSync(finalDir)) {
      fs.rmSync(finalDir, { recursive: true, force: true })
    }
    fs.renameSync(tmpDir, finalDir)

    const registry = readRegistry().filter((p) => !(p.id === manifest.id && p.version === manifest.version))
    const record: InstalledPlugin = {
      id: manifest.id,
      displayName: manifest.displayName,
      version: manifest.version,
      path: finalDir,
      enabled: true
    }
    registry.push(record)
    writeRegistry(registry)

    logger.info('Plugin installed', {
      event: 'plugin.install.success',
      pluginId: record.id,
      version: record.version
    })

    return record
  } catch (error) {
    logger.error('Plugin install failed', {
      event: 'plugin.install.error',
      packageName: path.basename(pluginFilePath),
      error: error
    })
    throw error
  }
}

export function uninstallPlugin(pluginId: string) {
  logger.info('Uninstalling plugin', { event: 'plugin.uninstall.start', pluginId })
  const registry = readRegistry()
  const rest: InstalledPlugin[] = []
  let removed = false
  for (const p of registry) {
    if (p.id === pluginId) {
      if (fs.existsSync(p.path)) {
        fs.rmSync(p.path, { recursive: true, force: true })
      }
      removed = true
    } else {
      rest.push(p)
    }
  }
  writeRegistry(rest)

  if (removed) {
    logger.info('Plugin uninstalled', { event: 'plugin.uninstall.success', pluginId })
  } else {
    logger.warn('Plugin uninstall skipped, plugin not found', {
      event: 'plugin.uninstall.notfound',
      pluginId
    })
  }
}

type VersionProviderFn = () => string | null | Promise<string | null>

const versionProviders = new Map<string, VersionProviderFn>()

export function registerVersionProvider(pluginId: string, fn: VersionProviderFn) {
  versionProviders.set(pluginId, fn)
}

export function clearVersionProviders() {
  versionProviders.clear()
}

export async function getAllPluginVersions(): Promise<Record<string, string>> {
  const result: Record<string, string> = {}

  const installed = listPlugins()

  for (const p of installed) {
    if (!p.enabled) continue

    const pluginId = p.id
    const name = p.displayName || p.id

    const provider = versionProviders.get(pluginId)
    let version: string | null = null

    if (provider) {
      try {
        const v = provider()

        version = v instanceof Promise ? await v : v
      } catch (e) {
        logger.error('Version provider error', { pluginId, error: e })
      }
    }

    if (!version) {
      version = p.version || '0.0.0'
    }

    result[name] = version
  }

  return result
}

export interface InstallHint {
  message?: string
}

const installHints = new Map<string, InstallHint>()

export function registerInstallHint(pluginId: string, hint: InstallHint) {
  installHints.set(pluginId, hint)
}

export function getInstallHint(pluginId: string): InstallHint | null {
  return installHints.get(pluginId) ?? null
}

export function clearInstallHints() {
  installHints.clear()
}
