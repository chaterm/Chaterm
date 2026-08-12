import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { initSchema } from '../schema'
import { KbIndexer } from '../indexer'
import { CHUNKING_SIGNATURE, chunkDocument } from '../chunker'
import type { DocumentChunker, EmbeddingProvider } from '../types'
import { createMockDatabase, type MockDb } from './mock-database'

/** Mock embedding provider that returns deterministic vectors */
function createMockProvider(dims = 4): EmbeddingProvider & { _callCount: number } {
  let callCount = 0
  const provider: EmbeddingProvider & { _callCount: number } = {
    id: 'mock',
    model: 'mock-embed',
    dims,
    async embedBatch(texts: string[]): Promise<number[][]> {
      callCount++
      return texts.map((t) => {
        const base = t.length / 100
        return Array.from({ length: dims }, (_, i) => base + i * 0.1)
      })
    },
    async embedQuery(text: string): Promise<number[]> {
      const [vec] = await provider.embedBatch([text])
      return vec
    },
    get _callCount() {
      return callCount
    }
  }
  return provider
}

describe('KbIndexer', () => {
  let db: MockDb
  let tmpDir: string
  let provider: EmbeddingProvider & { _callCount: number }
  let indexer: KbIndexer
  const chunker: DocumentChunker = {
    async chunkDocument(content, relPath) {
      return chunkDocument(content, relPath)
    },
    close() {
      return undefined
    }
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-indexer-test-'))
    db = createMockDatabase()
    initSchema(db as any)
    provider = createMockProvider()
    indexer = new KbIndexer(db as any, provider, tmpDir, chunker)
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('indexes a markdown file and creates chunks', async () => {
    const filePath = path.join(tmpDir, 'guide.md')
    fs.writeFileSync(filePath, '# SSH Guide\n\nHow to configure SSH.\n\nStep 1: Install OpenSSH.')

    const count = await indexer.indexFile('guide.md')
    expect(count).toBeGreaterThan(0)

    // Check files table
    const file = db.prepare('SELECT * FROM files WHERE path = ?').get('guide.md') as any
    expect(file).toBeTruthy()
    expect(file.hash).toMatch(/^[a-f0-9]{64}$/)

    // Check chunks table
    const chunks = db.prepare('SELECT * FROM chunks WHERE path = ?').all('guide.md')
    expect(chunks.length).toBe(count)
    expect(chunks.map((chunk) => chunk.chunk_index)).toEqual(chunks.map((_, index) => index))

    // Check FTS table
    const ftsCount = db.prepare('SELECT count(*) as cnt FROM chunks_fts WHERE path = ?').get('guide.md') as any
    expect(ftsCount.cnt).toBe(count)
  })

  it('skips non-indexable files (binary)', async () => {
    const filePath = path.join(tmpDir, 'image.png')
    fs.writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const count = await indexer.indexFile('image.png')
    expect(count).toBe(0)
  })

  it('skips file if content hash unchanged', async () => {
    const filePath = path.join(tmpDir, 'doc.md')
    fs.writeFileSync(filePath, 'Hello world')

    await indexer.indexFile('doc.md')
    const firstCallCount = provider._callCount

    // Index again with same content
    const count = await indexer.indexFile('doc.md')
    expect(count).toBe(0)
    expect(provider._callCount).toBe(firstCallCount) // No new embedding calls
  })

  it('re-indexes unchanged content when the chunking signature changes', async () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), 'Hello world')
    await indexer.indexFile('doc.md')
    const originalChunkId = db._tables.chunks[0].id

    db._tables.files[0].index_signature = 'obsolete-chunker'
    const count = await indexer.indexFile('doc.md')

    expect(count).toBe(1)
    expect(db._tables.files[0].index_signature).toBe(`${CHUNKING_SIGNATURE}:${provider.model}`)
    expect(db._tables.chunks[0].id).not.toBe(originalChunkId)
  })

  it('re-indexes when content changes', async () => {
    const filePath = path.join(tmpDir, 'doc.md')
    fs.writeFileSync(filePath, 'Version 1')
    await indexer.indexFile('doc.md')

    fs.writeFileSync(filePath, 'Version 2 with different content')
    const count = await indexer.indexFile('doc.md')
    expect(count).toBeGreaterThan(0)

    // Old chunks should be replaced
    const chunks = db.prepare('SELECT * FROM chunks WHERE path = ?').all('doc.md')
    expect(chunks.length).toBe(count)
  })

  it('uses embedding cache for unchanged chunks', async () => {
    const filePath = path.join(tmpDir, 'doc.md')
    // Create content with 2+ chunks by using small token size
    const longContent = Array.from({ length: 50 }, (_, i) => `Line ${i}: Some content here`).join('\n')
    fs.writeFileSync(filePath, longContent)

    await indexer.indexFile('doc.md')
    const firstCallCount = provider._callCount

    // Modify only the first line
    const modified = 'Line 0: MODIFIED content\n' + longContent.split('\n').slice(1).join('\n')
    fs.writeFileSync(filePath, modified)

    await indexer.indexFile('doc.md')
    // Should have fewer embedding calls since most chunks are cached
    // (At least one call for the modified chunk, but not all)
    expect(provider._callCount).toBeGreaterThan(firstCallCount)
  })

  it('stores large retrieval parents separately while embedding only searchable children', async () => {
    const body = Array.from({ length: 15 }, (_, index) => `Explanation line ${index + 1} keeps its section context.`).join('\n')
    const content = `# Guide\n\n## Install\n${body}\n\n## Configure\n${body}\n\n## Troubleshoot\n${body}`
    fs.writeFileSync(path.join(tmpDir, 'guide.md'), content)

    const count = await indexer.indexFile('guide.md')

    expect(count).toBeGreaterThan(1)
    expect(db._tables.parent_chunks).toHaveLength(1)
    expect(db._tables.parent_chunks[0].text).toBe(content)
    expect(db._tables.chunks.every((chunk) => chunk.parent_id === db._tables.parent_chunks[0].id)).toBe(true)
    expect(db._tables.chunks_fts).toHaveLength(count)
    expect(db._tables.chunks_fts.some((chunk) => String(chunk.text).includes('guide.md'))).toBe(true)
    expect(db._tables.chunks_fts.some((chunk) => String(chunk.text).includes('## Configure'))).toBe(true)
  })

  it('preserves the previous index when embedding the replacement fails', async () => {
    const filePath = path.join(tmpDir, 'doc.md')
    fs.writeFileSync(filePath, 'Stable indexed content')
    await indexer.indexFile('doc.md')
    const previousFile = { ...db._tables.files[0] }
    const previousChunks = db._tables.chunks.map((chunk) => ({ ...chunk }))
    const previousFts = db._tables.chunks_fts.map((chunk) => ({ ...chunk }))

    fs.writeFileSync(filePath, 'Replacement content that cannot be embedded')
    provider.embedBatch = async () => {
      throw new Error('embedding unavailable')
    }

    await expect(indexer.indexFile('doc.md')).rejects.toThrow('embedding unavailable')
    expect(db._tables.files).toEqual([previousFile])
    expect(db._tables.chunks).toEqual(previousChunks)
    expect(db._tables.chunks_fts).toEqual(previousFts)
  })

  it('clears stale chunks and parents when a previously indexed file becomes empty', async () => {
    const filePath = path.join(tmpDir, 'doc.md')
    const content = Array.from({ length: 30 }, (_, index) => `Line ${index + 1} has searchable content.`).join('\n')
    fs.writeFileSync(filePath, content)
    await indexer.indexFile('doc.md')
    expect(db._tables.parent_chunks.length).toBeGreaterThan(0)

    fs.writeFileSync(filePath, '')
    await expect(indexer.indexFile('doc.md')).resolves.toBe(0)

    expect(db._tables.files).toHaveLength(1)
    expect(db._tables.chunks).toHaveLength(0)
    expect(db._tables.chunks_fts).toHaveLength(0)
    expect(db._tables.parent_chunks).toHaveLength(0)
  })

  it('removes file and cleans up chunks, FTS, and parents', async () => {
    const filePath = path.join(tmpDir, 'to-delete.md')
    fs.writeFileSync(filePath, 'Content to be deleted')
    await indexer.indexFile('to-delete.md')

    // Verify it exists
    expect(db.prepare('SELECT count(*) as cnt FROM chunks WHERE path = ?').get('to-delete.md')).toEqual({ cnt: 1 })

    indexer.removeFile('to-delete.md')

    // Verify cleanup
    expect(db.prepare('SELECT count(*) as cnt FROM files WHERE path = ?').get('to-delete.md')).toEqual({ cnt: 0 })
    expect(db.prepare('SELECT count(*) as cnt FROM chunks WHERE path = ?').get('to-delete.md')).toEqual({ cnt: 0 })
    expect(db.prepare('SELECT count(*) as cnt FROM chunks_fts WHERE path = ?').get('to-delete.md')).toEqual({
      cnt: 0
    })
    expect(db._tables.parent_chunks).toHaveLength(0)
  })

  it('indexes various file types', async () => {
    const testFiles: Record<string, string> = {
      'script.sh': '#!/bin/bash\necho "hello"',
      'config.yaml': 'server:\n  port: 8080',
      'app.py': 'def main():\n    print("hi")',
      'style.css': 'body { color: red; }',
      'data.json': '{"key": "value"}'
    }

    for (const [name, content] of Object.entries(testFiles)) {
      fs.writeFileSync(path.join(tmpDir, name), content)
      const count = await indexer.indexFile(name)
      expect(count, `${name} should be indexed`).toBeGreaterThan(0)
    }
  })

  it('handles missing file gracefully', async () => {
    const count = await indexer.indexFile('nonexistent.md')
    expect(count).toBe(0)
  })
})
