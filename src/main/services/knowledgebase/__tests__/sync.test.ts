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
  UploadItemStatus,
  DeleteItemStatus,
  parseKbUploadStatus,
  parseKbDeleteStatus,
  buildSnapshotEntriesAfterUpload,
  adjustUsedBytesAfterUploadOk,
  type KbManifestEntry
} from '../sync'

let mockUserDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => {
      if (key === 'userData') return mockUserDataPath
      throw new Error(`Unexpected app.getPath(${key})`)
    }
  }
}))

vi.mock('../../storage/data_sync/core/ApiClient', () => ({
  ApiClient: vi.fn()
}))

vi.mock('../index', () => ({
  getKnowledgeBaseRoot: () => path.join(mockUserDataPath, 'knowledgebase'),
  IMAGE_EXTS: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])
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
  it('maps numeric and string enum values', () => {
    expect(parseKbUploadStatus(UploadItemStatus.UploadStatusOK)).toBe('ok')
    expect(parseKbUploadStatus(UploadItemStatus.UploadStatusSkipped)).toBe('skipped')
    expect(parseKbUploadStatus(UploadItemStatus.UploadStatusFailed)).toBe('failed')
    expect(parseKbUploadStatus(UploadItemStatus.UploadStatusUnspecified)).toBe('unspecified')
    expect(parseKbUploadStatus(undefined)).toBe('unspecified')
  })
})

describe('parseKbDeleteStatus', () => {
  it('maps delete outcome enums', () => {
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
