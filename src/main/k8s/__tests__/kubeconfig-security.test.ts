import * as fs from 'fs'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  tempRoot: '',
  handlers: new Map<string, (...args: any[]) => any>(),
  cluster: { kubeconfig_content: 'TEST-CREDENTIAL', kubeconfig_path: '', context_name: 'test' },
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  loadFromString: vi.fn()
}))

vi.mock('os', async () => ({ ...(await vi.importActual<typeof import('os')>('os')), tmpdir: () => state.tempRoot }))
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) }
})
vi.mock('@logging/index', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => state.handlers.set(channel, handler) },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('node-pty', () => ({ spawn: state.spawn }))
vi.mock('child_process', () => ({ spawnSync: state.spawnSync }))
vi.mock('../../services/k8s', () => ({ K8sManager: { getInstance: () => ({ getProxyConfig: () => null }) } }))
vi.mock('../../storage/db/chaterm.service', () => ({
  ChatermDatabaseService: {
    getInstance: async () => ({
      getK8sCluster: () => state.cluster,
      addK8sTerminalSession: vi.fn(),
      removeK8sTerminalSession: vi.fn()
    })
  }
}))
vi.mock('../../agent/integrations/k8s/ipc-handlers', () => ({ registerK8sAgentHandlers: vi.fn() }))
vi.mock('../../ssh/jumpserver/k8sNavigator', () => ({
  connectK8sAssetByIdentity: vi.fn(),
  closeK8sSession: vi.fn(),
  syncK8sAssetsFromBastion: vi.fn()
}))
vi.mock('../../ssh/jumpserver/state', () => ({ jumpserverK8sSessions: new Map() }))
vi.mock('../../ssh/jumpserver/streamManager', () => ({ executeCommandOnJumpServerExec: vi.fn() }))
vi.mock('@kubernetes/client-node', () => ({
  KubeConfig: class {
    loadFromString = state.loadFromString
    getContexts = () => []
    setCurrentContext = vi.fn()
    getCurrentContext = () => 'test'
    getCurrentCluster = () => null
  }
}))

const realFs = await vi.importActual<typeof import('fs')>('fs')
const realOs = await vi.importActual<typeof import('os')>('os')

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.mocked(fs.writeFileSync).mockImplementation(realFs.writeFileSync)
  state.tempRoot = fs.mkdtempSync(path.join(realOs.tmpdir(), 'chaterm-kube-test-'))
  state.handlers.clear()
  state.cluster = { kubeconfig_content: 'TEST-CREDENTIAL', kubeconfig_path: '', context_name: 'test' }
  state.spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' })
  state.spawn.mockImplementation(() => ({ onData: vi.fn(), onExit: vi.fn(), kill: vi.fn() }))
})

afterEach(() => {
  fs.rmSync(state.tempRoot, { recursive: true, force: true })
})

const expectPrivateConfig = (file: string) => {
  expect(path.dirname(path.dirname(file))).toBe(state.tempRoot)
  expect(path.basename(path.dirname(file))).toMatch(/^chaterm-kube-/)
  expect(fs.readFileSync(file, 'utf8')).toBe('TEST-CREDENTIAL')
  if (process.platform !== 'win32') {
    expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700)
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
  }
}

describe('temporary kubeconfig security', () => {
  it('creates unique private files even with a permissive umask and cleans up idempotently', async () => {
    const { createTemporaryKubeconfig } = await import('../../services/k8s/temporaryKubeconfig')
    const oldUmask = process.umask(0)
    try {
      const first = createTemporaryKubeconfig('TEST-CREDENTIAL')
      const second = createTemporaryKubeconfig('TEST-CREDENTIAL')
      expect(first.path).not.toBe(second.path)
      expectPrivateConfig(first.path)
      expectPrivateConfig(second.path)
      first.cleanup()
      first.cleanup()
      expect(fs.existsSync(path.dirname(first.path))).toBe(false)
      expect(fs.existsSync(second.path)).toBe(true)
      second.cleanup()
      expect(fs.readdirSync(state.tempRoot)).toEqual([])
    } finally {
      process.umask(oldUmask)
    }
  })

  it.each(['file', 'symlink'])('refuses a pre-existing %s without overwriting its contents', async (entryType) => {
    const { createTemporaryKubeconfig } = await import('../../services/k8s/temporaryKubeconfig')
    const canary = path.join(state.tempRoot, 'canary')
    realFs.writeFileSync(canary, 'ORIGINAL')
    vi.mocked(fs.writeFileSync).mockImplementationOnce((file, content, options) => {
      if (entryType === 'symlink') realFs.symlinkSync(canary, file as string)
      else realFs.writeFileSync(file, 'ORIGINAL', { mode: 0o666 })
      try {
        realFs.writeFileSync(file, content, options)
      } finally {
        expect(realFs.readFileSync(file, 'utf8')).toBe('ORIGINAL')
      }
    })
    expect(() => createTemporaryKubeconfig('TEST-CREDENTIAL')).toThrow(expect.objectContaining({ code: 'EEXIST' }))
    expect(fs.readFileSync(canary, 'utf8')).toBe('ORIGINAL')
    expect(fs.readdirSync(state.tempRoot)).toEqual(['canary'])
  })

  it('removes partial credentials and the directory if writing fails', async () => {
    const { createTemporaryKubeconfig } = await import('../../services/k8s/temporaryKubeconfig')
    vi.mocked(fs.writeFileSync).mockImplementationOnce((file, _content, options) => {
      realFs.writeFileSync(file, 'PARTIAL-CREDENTIAL', options)
      throw new Error('write failed')
    })
    expect(() => createTemporaryKubeconfig('TEST-CREDENTIAL')).toThrow('write failed')
    expect(fs.readdirSync(state.tempRoot)).toEqual([])
  })
})

describe('terminal kubeconfig lifecycle', () => {
  const createTerminal = async () => {
    const { registerK8sHandlers } = await import('../k8sHandle')
    registerK8sHandlers()
    return state.handlers.get('k8s:terminal:create')!({}, { id: 'terminal', clusterId: 'cluster' })
  }

  it.each(['close', 'exit'])('creates private credentials and removes its directory on %s', async (action) => {
    expect(await createTerminal()).toMatchObject({ success: true })
    const file = state.spawn.mock.calls[0][2].env.KUBECONFIG
    expectPrivateConfig(file)
    const terminal = state.spawn.mock.results[0].value
    if (action === 'close') {
      expect(await state.handlers.get('k8s:terminal:close')!({}, 'terminal')).toEqual({ success: true })
    }
    terminal.onExit.mock.calls[0][0]({ exitCode: 0 })
    expect(fs.existsSync(path.dirname(file))).toBe(false)
  })

  it.each(['preflight', 'spawn'])('removes credentials if %s fails during startup', async (stage) => {
    const failingCall = stage === 'spawn' ? state.spawn : state.spawnSync
    failingCall.mockImplementationOnce(() => {
      throw new Error('startup failed')
    })
    expect(await createTerminal()).toMatchObject({ success: false, error: 'startup failed' })
    expect(fs.readdirSync(state.tempRoot)).toEqual([])
  })

  it('never deletes a user-supplied kubeconfig in the temporary directory', async () => {
    const file = path.join(state.tempRoot, 'user-config.yaml')
    realFs.writeFileSync(file, 'USER-CONFIG')
    state.cluster.kubeconfig_path = file
    expect(await createTerminal()).toMatchObject({ success: true })
    expect(state.spawn.mock.calls[0][2].env.KUBECONFIG).toBe(file)
    await state.handlers.get('k8s:terminal:close')!({}, 'terminal')
    state.spawn.mock.results[0].value.onExit.mock.calls[0][0]({ exitCode: 0 })
    expect(fs.readFileSync(file, 'utf8')).toBe('USER-CONFIG')
  })
})

describe('agent kubeconfig lifecycle', () => {
  it('uses private credentials and removes them on cluster switch and cleanup', async () => {
    const { K8sAgentManager } = await import('../../agent/integrations/k8s')
    const agent = K8sAgentManager.getInstance()
    await agent.setCurrentCluster('cluster', 'test', undefined, 'TEST-CREDENTIAL')
    const firstDirectory = path.join(state.tempRoot, fs.readdirSync(state.tempRoot)[0])
    expectPrivateConfig(path.join(firstDirectory, 'kubeconfig.yaml'))
    const command = agent.executeKubectl('get pods')
    expect(state.spawn.mock.calls[0][2].env.KUBECONFIG).toBe(path.join(firstDirectory, 'kubeconfig.yaml'))
    state.spawn.mock.results[0].value.onExit.mock.calls[0][0]({ exitCode: 0 })
    expect(await command).toMatchObject({ success: true })

    await agent.setCurrentCluster('cluster', 'test', undefined, 'TEST-CREDENTIAL')
    expect(fs.existsSync(firstDirectory)).toBe(false)
    const secondDirectory = path.join(state.tempRoot, fs.readdirSync(state.tempRoot)[0])
    expect(secondDirectory).not.toBe(firstDirectory)
    expectPrivateConfig(path.join(secondDirectory, 'kubeconfig.yaml'))
    agent.cleanup()
    agent.cleanup()
    expect(fs.readdirSync(state.tempRoot)).toEqual([])
  })

  it('removes temporary credentials if kubeconfig initialization fails', async () => {
    const { K8sAgentManager } = await import('../../agent/integrations/k8s')
    state.loadFromString.mockImplementationOnce(() => {
      throw new Error('invalid config')
    })
    await expect(K8sAgentManager.getInstance().setCurrentCluster('cluster', 'test', undefined, 'TEST-CREDENTIAL')).rejects.toThrow('invalid config')
    expect(fs.readdirSync(state.tempRoot)).toEqual([])
  })

  it('preserves a user-supplied temporary-directory config across switching and cleanup', async () => {
    const { K8sAgentManager } = await import('../../agent/integrations/k8s')
    const agent = K8sAgentManager.getInstance()
    const file = path.join(state.tempRoot, 'user-config.yaml')
    realFs.writeFileSync(file, 'USER-CONFIG')
    await agent.setCurrentCluster('cluster', 'test', file)
    await agent.setCurrentCluster('next', 'test', file)
    agent.cleanup()
    expect(fs.readFileSync(file, 'utf8')).toBe('USER-CONFIG')
  })
})
