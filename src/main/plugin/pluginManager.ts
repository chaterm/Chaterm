import * as fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { getUserDataPath } from '../config/edition'

export interface PluginManifest {
  id: string
  displayName: string
  version: string
  description?: string
  main: string
  icon?: string
  type?: string
}

export interface InstalledPlugin {
  id: string
  displayName: string
  version: string
  path: string
  enabled: boolean
}

// Lazy getters to ensure path is resolved after initUserDataPath() is called
function getExtensionsRoot(): string {
  return path.join(getUserDataPath(), 'extensions')
}

function getRegistryPath(): string {
  return path.join(getExtensionsRoot(), 'plugins.json')
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

  return record
}

export function uninstallPlugin(pluginId: string) {
  const registry = readRegistry()
  const rest: InstalledPlugin[] = []
  for (const p of registry) {
    if (p.id === pluginId) {
      if (fs.existsSync(p.path)) {
        fs.rmSync(p.path, { recursive: true, force: true })
      }
    } else {
      rest.push(p)
    }
  }
  writeRegistry(rest)
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
        console.error('[auth] version provider error for', pluginId, e)
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
