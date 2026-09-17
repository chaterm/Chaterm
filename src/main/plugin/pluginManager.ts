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
  source?: 'preinstalled' | 'store' | 'local'
  required?: boolean
}

export interface InstallPluginOptions {
  source?: InstalledPlugin['source']
  required?: boolean
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

const SAFE_PLUGIN_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/

export function isSafePluginPathSegment(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > 128) return false
  if (value === '.' || value === '..') return false
  if (value.includes('..')) return false
  return SAFE_PLUGIN_SEGMENT.test(value)
}

export function assertSafePluginPathSegment(value: unknown, field: string): string {
  if (!isSafePluginPathSegment(value)) {
    throw new Error(`invalid plugin ${field}`)
  }
  return value
}

/**
 * Validates a manifest field that is later joined onto the plugin directory
 */
export function assertSafeRelativeEntry(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new Error(`invalid plugin ${field}`)
  }
  if (path.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    throw new Error(`invalid plugin ${field}`)
  }
  const segments = value.split(/[\\/]+/)
  if (segments.some((segment) => segment === '..' || segment === '.' || segment.length === 0)) {
    throw new Error(`invalid plugin ${field}`)
  }
  return value
}

/** True when `child` resolves strictly inside `parent`. */
export function isPathInside(child: string, parent: string): boolean {
  if (typeof child !== 'string' || child.length === 0) return false
  const resolvedParent = path.resolve(parent)
  const resolvedChild = path.resolve(child)
  if (resolvedChild === resolvedParent) return false
  const rel = path.relative(resolvedParent, resolvedChild)
  if (rel.length === 0 || path.isAbsolute(rel)) return false
  return rel.split(path.sep)[0] !== '..'
}

/** True when a registry record points at a directory inside the current plugins root. */
export function isTrustedPluginPath(pluginPath: string): boolean {
  return isPathInside(pluginPath, getExtensionsRoot())
}

export function getPluginCacheRoot(): string {
  return path.join(getExtensionsRoot(), '.cache')
}

function readRegistry(): InstalledPlugin[] {
  const regPath = getRegistryPath()
  if (!fs.existsSync(regPath)) return []
  try {
    const raw = fs.readFileSync(regPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as InstalledPlugin[]).filter((entry) => {
      if (!entry || typeof entry !== 'object') return false
      if (!isSafePluginPathSegment(entry.id) || !isSafePluginPathSegment(entry.version)) {
        logger.warn('Dropping plugin registry entry with unsafe id/version', {
          event: 'plugin.registry.entry.rejected',
          pluginId: String(entry?.id)
        })
        return false
      }
      if (!isTrustedPluginPath(entry.path)) {
        logger.warn('Dropping plugin registry entry outside plugins root', {
          event: 'plugin.registry.entry.rejected',
          pluginId: entry.id
        })
        return false
      }
      return true
    })
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

export function installPlugin(pluginFilePath: string, options?: InstallPluginOptions): InstalledPlugin {
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
    for (const entry of zip.getEntries()) {
      const entryPath = path.resolve(tmpDir, entry.entryName)
      if (!entryPath.startsWith(`${path.resolve(tmpDir)}${path.sep}`)) {
        throw new Error('plugin package contains an invalid path')
      }

      if (entry.isDirectory) {
        fs.mkdirSync(entryPath, { recursive: true })
        continue
      }

      fs.mkdirSync(path.dirname(entryPath), { recursive: true })
      fs.writeFileSync(entryPath, entry.getData())
    }

    const manifestPath = path.join(tmpDir, 'plugin.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error('plugin.json not found in plugin package')
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest
    if (!manifest.id || !manifest.version || !manifest.main) {
      throw new Error('invalid plugin manifest')
    }

    // id/version become a directory name; reject anything that is not a single inert segment.
    assertSafePluginPathSegment(manifest.id, 'id')
    assertSafePluginPathSegment(manifest.version, 'version')
    assertSafeRelativeEntry(manifest.main, 'main')
    if (manifest.icon !== undefined) {
      assertSafeRelativeEntry(manifest.icon, 'icon')
    }

    const finalDirName = `${manifest.id}-${manifest.version}`
    const finalDir = path.join(extRoot, finalDirName)
    // Defence in depth: the resolved install dir must stay strictly inside the plugins root.
    if (!isPathInside(finalDir, extRoot)) {
      throw new Error('plugin install path escapes the plugins directory')
    }

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
      enabled: true,
      source: options?.source,
      required: options?.required === true
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

export function uninstallPlugin(pluginId: string, options?: { force?: boolean }) {
  logger.info('Uninstalling plugin', { event: 'plugin.uninstall.start', pluginId })
  const registry = readRegistry()
  if (!options?.force && registry.some((p) => p.id === pluginId && p.required)) {
    throw new Error('This plugin is required and cannot be uninstalled')
  }
  const rest: InstalledPlugin[] = []
  let removed = false
  for (const p of registry) {
    if (p.id === pluginId) {
      if (isTrustedPluginPath(p.path) && fs.existsSync(p.path)) {
        fs.rmSync(p.path, { recursive: true, force: true })
      } else if (!isTrustedPluginPath(p.path)) {
        logger.warn('Refusing to remove plugin path outside plugins root', {
          event: 'plugin.uninstall.path.rejected',
          pluginId
        })
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

export function getInstalledPlugin(pluginId: string): InstalledPlugin | null {
  return readRegistry().find((plugin) => plugin.id === pluginId) ?? null
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
