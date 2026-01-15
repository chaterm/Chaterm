import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as fs from 'fs'
import path from 'path'
import os from 'os'

// Mock electron and all problematic transitive dependencies first
vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/mock/app/path'),
    getPath: vi.fn(() => '/mock/path')
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

vi.mock('./pluginManager', () => ({
  listPlugins: vi.fn(),
  clearVersionProviders: vi.fn(),
  clearInstallHints: vi.fn(),
  registerInstallHint: vi.fn(),
  registerVersionProvider: vi.fn()
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
})
