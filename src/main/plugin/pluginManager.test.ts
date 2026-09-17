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
    fs.writeFileSync(
      registryPath,
      JSON.stringify([{ id: 'p2', displayName: 'P2', version: '1.0.0', path: path.join(path.dirname(registryPath), 'p2-1.0.0'), enabled: true }])
    )

    const { listPlugins } = await import('./pluginManager')
    const registry = listPlugins()

    expect(registry.length).toBe(1)
    expect(registry[0]?.id).toBe('p2')
  })

  it('rejects packages whose id escapes the plugins directory', async () => {
    const userData = makeTempDir('userData-')
    mockUserDataPath.mockReturnValue(userData)
    mockGetCurrentUserId.mockReturnValue(42)

    const { installPlugin, listPlugins } = await import('./pluginManager')

    const zipPath = createPluginZip({ id: '../../chaterm-rce-escaped' })
    expect(() => installPlugin(zipPath)).toThrow('invalid plugin id')

    expect(fs.existsSync(path.join(userData, 'chaterm-rce-escaped-1.0.0'))).toBe(false)
    expect(listPlugins()).toHaveLength(0)
  })

  it('rejects packages whose version escapes the plugins directory', async () => {
    const userData = makeTempDir('userData-')
    mockUserDataPath.mockReturnValue(userData)
    mockGetCurrentUserId.mockReturnValue(42)

    const { installPlugin } = await import('./pluginManager')

    const zipPath = createPluginZip({ id: 'x', version: 'y/../../chaterm-overwrite-canary' })
    expect(() => installPlugin(zipPath)).toThrow('invalid plugin version')
  })

  it('ignores registry entries pointing outside the plugins root', async () => {
    const userData = makeTempDir('userData-')
    mockUserDataPath.mockReturnValue(userData)
    mockGetCurrentUserId.mockReturnValue(42)

    const registryPath = path.join(userData, 'chaterm_db', '42', 'plugins', 'plugins.json')
    fs.mkdirSync(path.dirname(registryPath), { recursive: true })
    fs.writeFileSync(
      registryPath,
      JSON.stringify([
        { id: 'evil', displayName: 'Evil', version: '1.0.0', path: path.join(userData, 'chaterm-rce-escaped-1.0.0'), enabled: true },
        { id: 'good', displayName: 'Good', version: '1.0.0', path: path.join(userData, 'chaterm_db', '42', 'plugins', 'good-1.0.0'), enabled: true }
      ])
    )

    const { listPlugins } = await import('./pluginManager')
    const registry = listPlugins()

    expect(registry.map((p) => p.id)).toEqual(['good'])
  })

  it('does not delete escaped paths on uninstall', async () => {
    const userData = makeTempDir('userData-')
    mockUserDataPath.mockReturnValue(userData)
    mockGetCurrentUserId.mockReturnValue(42)

    const victimDir = path.join(userData, 'chaterm-overwrite-canary')
    fs.mkdirSync(victimDir, { recursive: true })
    fs.writeFileSync(path.join(victimDir, 'keep.txt'), 'keep')

    const registryPath = path.join(userData, 'chaterm_db', '42', 'plugins', 'plugins.json')
    fs.mkdirSync(path.dirname(registryPath), { recursive: true })
    fs.writeFileSync(registryPath, JSON.stringify([{ id: 'evil', displayName: 'Evil', version: '1.0.0', path: victimDir, enabled: true }]))

    const { uninstallPlugin } = await import('./pluginManager')
    uninstallPlugin('evil', { force: true })

    expect(fs.existsSync(path.join(victimDir, 'keep.txt'))).toBe(true)
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

  // isPathInside is used both as a registry containment gate (where "equal to root" must be
  // rejected) and as a building block for plugin-relative resolution in pluginLoader (where
  // the plugin root itself is legitimate). Pin the semantics so the two uses don't drift.
  describe('isPathInside', () => {
    const root = path.resolve('/mock/plugins/p1-1.0.0')

    it('rejects a path equal to the root', async () => {
      const { isPathInside } = await import('./pluginManager')
      expect(isPathInside(root, root)).toBe(false)
    })

    it('accepts a nested path', async () => {
      const { isPathInside } = await import('./pluginManager')
      expect(isPathInside(path.resolve(root, 'index.js'), root)).toBe(true)
    })

    it('rejects a parent escape and unrelated absolute paths', async () => {
      const { isPathInside } = await import('./pluginManager')
      expect(isPathInside(path.resolve(root, '..', 'escaped'), root)).toBe(false)
      expect(isPathInside(path.resolve(root, '..', '..', 'chaterm-rce-escaped-1.0.0'), root)).toBe(false)
      expect(isPathInside(path.resolve('/mock/elsewhere/x'), root)).toBe(false)
      expect(isPathInside('', root)).toBe(false)
    })

    // path.relative returns '..foo' for these, so a plain startsWith('..') would
    // wrongly reject a name that is actually inside the root.
    it('accepts names that merely begin with dots', async () => {
      const { isPathInside } = await import('./pluginManager')
      expect(isPathInside(path.resolve(root, '..foo-1.0.0'), root)).toBe(true)
      expect(isPathInside(path.resolve(root, '..foo', 'bar.js'), root)).toBe(true)
      expect(isPathInside(path.resolve(root, '.cache', 'x.chaterm'), root)).toBe(true)
    })
  })
})
