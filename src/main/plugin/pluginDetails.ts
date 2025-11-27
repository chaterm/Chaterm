import * as fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { listPlugins, PluginManifest } from './pluginManager'

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

// 读取 README 内容
function readReadme(rootDir: string): string {
  const candidates = ['README.md', 'readme.md', 'README.txt', 'readme.txt']
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

// 获取详情
export function getPluginDetailsByName(pluginName: string): PluginDetails | null {
  const registry = listPlugins()

  const record = registry.find((p) => p.displayName === pluginName)
  if (!record) return null

  const basePath = record.path
  const manifestPath = path.join(basePath, 'plugin.json')
  if (!fs.existsSync(manifestPath)) return null

  let manifest: PluginManifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest
  } catch (e) {
    console.error('[pluginDetails] invalid manifest for', pluginName, e)
    return null
  }

  let iconUrl: string | null = null
  if (manifest.icon) {
    const iconFsPath = path.join(basePath, manifest.icon)
    if (fs.existsSync(iconFsPath)) {
      iconUrl = pathToFileURL(iconFsPath).toString()
    }
  }
  const readme = readReadme(basePath)
  const info = calcDirInfo(basePath)
  const lastUpdatedStr = info.lastUpdated ? new Date(info.lastUpdated).toISOString().replace('T', ' ').substring(0, 19) : ''

  return {
    id: manifest.id,
    name: manifest.displayName ?? manifest.id,
    description: manifest.description ?? '',
    version: manifest.version ?? '0.0.0',
    iconUrl,
    isPlugin: true,
    readme,
    lastUpdated: lastUpdatedStr,
    size: info.size
  }
}
