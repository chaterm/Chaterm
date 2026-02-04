import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import path from 'path'
import os from 'os'

type IpcHandler = (evt: any, payload?: any) => any

let mockUserDataPath = ''
const handlers = new Map<string, IpcHandler>()

// Mutable seed mock so we can simulate version upgrades in a single test file.
let mockDefaultCommandsVersion = 1
let mockSummarySeedContent = 'seed-v1'

vi.mock('electron', () => {
  return {
    app: {
      getPath: (key: string) => {
        if (key === 'userData') return mockUserDataPath
        throw new Error(`Unexpected app.getPath(${key})`)
      }
    },
    ipcMain: {
      handle: (channel: string, fn: IpcHandler) => {
        handlers.set(channel, fn)
      }
    }
  }
})

vi.mock('../knowledgebase/default-seeds', () => {
  return {
    get KB_DEFAULT_SEEDS_VERSION() {
      return mockDefaultCommandsVersion
    },
    get KB_DEFAULT_SEEDS() {
      return [
        {
          id: 'summary_to_doc',
          defaultRelPath: 'commands/Summary to Doc.md',
          getContent: () => mockSummarySeedContent
        }
      ]
    }
  }
})

function getKbRoot() {
  return path.join(mockUserDataPath, 'knowledgebase')
}

function getCommandsDir() {
  return path.join(getKbRoot(), 'commands')
}

function getMetaPath() {
  return path.join(getKbRoot(), '.kb-default-seeds-meta.json')
}

async function loadHandlers() {
  handlers.clear()
  // KnowledgeBase module entry (folder-based).
  const mod = await import('../knowledgebase')
  mod.registerKnowledgeBaseHandlers()
  const ensureRoot = handlers.get('kb:ensure-root')
  const rename = handlers.get('kb:rename')
  const del = handlers.get('kb:delete')
  const move = handlers.get('kb:move')
  if (!ensureRoot || !rename || !del || !move) {
    throw new Error('Expected kb handlers to be registered')
  }
  return { ensureRoot, rename, del, move }
}

async function readText(absPath: string) {
  return await fsp.readFile(absPath, 'utf-8')
}

async function readMeta() {
  const raw = await readText(getMetaPath())
  return JSON.parse(raw) as any
}

describe('KnowledgeBase default commands initialization (scheme A)', () => {
  const tempDirs: string[] = []

  beforeEach(async () => {
    handlers.clear()
    vi.clearAllMocks()
    vi.resetModules()

    mockDefaultCommandsVersion = 1
    mockSummarySeedContent = 'seed-v1'

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-default-commands-'))
    tempDirs.push(dir)
    mockUserDataPath = dir
  })

  afterEach(async () => {
    for (const dir of tempDirs) {
      try {
        await fsp.rm(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })

  it('creates default command and writes meta on first init', async () => {
    const { ensureRoot } = await loadHandlers()
    await ensureRoot({} as any)

    const cmdPath = path.join(getCommandsDir(), 'Summary to Doc.md')
    expect(fs.existsSync(cmdPath)).toBe(true)
    expect(await readText(cmdPath)).toBe('seed-v1')

    const metaPath = getMetaPath()
    expect(fs.existsSync(metaPath)).toBe(true)
    const meta = await readMeta()
    expect(meta.version).toBe(1)
    expect(meta.seeds?.summary_to_doc?.relPath).toBe('commands/Summary to Doc.md')
    expect(typeof meta.seeds?.summary_to_doc?.lastSeedHash).toBe('string')
    expect(meta.seeds?.summary_to_doc?.lastSeedHash.length).toBeGreaterThan(0)
  })

  it('does not overwrite user-modified content when version upgrades', async () => {
    // init v1
    {
      const { ensureRoot } = await loadHandlers()
      await ensureRoot({} as any)
    }

    const cmdPath = path.join(getCommandsDir(), 'Summary to Doc.md')
    await fsp.writeFile(cmdPath, 'user-edited', 'utf-8')

    // upgrade to v2
    mockDefaultCommandsVersion = 2
    mockSummarySeedContent = 'seed-v2'
    vi.resetModules()

    const { ensureRoot } = await loadHandlers()
    await ensureRoot({} as any)

    expect(await readText(cmdPath)).toBe('user-edited')
    const meta = await readMeta()
    expect(meta.version).toBe(2)
  })

  it('after user renames the default file, init must not recreate it at default name', async () => {
    // init v1
    {
      const { ensureRoot } = await loadHandlers()
      await ensureRoot({} as any)
    }

    const { rename } = await loadHandlers()
    const oldRelPath = 'commands/Summary to Doc.md'
    const newName = 'Summary Renamed.md'
    const res = await rename({} as any, { relPath: oldRelPath, newName })
    expect(res?.relPath).toBe('commands/Summary Renamed.md')

    const oldAbs = path.join(getCommandsDir(), 'Summary to Doc.md')
    const newAbs = path.join(getCommandsDir(), 'Summary Renamed.md')
    expect(fs.existsSync(oldAbs)).toBe(false)
    expect(fs.existsSync(newAbs)).toBe(true)

    // upgrade to v2, should NOT recreate old name
    mockDefaultCommandsVersion = 2
    mockSummarySeedContent = 'seed-v2'
    vi.resetModules()

    const { ensureRoot } = await loadHandlers()
    await ensureRoot({} as any)

    expect(fs.existsSync(oldAbs)).toBe(false)
    expect(fs.existsSync(newAbs)).toBe(true)
  })

  it('after user deletes the default file, init must not recreate it', async () => {
    // init v1
    {
      const { ensureRoot } = await loadHandlers()
      await ensureRoot({} as any)
    }

    const { del } = await loadHandlers()
    await del({} as any, { relPath: 'commands/Summary to Doc.md', recursive: false })

    const cmdPath = path.join(getCommandsDir(), 'Summary to Doc.md')
    expect(fs.existsSync(cmdPath)).toBe(false)

    // upgrade to v2, should NOT recreate
    mockDefaultCommandsVersion = 2
    mockSummarySeedContent = 'seed-v2'
    vi.resetModules()

    const { ensureRoot } = await loadHandlers()
    await ensureRoot({} as any)

    expect(fs.existsSync(cmdPath)).toBe(false)
    const meta = await readMeta()
    expect(typeof meta.seeds?.summary_to_doc?.deletedAt).toBe('string')
  })

  it('after user moves the default file, init must not recreate it at default location', async () => {
    // init v1
    {
      const { ensureRoot } = await loadHandlers()
      await ensureRoot({} as any)
    }

    const { move } = await loadHandlers()
    const res = await move({} as any, { srcRelPath: 'commands/Summary to Doc.md', dstRelDir: '' })
    expect(res?.relPath).toBe('Summary to Doc.md')

    const movedAbs = path.join(getKbRoot(), 'Summary to Doc.md')
    const oldAbs = path.join(getCommandsDir(), 'Summary to Doc.md')
    expect(fs.existsSync(movedAbs)).toBe(true)
    expect(fs.existsSync(oldAbs)).toBe(false)

    // upgrade to v2, should NOT recreate default path
    mockDefaultCommandsVersion = 2
    mockSummarySeedContent = 'seed-v2'
    vi.resetModules()

    const { ensureRoot } = await loadHandlers()
    await ensureRoot({} as any)

    expect(fs.existsSync(movedAbs)).toBe(true)
    expect(fs.existsSync(oldAbs)).toBe(false)
    expect(await readText(movedAbs)).toBe('seed-v2')

    const meta = await readMeta()
    expect(meta.seeds?.summary_to_doc?.relPath).toBe('Summary to Doc.md')
  })
})
