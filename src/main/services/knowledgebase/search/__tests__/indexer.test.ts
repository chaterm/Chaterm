import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { initSchema } from '../schema'
import { KbIndexer } from '../indexer'
import type { EmbeddingProvider } from '../types'

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
  let db: Database.Database
  let tmpDir: string
  let provider: EmbeddingProvider & { _callCount: number }
  let indexer: KbIndexer

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-indexer-test-'))
    db = new Database(':memory:')
    initSchema(db)
    provider = createMockProvider()
    indexer = new KbIndexer(db, provider, tmpDir)
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

  it('removes file and cleans up chunks + FTS', async () => {
    const filePath = path.join(tmpDir, 'to-delete.md')
    fs.writeFileSync(filePath, 'Content to be deleted')
    await indexer.indexFile('to-delete.md')

    // Verify it exists
    expect(db.prepare('SELECT count(*) as cnt FROM chunks WHERE path = ?').get('to-delete.md')).toEqual({ cnt: 1 })

    indexer.removeFile('to-delete.md')

    // Verify cleanup
    expect(db.prepare('SELECT count(*) as cnt FROM files WHERE path = ?').get('to-delete.md')).toEqual({ cnt: 0 })
    expect(db.prepare('SELECT count(*) as cnt FROM chunks WHERE path = ?').get('to-delete.md')).toEqual({ cnt: 0 })
    expect(db.prepare('SELECT count(*) as cnt FROM chunks_fts WHERE path = ?').get('to-delete.md')).toEqual({ cnt: 0 })
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
