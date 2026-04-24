import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import path from 'path'
import os from 'os'
import AdmZip from 'adm-zip'

const mockUserDataPath = vi.fn()
const mockGetCurrentUserId = vi.fn()
const mockGetGuestUserId = vi.fn(() => 999)

vi.mock('../config/edition', () => ({
  getUserDataPath: () => mockUserDataPath()
}))

vi.mock('../storage/db/connection', () => ({
  getCurrentUserId: () => mockGetCurrentUserId(),
  getGuestUserId: () => mockGetGuestUserId()
}))

describe('pluginManager per-user storage', () => {
  const tempDirs: string[] = []

  beforeEach(() => {
    tempDirs.length = 0
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  function makeTempDir(prefix: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
  }

  function createPluginZip(overrides?: { id?: string; displayName?: string; version?: string }): string {
    const id = overrides?.id || 'p1'
    const displayName = overrides?.displayName || 'P1'
    const version = overrides?.version || '1.0.0'
    const pkgDir = makeTempDir('plugin-pkg-')
    fs.writeFileSync(path.join(pkgDir, 'plugin.json'), JSON.stringify({ id, displayName, version, main: 'index.js' }))
    fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = {}')

    const zip = new AdmZip()
    zip.addLocalFolder(pkgDir)

    const zipPath = path.join(makeTempDir('plugin-zip-'), `${id}.chaterm`)
    zip.writeZip(zipPath)
    return zipPath
  }

  it('installs plugins under current user database plugins directory', async () => {
    const userData = makeTempDir('userData-')
    mockUserDataPath.mockReturnValue(userData)
    mockGetCurrentUserId.mockReturnValue(42)

    const { installPlugin, listPlugins } = await import('./pluginManager')

    const zipPath = createPluginZip()
    const record = installPlugin(zipPath)

    expect(record.path).toBe(path.join(userData, 'chaterm_db', '42', 'plugins', 'p1-1.0.0'))
    expect(fs.existsSync(record.path)).toBe(true)

    const registry = listPlugins()
    expect(registry[0]?.path).toBe(record.path)
  })

  it('returns cache root under current user plugins directory', async () => {
    const userData = makeTempDir('userData-')
    mockUserDataPath.mockReturnValue(userData)
    mockGetCurrentUserId.mockReturnValue(42)

    const { getPluginCacheRoot } = await import('./pluginManager')

    expect(getPluginCacheRoot()).toBe(path.join(userData, 'chaterm_db', '42', 'plugins', '.cache'))
  })

  it('falls back to guest user directory when no current user', async () => {
    const userData = makeTempDir('userData-')
    mockUserDataPath.mockReturnValue(userData)
    mockGetCurrentUserId.mockReturnValue(null)
    mockGetGuestUserId.mockReturnValue(123)

    const registryPath = path.join(userData, 'chaterm_db', '123', 'plugins', 'plugins.json')
    fs.mkdirSync(path.dirname(registryPath), { recursive: true })
    fs.writeFileSync(registryPath, JSON.stringify([{ id: 'p2', displayName: 'P2', version: '1.0.0', path: '/tmp/p2', enabled: true }]))

    const { listPlugins } = await import('./pluginManager')
    const registry = listPlugins()

    expect(registry.length).toBe(1)
    expect(registry[0]?.id).toBe('p2')
  })

  it('blocks uninstall for required plugins unless force is enabled', async () => {
    const userData = makeTempDir('userData-')
    mockUserDataPath.mockReturnValue(userData)
    mockGetCurrentUserId.mockReturnValue(42)

    const { installPlugin, uninstallPlugin, listPlugins } = await import('./pluginManager')

    const zipPath = createPluginZip({ id: 'required-plugin', displayName: 'Required Plugin' })
    installPlugin(zipPath, { source: 'preinstalled', required: true })

    expect(() => uninstallPlugin('required-plugin')).toThrow('This plugin is required and cannot be uninstalled')
    expect(listPlugins()).toHaveLength(1)

    uninstallPlugin('required-plugin', { force: true })
    expect(listPlugins()).toHaveLength(0)
  })
})
