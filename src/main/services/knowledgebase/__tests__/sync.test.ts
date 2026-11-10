import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fsp from 'fs/promises'
import path from 'path'
import os from 'os'
import {
  isKbSyncExcludedRelPath,
  diffManifest,
  listAllKbFilesRecursive,
  readLocalSnapshot,
  writeLocalSnapshot,
  __testOnly,
  DELETE_BATCH_SIZE,
  UploadItemStatus,
  DeleteItemStatus,
  parseKbUploadStatus,
  parseKbDeleteStatus,
  buildSnapshotEntriesAfterUpload,
  adjustUsedBytesAfterUploadOk,
  decideDownloadAction,
  runKbFullSync,
  type KbManifestEntry
} from '../sync'

let mockUserDataPath = ''

const apiClientModuleMock = vi.hoisted(() => ({
  ApiClient: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => {
      if (key === 'userData') return mockUserDataPath
      throw new Error(`Unexpected app.getPath(${key})`)
    }
  }
}))

vi.mock('../../../storage/data_sync/core/ApiClient', () => apiClientModuleMock)

vi.mock('../index', () => ({
  getKnowledgeBaseRoot: () => path.join(mockUserDataPath, 'knowledgebase'),
  IMAGE_EXTS: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']),
  getKbSearchManager: () => null
}))

describe('isKbSyncExcludedRelPath', () => {
  it('returns true for .kb-default-seeds-meta.json', () => {
    expect(isKbSyncExcludedRelPath('.kb-default-seeds-meta.json')).toBe(true)
    expect(isKbSyncExcludedRelPath('/.kb-default-seeds-meta.json')).toBe(true)
    expect(isKbSyncExcludedRelPath('subdir\\.kb-default-seeds-meta.json')).toBe(true)
  })

  it('returns false for other paths', () => {
    expect(isKbSyncExcludedRelPath('README.md')).toBe(false)
    expect(isKbSyncExcludedRelPath('commands/Summary to Doc.md')).toBe(false)
    expect(isKbSyncExcludedRelPath('.other-hidden')).toBe(false)
  })
})

describe('diffManifest', () => {
  it('reports all as toUpload when L_last is null', () => {
    const L_now: KbManifestEntry[] = [
      { relPath: 'a.md', mtimeMs: 100, size: 10 },
      { relPath: 'b.md', mtimeMs: 200, size: 20 }
    ]
    const { toUpload, toDelete } = diffManifest(L_now, null)
    expect(toUpload).toHaveLength(2)
    expect(toDelete).toHaveLength(0)
  })

  it('reports new and modified as toUpload, removed as toDelete', () => {
    const L_now: KbManifestEntry[] = [
      { relPath: 'a.md', mtimeMs: 150, size: 10 },
      { relPath: 'b.md', mtimeMs: 200, size: 20 }
    ]
    const L_last: KbManifestEntry[] = [
      { relPath: 'a.md', mtimeMs: 100, size: 10 },
      { relPath: 'c.md', mtimeMs: 300, size: 30 }
    ]
    const { toUpload, toDelete } = diffManifest(L_now, L_last)
    expect(toUpload).toHaveLength(2)
    expect(toUpload.map((e) => e.relPath).sort()).toEqual(['a.md', 'b.md'])
    expect(toDelete).toEqual(['c.md'])
  })

  it('does not include unchanged files in toUpload', () => {
    const L_now: KbManifestEntry[] = [{ relPath: 'a.md', mtimeMs: 100, size: 10 }]
    const L_last: KbManifestEntry[] = [{ relPath: 'a.md', mtimeMs: 100, size: 10 }]
    const { toUpload, toDelete } = diffManifest(L_now, L_last)
    expect(toUpload).toHaveLength(0)
    expect(toDelete).toHaveLength(0)
  })
})

describe('snapshot read/write', () => {
  beforeEach(async () => {
    mockUserDataPath = path.join(os.tmpdir(), `kb-sync-test-${Date.now()}`)
    await fsp.mkdir(mockUserDataPath, { recursive: true })
  })

  it('writeLocalSnapshot creates file and readLocalSnapshot returns data', async () => {
    const entries: KbManifestEntry[] = [{ relPath: 'a.md', mtimeMs: 100, size: 10 }]
    await writeLocalSnapshot(entries)
    const snap = await readLocalSnapshot()
    expect(snap).not.toBeNull()
    expect(snap!.entries).toHaveLength(1)
    expect(snap!.entries[0].relPath).toBe('a.md')
    expect(typeof snap!.updatedAt).toBe('number')
  })

  it('readLocalSnapshot returns null when file does not exist', async () => {
    const snap = await readLocalSnapshot()
    expect(snap).toBeNull()
  })
})

describe('listAllKbFilesRecursive', () => {
  beforeEach(async () => {
    mockUserDataPath = path.join(os.tmpdir(), `kb-sync-list-${Date.now()}`)
    const kbRoot = path.join(mockUserDataPath, 'knowledgebase')
    await fsp.mkdir(path.join(kbRoot, 'commands'), { recursive: true })
    await fsp.writeFile(path.join(kbRoot, 'a.md'), 'a', 'utf-8')
    await fsp.writeFile(path.join(kbRoot, '.kb-default-seeds-meta.json'), '{}', 'utf-8')
    await fsp.writeFile(path.join(kbRoot, 'commands', 'b.md'), 'b', 'utf-8')
    await fsp.writeFile(path.join(kbRoot, 'other.xyz'), 'x', 'utf-8')
  })

  it('returns all files except meta file regardless of extension', async () => {
    const entries = await listAllKbFilesRecursive()
    const relPaths = entries.map((e) => e.relPath).sort()
    expect(relPaths).not.toContain('.kb-default-seeds-meta.json')
    expect(relPaths).toContain('a.md')
    expect(relPaths).toContain('commands/b.md')
    expect(relPaths).toContain('other.xyz')
    expect(entries.every((e) => typeof e.mtimeMs === 'number' && typeof e.size === 'number')).toBe(true)
  })
})

describe('parseKbUploadStatus', () => {
  it('maps numeric enum values', () => {
    expect(parseKbUploadStatus(UploadItemStatus.UploadStatusOK)).toBe('ok')
    expect(parseKbUploadStatus(UploadItemStatus.UploadStatusSkipped)).toBe('skipped')
    expect(parseKbUploadStatus(UploadItemStatus.UploadStatusFailed)).toBe('failed')
    expect(parseKbUploadStatus(UploadItemStatus.UploadStatusUnspecified)).toBe('unspecified')
    expect(parseKbUploadStatus(undefined)).toBe('unspecified')
  })
})

describe('parseKbDeleteStatus', () => {
  it('maps numeric enum values', () => {
    expect(parseKbDeleteStatus(DeleteItemStatus.DeleteStatusOK)).toBe('ok')
    expect(parseKbDeleteStatus(DeleteItemStatus.DeleteStatusNotFound)).toBe('not_found')
    expect(parseKbDeleteStatus(DeleteItemStatus.DeleteStatusFailed)).toBe('failed')
  })
})

describe('buildSnapshotEntriesAfterUpload', () => {
  it('keeps unchanged files, drops failed new uploads, keeps last entry on failed update', () => {
    const L_now: KbManifestEntry[] = [
      { relPath: 'a.md', mtimeMs: 100, size: 10 },
      { relPath: 'b.md', mtimeMs: 50, size: 5 },
      { relPath: 'c.md', mtimeMs: 300, size: 30 }
    ]
    const L_last: KbManifestEntry[] = [
      { relPath: 'a.md', mtimeMs: 100, size: 10 },
      { relPath: 'c.md', mtimeMs: 100, size: 10 }
    ]
    const toUpload: KbManifestEntry[] = [
      { relPath: 'b.md', mtimeMs: 50, size: 5 },
      { relPath: 'c.md', mtimeMs: 300, size: 30 }
    ]
    const success = new Set(['c.md'])
    const entries = buildSnapshotEntriesAfterUpload(L_now, L_last, toUpload, success)
    const byPath = new Map(entries.map((e) => [e.relPath, e]))
    expect(byPath.get('a.md')).toEqual({ relPath: 'a.md', mtimeMs: 100, size: 10 })
    expect(byPath.has('b.md')).toBe(false)
    expect(byPath.get('c.md')).toEqual({ relPath: 'c.md', mtimeMs: 300, size: 30 })
  })
})

describe('adjustUsedBytesAfterUploadOk', () => {
  it('adds full size for new path and delta for update', () => {
    const cloud = new Map<string, number>()
    expect(adjustUsedBytesAfterUploadOk(100, cloud, { relPath: 'n.md', mtimeMs: 1, size: 40 })).toBe(140)
    expect(cloud.get('n.md')).toBe(40)
    expect(adjustUsedBytesAfterUploadOk(140, cloud, { relPath: 'n.md', mtimeMs: 2, size: 25 })).toBe(125)
    expect(cloud.get('n.md')).toBe(25)
  })

  it('does not count excluded meta path toward used bytes', () => {
    const cloud = new Map<string, number>()
    expect(adjustUsedBytesAfterUploadOk(50, cloud, { relPath: '.kb-default-seeds-meta.json', mtimeMs: 1, size: 99 })).toBe(50)
    expect(cloud.has('.kb-default-seeds-meta.json')).toBe(false)
  })
})

describe('decideDownloadAction', () => {
  const entry = (relPath: string, mtimeMs: number): KbManifestEntry => ({ relPath, mtimeMs, size: 100 })
  const lastEntry = (relPath: string, mtimeMs: number): KbManifestEntry => ({ relPath, mtimeMs, size: 100 })

  it('skips excluded meta file regardless of local state', () => {
    expect(decideDownloadAction(entry('.kb-default-seeds-meta.json', 200), false, null, new Set(), undefined)).toBe('skip')
    expect(decideDownloadAction(entry('.kb-default-seeds-meta.json', 200), true, 100, new Set(), undefined)).toBe('skip')
  })

  it('downloads new cloud file that never existed locally', () => {
    expect(decideDownloadAction(entry('a.md', 100), false, null, new Set(), undefined)).toBe('download')
  })

  it('skips locally deleted file when cloud version is not newer', () => {
    // Cloud mtime equals snapshot mtime → delete intent wins
    const result = decideDownloadAction(entry('a.md', 100), false, null, new Set(['a.md']), lastEntry('a.md', 100))
    expect(result).toBe('skip')
  })

  it('skips locally deleted file when cloud version is older than snapshot', () => {
    const result = decideDownloadAction(entry('a.md', 80), false, null, new Set(['a.md']), lastEntry('a.md', 100))
    expect(result).toBe('skip')
  })

  it('restores locally deleted file when cloud version is strictly newer', () => {
    const result = decideDownloadAction(entry('a.md', 200), false, null, new Set(['a.md']), lastEntry('a.md', 100))
    expect(result).toBe('download_and_restore')
  })

  it('downloads locally deleted file when snapshot entry is missing (treat cloud as authoritative)', () => {
    // No snapshot entry means we have no baseline → cloud wins
    const result = decideDownloadAction(entry('a.md', 100), false, null, new Set(['a.md']), undefined)
    expect(result).toBe('download_and_restore')
  })

  it('skips existing local file that is up to date', () => {
    expect(decideDownloadAction(entry('a.md', 100), true, 100, new Set(), undefined)).toBe('skip')
  })

  it('skips existing local file that is newer than cloud', () => {
    expect(decideDownloadAction(entry('a.md', 100), true, 200, new Set(), undefined)).toBe('skip')
  })

  it('downloads existing local file when cloud is strictly newer', () => {
    expect(decideDownloadAction(entry('a.md', 300), true, 100, new Set(), undefined)).toBe('download')
  })
})

describe('runKbFullSync download', () => {
  const CLOUD_MTIME = 1000
  let kbRoot = ''
  let cloud: Map<string, { bytes: Buffer; mtimeMs: number }>

  const putCloud = (relPath: string, bytes: Buffer, mtimeMs = CLOUD_MTIME) => cloud.set(relPath, { bytes, mtimeMs })
  const readLocal = (relPath: string) => fsp.readFile(path.join(kbRoot, relPath))
  const writeLocal = (relPath: string, data: string | Buffer) => fsp.writeFile(path.join(kbRoot, relPath), data)

  // Mirrors the server: file content always comes back base64-encoded, with no encoding field.
  const get = vi.fn(async (url: string, config?: { params?: { relPath?: string } }) => {
    if (url === '/kb/manifest') {
      const entries: Record<string, KbManifestEntry> = {}
      for (const [relPath, f] of cloud) entries[relPath] = { relPath, mtimeMs: f.mtimeMs, size: f.bytes.length }
      return { entries }
    }
    const f = cloud.get(config?.params?.relPath ?? '')
    return f ? { content: f.bytes.toString('base64'), mtimeMs: f.mtimeMs } : undefined
  })

  type PostBody = { files?: Array<{ relPath: string; content: string; encoding: string; mtimeMs: number }>; relPaths?: string[] }
  const post = vi.fn(async (_url: string, data: PostBody) => {
    const results: Record<string, { status: number }> = {}
    for (const f of data.files ?? []) {
      putCloud(f.relPath, Buffer.from(f.content, f.encoding === 'base64' ? 'base64' : 'utf-8'), f.mtimeMs)
      results[f.relPath] = { status: UploadItemStatus.UploadStatusOK }
    }
    for (const relPath of data.relPaths ?? []) {
      cloud.delete(relPath)
      results[relPath] = { status: DeleteItemStatus.DeleteStatusOK }
    }
    return { results }
  })

  const fileGets = () => get.mock.calls.filter(([url]) => url === '/kb/file').map(([, config]) => config?.params?.relPath)

  beforeEach(async () => {
    vi.useRealTimers()
    mockUserDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'kb-sync-full-'))
    kbRoot = path.join(mockUserDataPath, 'knowledgebase')
    await fsp.mkdir(kbRoot, { recursive: true })
    cloud = new Map()
    __testOnly.resetState()
    vi.clearAllMocks()
    apiClientModuleMock.ApiClient.mockImplementation(function () {
      return { isAuthenticated: vi.fn(async () => true), get, post, destroy: vi.fn() }
    })
  })

  it('writes decoded bytes for downloaded text and binary files', async () => {
    const text = Buffer.from('安装 beegfs client\nsudo systemctl restart beegfs-client\n', 'utf-8')
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10])
    putCloud('notes/setup.sh', text)
    putCloud('images/a.png', image)

    await runKbFullSync()

    expect(await readLocal('notes/setup.sh')).toEqual(text)
    expect(await readLocal('images/a.png')).toEqual(image)
    expect(post).not.toHaveBeenCalled()

    get.mockClear()
    await runKbFullSync()
    expect(fileGets()).toEqual([])
  })

  it('replaces a local copy holding the base64 text of the cloud file and leaves other local files alone', async () => {
    const original = Buffer.from('安装 beegfs client\n', 'utf-8')
    putCloud('broken.sh', original)
    await writeLocal('broken.sh', original.toString('base64'))

    // Same length as a base64 copy of the cloud file, but the text is a local edit.
    const editedLocal = Buffer.from('local edit, not uploaded!', 'utf-8').toString('base64')
    putCloud('edited.md', Buffer.from('cloud version of the note', 'utf-8'))
    await writeLocal('edited.md', editedLocal)

    putCloud('plain.md', Buffer.from('cloud text', 'utf-8'))
    await writeLocal('plain.md', 'local text that differs')

    putCloud('empty.md', Buffer.alloc(0))
    await writeLocal('empty.md', '')

    putCloud('deleted.md', Buffer.from('removed locally', 'utf-8'))

    // Snapshot from the last sync: every file is unchanged since then except edited.md, and deleted.md was removed.
    const snapshot = (await listAllKbFilesRecursive()).map((e) => (e.relPath === 'edited.md' ? { ...e, mtimeMs: 1 } : e))
    snapshot.push({ relPath: 'deleted.md', mtimeMs: CLOUD_MTIME, size: 15 })
    await writeLocalSnapshot(snapshot)

    await runKbFullSync()

    expect(await readLocal('broken.sh')).toEqual(original)
    expect((await readLocal('edited.md')).toString('utf-8')).toBe(editedLocal)
    expect((await readLocal('plain.md')).toString('utf-8')).toBe('local text that differs')
    expect(fileGets()).toEqual(['broken.sh', 'edited.md'])
    expect(post.mock.calls.map(([url, body]) => [url, body.files?.map((f) => f.relPath) ?? body.relPaths])).toEqual([
      ['/kb/upload', ['edited.md']],
      ['/kb/delete', ['deleted.md']]
    ])
    expect(cloud.get('edited.md')!.bytes.toString('utf-8')).toBe(editedLocal)

    const snap = await readLocalSnapshot()
    expect(snap!.entries.find((e) => e.relPath === 'broken.sh')!.size).toBe(original.length)

    get.mockClear()
    post.mockClear()
    await runKbFullSync()
    expect(fileGets()).toEqual([])
    expect(post).not.toHaveBeenCalled()
  })

  it('replaces a base64 copy without uploading it when no snapshot exists', async () => {
    const original = Buffer.from('# BeeGFS 排查\n', 'utf-8')
    putCloud('summary/beegfs.md', original)
    await fsp.mkdir(path.join(kbRoot, 'summary'))
    await writeLocal('summary/beegfs.md', original.toString('base64'))

    await runKbFullSync()

    expect(await readLocal('summary/beegfs.md')).toEqual(original)
    expect(post).not.toHaveBeenCalled()
    expect(cloud.get('summary/beegfs.md')!.bytes).toEqual(original)
  })
})

describe('flushDeletes batching', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    mockUserDataPath = path.join(os.tmpdir(), `kb-sync-delete-batch-${Date.now()}`)
    await fsp.mkdir(mockUserDataPath, { recursive: true })
    __testOnly.resetState()
    vi.clearAllMocks()
  })

  it('splits delete requests into batches and updates snapshot/usedBytes', async () => {
    const post = vi.fn(async (_url: string, data?: any) => {
      const relPaths: string[] = data?.relPaths ?? []
      const results: Record<string, any> = {}
      for (const p of relPaths) results[p] = { status: DeleteItemStatus.DeleteStatusOK }
      return { results }
    })
    apiClientModuleMock.ApiClient.mockImplementation(function () {
      return {
        isAuthenticated: vi.fn(async () => true),
        post,
        destroy: vi.fn()
      }
    })

    const total = DELETE_BATCH_SIZE * 2 + 1
    const relPaths = Array.from({ length: total }, (_, i) => `work_notes/f-${i}.md`)
    const entries: KbManifestEntry[] = relPaths.map((p) => ({ relPath: p, mtimeMs: 1, size: 1 }))
    await writeLocalSnapshot(entries, total)

    __testOnly.addPendingDelete(relPaths)
    expect(__testOnly.getPendingDeleteSize()).toBe(total)
    expect(__testOnly.getFlags().fullSyncInProgress).toBe(false)
    expect(__testOnly.getFlags().flushInProgress).toBe(false)
    await __testOnly.flushDeletes()

    expect(apiClientModuleMock.ApiClient).toHaveBeenCalled()
    expect(post).toHaveBeenCalledTimes(3)
    expect(post.mock.calls[0][0]).toBe('/kb/delete')
    expect(post.mock.calls[0][1].relPaths).toHaveLength(DELETE_BATCH_SIZE)
    expect(post.mock.calls[1][1].relPaths).toHaveLength(DELETE_BATCH_SIZE)
    expect(post.mock.calls[2][1].relPaths).toHaveLength(1)

    const snap = await readLocalSnapshot()
    expect(snap).not.toBeNull()
    expect(snap!.entries).toHaveLength(0)
    expect(snap!.usedBytes).toBe(0)
  })
})
