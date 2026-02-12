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
let mockKbReadmeSeedContent = 'kb-readme-v1'
let mockMarkdownGuideSeedContent = 'markdown-guide-v1'
let mockMarkdownGuideImageSeedContent = Buffer.from([0x89, 0x50, 0x4e, 0x47])
let mockMarkdownGuideRelPathEn = 'Markdown Guide.md'
let mockMarkdownGuideRelPathZh = 'Markdown语法指南.md'
const mockUserConfig = vi.hoisted(() => ({ language: 'en-US' }))

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
        },
        {
          id: 'knowledge_base_readme',
          defaultRelPath: 'README.md',
          getContent: () => mockKbReadmeSeedContent
        },
        {
          id: 'markdown_guide',
          defaultRelPath: 'Markdown Guide.md',
          getDefaultRelPath: (isChinese: boolean) => (isChinese ? mockMarkdownGuideRelPathZh : mockMarkdownGuideRelPathEn),
          getContent: () => mockMarkdownGuideSeedContent
        },
        {
          id: 'markdown_guide_image',
          defaultRelPath: 'images/interface.png',
          getBinaryContent: () => mockMarkdownGuideImageSeedContent
        }
      ]
    }
  }
})

vi.mock('../../agent/core/storage/state', () => {
  return {
    getUserConfig: vi.fn(async () => mockUserConfig)
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

function getKbReadmePath() {
  return path.join(getKbRoot(), 'README.md')
}

function getMarkdownGuidePath() {
  return path.join(getKbRoot(), 'Markdown Guide.md')
}

function getMarkdownGuideImagePath() {
  return path.join(getKbRoot(), 'images', 'interface.png')
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

async function loadAllHandlers() {
  handlers.clear()
  const mod = await import('../knowledgebase')
  mod.registerKnowledgeBaseHandlers()
  return {
    ensureRoot: handlers.get('kb:ensure-root')!,
    readFile: handlers.get('kb:read-file')!,
    writeFile: handlers.get('kb:write-file')!,
    createFile: handlers.get('kb:create-file')!,
    createImage: handlers.get('kb:create-image')!,
    rename: handlers.get('kb:rename')!,
    del: handlers.get('kb:delete')!,
    move: handlers.get('kb:move')!
  }
}

describe('KnowledgeBase file operations', () => {
  const tempDirs: string[] = []

  beforeEach(async () => {
    handlers.clear()
    vi.clearAllMocks()
    vi.resetModules()

    mockDefaultCommandsVersion = 1
    mockSummarySeedContent = 'seed-v1'
    mockMarkdownGuideImageSeedContent = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    mockMarkdownGuideRelPathEn = 'Markdown Guide.md'
    mockMarkdownGuideRelPathZh = 'Markdown语法指南.md'
    mockUserConfig.language = 'en-US'

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-file-ops-'))
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

  it('reads file with utf-8 encoding by default', async () => {
    const { ensureRoot, readFile, writeFile } = await loadAllHandlers()
    await ensureRoot({} as any)

    // Create a text file
    await writeFile({} as any, { relPath: 'test.txt', content: 'hello world' })

    // Read with default encoding
    const result = await readFile({} as any, { relPath: 'test.txt' })
    expect(result.content).toBe('hello world')
    expect(result.mtimeMs).toBeDefined()
  })

  it('reads file with base64 encoding', async () => {
    const { ensureRoot, readFile } = await loadAllHandlers()
    await ensureRoot({} as any)

    // Create a binary file directly
    const kbRoot = path.join(mockUserDataPath, 'knowledgebase')
    const testImagePath = path.join(kbRoot, 'test.png')
    const testData = Buffer.from([0x89, 0x50, 0x4e, 0x47]) // PNG header bytes
    await fsp.writeFile(testImagePath, testData)

    // Read with base64 encoding
    const result = await readFile({} as any, { relPath: 'test.png', encoding: 'base64' })
    expect(result.content).toBe(testData.toString('base64'))
    expect(result.mimeType).toBe('image/png')
    expect(result.isImage).toBe(true)
    expect(result.mtimeMs).toBeDefined()
  })

  it('writes file with utf-8 encoding by default', async () => {
    const { ensureRoot, writeFile } = await loadAllHandlers()
    await ensureRoot({} as any)

    await writeFile({} as any, { relPath: 'test.txt', content: 'hello world' })

    const kbRoot = path.join(mockUserDataPath, 'knowledgebase')
    const content = await fsp.readFile(path.join(kbRoot, 'test.txt'), 'utf-8')
    expect(content).toBe('hello world')
  })

  it('writes file with base64 encoding', async () => {
    const { ensureRoot, writeFile } = await loadAllHandlers()
    await ensureRoot({} as any)

    const testData = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const base64Content = testData.toString('base64')

    await writeFile({} as any, { relPath: 'test.png', content: base64Content, encoding: 'base64' })

    const kbRoot = path.join(mockUserDataPath, 'knowledgebase')
    const savedContent = await fsp.readFile(path.join(kbRoot, 'test.png'))
    expect(savedContent.equals(testData)).toBe(true)
  })

  it('creates image file from base64 data', async () => {
    const { ensureRoot, createImage } = await loadAllHandlers()
    await ensureRoot({} as any)

    const testData = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const base64Content = testData.toString('base64')

    const result = await createImage({} as any, { relDir: '', name: 'image.png', base64: base64Content })
    expect(result.relPath).toBe('image.png')

    const kbRoot = path.join(mockUserDataPath, 'knowledgebase')
    const savedContent = await fsp.readFile(path.join(kbRoot, 'image.png'))
    expect(savedContent.equals(testData)).toBe(true)
  })

  it('creates image in subdirectory', async () => {
    const { ensureRoot, createImage } = await loadAllHandlers()
    await ensureRoot({} as any)

    const testData = Buffer.from([0xff, 0xd8, 0xff, 0xe0]) // JPEG header
    const base64Content = testData.toString('base64')

    const result = await createImage({} as any, { relDir: 'images', name: 'photo.jpg', base64: base64Content })
    expect(result.relPath).toBe('images/photo.jpg')

    const kbRoot = path.join(mockUserDataPath, 'knowledgebase')
    const savedContent = await fsp.readFile(path.join(kbRoot, 'images', 'photo.jpg'))
    expect(savedContent.equals(testData)).toBe(true)
  })

  it('generates unique name when image already exists', async () => {
    const { ensureRoot, createImage } = await loadAllHandlers()
    await ensureRoot({} as any)

    const testData = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const base64Content = testData.toString('base64')

    // Create first image
    await createImage({} as any, { relDir: '', name: 'image.png', base64: base64Content })

    // Create second image with same name
    const result = await createImage({} as any, { relDir: '', name: 'image.png', base64: base64Content })
    expect(result.relPath).toBe('image (1).png')
  })

  it('allows renaming when only case changes', async () => {
    const { ensureRoot, writeFile, rename } = await loadAllHandlers()
    await ensureRoot({} as any)

    await writeFile({} as any, { relPath: 'README.md', content: 'original' })

    const res = await rename({} as any, { relPath: 'README.md', newName: 'readme.md' })
    expect(res.relPath).toBe('readme.md')

    const kbRoot = path.join(mockUserDataPath, 'knowledgebase')
    expect(fs.existsSync(path.join(kbRoot, 'readme.md'))).toBe(true)
  })

  it('rejects invalid file names for image creation', async () => {
    const { ensureRoot, createImage } = await loadAllHandlers()
    await ensureRoot({} as any)

    const base64Content = Buffer.from([0x89, 0x50]).toString('base64')

    await expect(createImage({} as any, { relDir: '', name: '../invalid.png', base64: base64Content })).rejects.toThrow('Invalid file name')
  })

  it('returns correct mime types for different image formats', async () => {
    const { ensureRoot, readFile } = await loadAllHandlers()
    await ensureRoot({} as any)

    const kbRoot = path.join(mockUserDataPath, 'knowledgebase')
    const testData = Buffer.from([0x00, 0x00, 0x00, 0x00])

    // Test different image extensions
    const imageTypes = [
      { ext: '.png', mime: 'image/png' },
      { ext: '.jpg', mime: 'image/jpeg' },
      { ext: '.jpeg', mime: 'image/jpeg' },
      { ext: '.gif', mime: 'image/gif' },
      { ext: '.webp', mime: 'image/webp' },
      { ext: '.bmp', mime: 'image/bmp' },
      { ext: '.svg', mime: 'image/svg+xml' }
    ]

    for (const { ext, mime } of imageTypes) {
      const fileName = `test${ext}`
      await fsp.writeFile(path.join(kbRoot, fileName), testData)
      const result = await readFile({} as any, { relPath: fileName, encoding: 'base64' })
      expect(result.mimeType).toBe(mime)
      expect(result.isImage).toBe(true)
    }
  })
})

describe('KnowledgeBase default commands initialization (scheme A)', () => {
  const tempDirs: string[] = []

  beforeEach(async () => {
    handlers.clear()
    vi.clearAllMocks()
    vi.resetModules()

    mockDefaultCommandsVersion = 1
    mockSummarySeedContent = 'seed-v1'
    mockKbReadmeSeedContent = 'kb-readme-v1'
    mockMarkdownGuideSeedContent = 'markdown-guide-v1'
    mockMarkdownGuideRelPathEn = 'Markdown Guide.md'
    mockMarkdownGuideRelPathZh = 'Markdown语法指南.md'
    mockUserConfig.language = 'en-US'

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

    const kbReadmePath = getKbReadmePath()
    expect(fs.existsSync(kbReadmePath)).toBe(true)
    expect(await readText(kbReadmePath)).toBe('kb-readme-v1')

    const mdGuidePath = getMarkdownGuidePath()
    expect(fs.existsSync(mdGuidePath)).toBe(true)
    expect(await readText(mdGuidePath)).toBe('markdown-guide-v1')

    const mdGuideImagePath = getMarkdownGuideImagePath()
    expect(fs.existsSync(mdGuideImagePath)).toBe(true)
    const imageContent = await fsp.readFile(mdGuideImagePath)
    expect(imageContent.equals(mockMarkdownGuideImageSeedContent)).toBe(true)

    const metaPath = getMetaPath()
    expect(fs.existsSync(metaPath)).toBe(true)
    const meta = await readMeta()
    expect(meta.version).toBe(1)
    expect(meta.seeds?.summary_to_doc?.relPath).toBe('commands/Summary to Doc.md')
    expect(typeof meta.seeds?.summary_to_doc?.lastSeedHash).toBe('string')
    expect(meta.seeds?.summary_to_doc?.lastSeedHash.length).toBeGreaterThan(0)

    expect(meta.seeds?.knowledge_base_readme?.relPath).toBe('README.md')
    expect(typeof meta.seeds?.knowledge_base_readme?.lastSeedHash).toBe('string')
    expect(meta.seeds?.knowledge_base_readme?.lastSeedHash.length).toBeGreaterThan(0)

    expect(meta.seeds?.markdown_guide?.relPath).toBe('Markdown Guide.md')
    expect(typeof meta.seeds?.markdown_guide?.lastSeedHash).toBe('string')
    expect(meta.seeds?.markdown_guide?.lastSeedHash.length).toBeGreaterThan(0)

    expect(meta.seeds?.markdown_guide_image?.relPath).toBe('images/interface.png')
    expect(typeof meta.seeds?.markdown_guide_image?.lastSeedHash).toBe('string')
    expect(meta.seeds?.markdown_guide_image?.lastSeedHash.length).toBeGreaterThan(0)
  })

  it('uses user language to select default seed path', async () => {
    mockUserConfig.language = 'zh-CN'
    const { ensureRoot } = await loadHandlers()
    await ensureRoot({} as any)

    const zhGuidePath = path.join(getKbRoot(), mockMarkdownGuideRelPathZh)
    expect(fs.existsSync(zhGuidePath)).toBe(true)
    const meta = await readMeta()
    expect(meta.seeds?.markdown_guide?.relPath).toBe(mockMarkdownGuideRelPathZh)
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
