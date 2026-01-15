import * as fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { listPlugins, PluginManifest } from './pluginManager'
import { getUserConfig } from '../agent/core/storage/state'

export interface PluginDetails {
  id: string
  name: string
  description: string
  version: string
  iconUrl: string | null
  isPlugin: boolean
  readme: string
  lastUpdated: string
  size: number
}

function calcDirInfo(rootDir: string): { size: number; lastUpdated: number } {
  let totalSize = 0
  let lastUpdated = 0

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const stat = fs.statSync(fullPath)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        totalSize += stat.size
        if (stat.mtimeMs > lastUpdated) {
          lastUpdated = stat.mtimeMs
        }
      }
    }
  }

  if (fs.existsSync(rootDir)) {
    walk(rootDir)
  }

  return { size: totalSize, lastUpdated }
}

// Read README content with language support
// Priority: README_{language}.md > README_zh-CN.md > README.md
function readReadme(rootDir: string, language: string): string {
  const candidates = [`README_${language}.md`, 'README_zh-CN.md', 'README_en-US.md', 'README.md', 'readme.md']
  for (const name of candidates) {
    const p = path.join(rootDir, name)
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, 'utf8')
      } catch {
        return ''
      }
    }
  }
  return ''
}

// Get localized plugin name and description from i18n field
export function getLocalizedStrings(manifest: PluginManifest, language: string): { name: string; description: string } {
  const fallbackName = manifest.displayName ?? manifest.id
  const fallbackDescription = manifest.description ?? ''

  if (!manifest.i18n) {
    return { name: fallbackName, description: fallbackDescription }
  }

  // Try current language, then fallback to zh-CN, then en-US, finally use default
  const i18nStrings = manifest.i18n[language] || manifest.i18n['zh-CN'] || manifest.i18n['en-US']

  return {
    name: i18nStrings?.displayName || fallbackName,
    description: i18nStrings?.description || fallbackDescription
  }
}

// Get current user language
export async function getUserLanguage(): Promise<string> {
  try {
    const userConfig = await getUserConfig()
    return userConfig?.language || 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

// Get plugin details
export async function getPluginDetailsByName(pluginName: string): Promise<PluginDetails | null> {
  const registry = listPlugins()
  const language = await getUserLanguage()

  // Find by localized name or original displayName
  let record: { path: string } | null = null
  let manifest: PluginManifest | null = null

  for (const p of registry) {
    const manifestPath = path.join(p.path, 'plugin.json')
    if (!fs.existsSync(manifestPath)) continue

    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest
      const { name } = getLocalizedStrings(m, language)
      // Match by localized name or original displayName
      if (name === pluginName || m.displayName === pluginName || p.displayName === pluginName) {
        record = p
        manifest = m
        break
      }
    } catch {
      continue
    }
  }

  if (!record || !manifest) return null

  const basePath = record.path

  let iconUrl: string | null = null
  if (manifest.icon) {
    const iconFsPath = path.join(basePath, manifest.icon)
    if (fs.existsSync(iconFsPath)) {
      iconUrl = pathToFileURL(iconFsPath).toString()
    }
  }
  const info = calcDirInfo(basePath)
  const lastUpdatedStr = info.lastUpdated ? new Date(info.lastUpdated).toISOString().replace('T', ' ').substring(0, 19) : ''

  const { name, description } = getLocalizedStrings(manifest, language)
  const readme = readReadme(basePath, language)

  return {
    id: manifest.id,
    name,
    description,
    version: manifest.version ?? '0.0.0',
    iconUrl,
    isPlugin: true,
    readme,
    lastUpdated: lastUpdatedStr,
    size: info.size
  }
}
