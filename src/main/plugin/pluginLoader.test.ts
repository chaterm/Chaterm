import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as fs from 'fs'
import path from 'path'
import os from 'os'

const { mockBrowserWindow } = vi.hoisted(() => ({
  mockBrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

const pluginMocks = vi.hoisted(() => ({
  listPlugins: vi.fn(),
  clearVersionProviders: vi.fn(),
  clearInstallHints: vi.fn(),
  registerInstallHint: vi.fn(),
  registerVersionProvider: vi.fn(),
  isTrustedPluginPath: vi.fn(() => true)
}))

// Mock electron and all problematic transitive dependencies first
vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/mock/app/path'),
    getPath: vi.fn(() => '/mock/path')
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: mockBrowserWindow
}))

vi.mock('./pluginManager', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    listPlugins: pluginMocks.listPlugins,
    clearVersionProviders: pluginMocks.clearVersionProviders,
    clearInstallHints: pluginMocks.clearInstallHints,
    registerInstallHint: pluginMocks.registerInstallHint,
    registerVersionProvider: pluginMocks.registerVersionProvider,
    isTrustedPluginPath: pluginMocks.isTrustedPluginPath
  }
})

vi.mock('../config/edition', () => ({
  getUserDataPath: () => '/mock/userData'
}))

vi.mock('../storage/db/connection', () => ({
  getCurrentUserId: () => 42,
  getGuestUserId: () => 999
}))

vi.mock('../ssh/capabilityRegistry', () => ({
  capabilityRegistry: {
    clearBastions: vi.fn(),
    registerBastion: vi.fn()
  }
}))

// Mock pluginGlobalState to avoid database dependencies
vi.mock('./pluginGlobalState', () => ({
  PluginStorageContext: class {
    globalState = { get: vi.fn(), update: vi.fn(), keys: vi.fn() }
    workspaceState = { get: vi.fn(), update: vi.fn(), keys: vi.fn() }
    secrets = { get: vi.fn(), store: vi.fn(), delete: vi.fn() }
  }
}))

// Mock ssh2 to avoid native module issues
vi.mock('ssh2', () => ({
  Client: vi.fn()
}))

const tmpDirs: string[] = []

describe('pluginLoader async register', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true })
    tmpDirs.length = 0
    vi.clearAllMocks()
  })

  it('awaits async register before resolving', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-'))
    tmpDirs.push(root)
    fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({ id: 'p1', displayName: 'p1', version: '1.0.0', main: 'index.js' }))
    fs.writeFileSync(
      path.join(root, 'index.js'),
      "module.exports.register = async (host) => { await new Promise(r => setTimeout(r, 5)); host.registerInstallHint({ message: 'ok' }); }"
    )

    const { registerInstallHint } = await import('./pluginManager')
    pluginMocks.listPlugins.mockReturnValue([{ id: 'p1', displayName: 'p1', version: '1.0.0', path: root, enabled: true }])
    pluginMocks.isTrustedPluginPath.mockReturnValue(true)

    const { loadAllPlugins } = await import('./pluginLoader')
    await loadAllPlugins()

    expect(registerInstallHint).toHaveBeenCalledWith('p1', { message: 'ok' })
  })

  it('refuses to require a plugin whose registry path is outside the plugins root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-escaped-'))
    tmpDirs.push(root)
    fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({ id: 'evil', displayName: 'evil', version: '1.0.0', main: 'index.js' }))
    fs.writeFileSync(path.join(root, 'index.js'), "module.exports.register = () => { throw new Error('should never run') }")

    await import('./pluginManager')
    pluginMocks.listPlugins.mockReturnValue([{ id: 'evil', displayName: 'evil', version: '1.0.0', path: root, enabled: true }])
    pluginMocks.isTrustedPluginPath.mockReturnValue(false)

    const { loadAllPlugins } = await import('./pluginLoader')
    await expect(loadAllPlugins()).resolves.toBeUndefined()
  })

  it('refuses a main entry that escapes the plugin directory', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-entry-'))
    tmpDirs.push(root)
    fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({ id: 'p2', displayName: 'p2', version: '1.0.0', main: '../outside.js' }))
    fs.writeFileSync(path.join(path.dirname(root), 'outside.js'), "module.exports.register = () => { throw new Error('should never run') }")

    const { registerInstallHint } = await import('./pluginManager')
    pluginMocks.listPlugins.mockReturnValue([{ id: 'p2', displayName: 'p2', version: '1.0.0', path: root, enabled: true }])
    // Must be true, otherwise this asserts the registry-path gate instead of the entry gate.
    pluginMocks.isTrustedPluginPath.mockReturnValue(true)

    const { loadAllPlugins } = await import('./pluginLoader')
    await loadAllPlugins()

    expect(registerInstallHint).not.toHaveBeenCalled()
  })

  it('loads a plugin whose root is reached through a symlinked ancestor', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-symlink-'))
    tmpDirs.push(base)
    const realParent = path.join(base, 'real')
    const root = path.join(realParent, 'p4')
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({ id: 'p4', displayName: 'p4', version: '1.0.0', main: 'index.js' }))
    fs.writeFileSync(path.join(root, 'index.js'), "module.exports.register = (host) => { host.registerInstallHint({ message: 'via-symlink' }) }")

    const linkParent = path.join(base, 'link')
    try {
      fs.symlinkSync(realParent, linkParent, 'junction')
    } catch {
      // Unprivileged Windows runners may not be able to create links; the assertion below
      // is only meaningful when the symlink exists.
      return
    }

    const linkedRoot = path.join(linkParent, 'p4')

    const { registerInstallHint } = await import('./pluginManager')
    pluginMocks.listPlugins.mockReturnValue([{ id: 'p4', displayName: 'p4', version: '1.0.0', path: linkedRoot, enabled: true }])
    pluginMocks.isTrustedPluginPath.mockReturnValue(true)

    const { loadAllPlugins } = await import('./pluginLoader')
    await loadAllPlugins()

    expect(registerInstallHint).toHaveBeenCalledWith('p4', { message: 'via-symlink' })
  })

  it('refuses a plugin directory that is itself a symlink', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-linkroot-'))
    tmpDirs.push(base)
    const outside = path.join(base, 'outside')
    fs.mkdirSync(outside, { recursive: true })
    fs.writeFileSync(path.join(outside, 'plugin.json'), JSON.stringify({ id: 'p5', displayName: 'p5', version: '1.0.0', main: 'index.js' }))
    fs.writeFileSync(path.join(outside, 'index.js'), "module.exports.register = (host) => { host.registerInstallHint({ message: 'escaped' }) }")

    const linkedPluginDir = path.join(base, 'linked-plugin')
    try {
      fs.symlinkSync(outside, linkedPluginDir, 'junction')
    } catch {
      return
    }

    const { registerInstallHint } = await import('./pluginManager')
    pluginMocks.listPlugins.mockReturnValue([{ id: 'p5', displayName: 'p5', version: '1.0.0', path: linkedPluginDir, enabled: true }])
    pluginMocks.isTrustedPluginPath.mockReturnValue(true)

    const { loadAllPlugins } = await import('./pluginLoader')
    await loadAllPlugins()

    expect(registerInstallHint).not.toHaveBeenCalled()
  })

  it('resolves asAbsolutePath for the plugin root and rejects escapes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-abs-'))
    tmpDirs.push(root)
    fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({ id: 'p3', displayName: 'p3', version: '1.0.0', main: 'index.js' }))
    fs.writeFileSync(
      path.join(root, 'index.js'),
      `module.exports.register = (host) => {
        host.registerInstallHint({
          message: JSON.stringify({
            dot: host.asAbsolutePath('.'),
            nested: host.asAbsolutePath('assets/icon.svg'),
            escaped: (() => {
              try {
                host.asAbsolutePath('../../etc/passwd')
                return 'NOT_THROWN'
              } catch {
                return 'THREW'
              }
            })()
          })
        })
      }`
    )

    const { registerInstallHint } = await import('./pluginManager')
    pluginMocks.listPlugins.mockReturnValue([{ id: 'p3', displayName: 'p3', version: '1.0.0', path: root, enabled: true }])
    // clearAllMocks() does not undo mockReturnValue from earlier tests, so set it explicitly.
    pluginMocks.isTrustedPluginPath.mockReturnValue(true)

    const { loadAllPlugins } = await import('./pluginLoader')
    await loadAllPlugins()

    expect(registerInstallHint).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(vi.mocked(registerInstallHint).mock.calls[0][1].message as string)
    // asAbsolutePath('.') must return the plugin root, not throw.
    expect(payload.dot).toBe(path.resolve(root))
    expect(payload.nested).toBe(path.resolve(root, 'assets/icon.svg'))
    expect(payload.escaped).toBe('THREW')
  })
})
