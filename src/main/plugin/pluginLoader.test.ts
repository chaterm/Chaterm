import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as fs from 'fs'
import path from 'path'
import os from 'os'

const { mockBrowserWindow } = vi.hoisted(() => ({
  mockBrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
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
    listPlugins: vi.fn(),
    clearVersionProviders: vi.fn(),
    clearInstallHints: vi.fn(),
    registerInstallHint: vi.fn(),
    registerVersionProvider: vi.fn(),
    isTrustedPluginPath: vi.fn(() => true)
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

    const { listPlugins, registerInstallHint } = await import('./pluginManager')
    vi.mocked(listPlugins).mockReturnValue([{ id: 'p1', displayName: 'p1', version: '1.0.0', path: root, enabled: true }])

    const { loadAllPlugins } = await import('./pluginLoader')
    await loadAllPlugins()

    expect(registerInstallHint).toHaveBeenCalledWith('p1', { message: 'ok' })
  })

  it('refuses to require a plugin whose registry path is outside the plugins root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-escaped-'))
    tmpDirs.push(root)
    fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({ id: 'evil', displayName: 'evil', version: '1.0.0', main: 'index.js' }))
    fs.writeFileSync(path.join(root, 'index.js'), "module.exports.register = () => { throw new Error('should never run') }")

    const { listPlugins, isTrustedPluginPath } = await import('./pluginManager')
    vi.mocked(listPlugins).mockReturnValue([{ id: 'evil', displayName: 'evil', version: '1.0.0', path: root, enabled: true }])
    vi.mocked(isTrustedPluginPath).mockReturnValue(false)

    const { loadAllPlugins } = await import('./pluginLoader')
    await expect(loadAllPlugins()).resolves.toBeUndefined()
  })

  it('refuses a main entry that escapes the plugin directory', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-entry-'))
    tmpDirs.push(root)
    fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({ id: 'p2', displayName: 'p2', version: '1.0.0', main: '../outside.js' }))
    fs.writeFileSync(path.join(path.dirname(root), 'outside.js'), "module.exports.register = () => { throw new Error('should never run') }")

    const { listPlugins, registerInstallHint, isTrustedPluginPath } = await import('./pluginManager')
    vi.mocked(listPlugins).mockReturnValue([{ id: 'p2', displayName: 'p2', version: '1.0.0', path: root, enabled: true }])
    // Must be true, otherwise this asserts the registry-path gate instead of the entry gate.
    vi.mocked(isTrustedPluginPath).mockReturnValue(true)

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

    const { listPlugins, registerInstallHint, isTrustedPluginPath } = await import('./pluginManager')
    vi.mocked(listPlugins).mockReturnValue([{ id: 'p3', displayName: 'p3', version: '1.0.0', path: root, enabled: true }])
    // clearAllMocks() does not undo mockReturnValue from earlier tests, so set it explicitly.
    vi.mocked(isTrustedPluginPath).mockReturnValue(true)

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
