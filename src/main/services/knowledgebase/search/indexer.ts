import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { createLogger } from '../../logging'
import type { EmbeddingProvider } from './types'
import { chunkText, hashText, isIndexableFile } from './chunker'

const logger = createLogger('kb-search-indexer')

export class KbIndexer {
  constructor(
    private db: Database.Database,
    private provider: EmbeddingProvider,
    private kbRoot: string
  ) {}

  async indexFile(relPath: string): Promise<number> {
    if (!isIndexableFile(relPath)) return 0

    const absPath = path.join(this.kbRoot, relPath)
    let content: string
    try {
      content = fs.readFileSync(absPath, 'utf-8')
    } catch {
      return 0
    }

    const contentHash = hashText(content)

    // Check if already indexed with same hash
    const existing = this.db.prepare('SELECT hash FROM files WHERE path = ?').get(relPath) as { hash: string } | undefined
    if (existing?.hash === contentHash) return 0

    const rawChunks = chunkText(content)
    if (rawChunks.length === 0) return 0

    const model = this.provider.model
    const now = Date.now()

    // Resolve embeddings: reuse from existing chunks table, or mark as pending
    const embeddings: (number[] | null)[] = rawChunks.map(() => null)
    const pendingIndices: number[] = []
    const pendingTexts: string[] = []

    const getCached = this.db.prepare('SELECT embedding FROM chunks WHERE model = ? AND hash = ? LIMIT 1')

    for (let i = 0; i < rawChunks.length; i++) {
      const cached = getCached.get(model, rawChunks[i].hash) as { embedding: string } | undefined
      if (cached) {
        embeddings[i] = JSON.parse(cached.embedding)
      } else {
        pendingIndices.push(i)
        pendingTexts.push(rawChunks[i].text)
      }
    }

    // Batch embed uncached chunks
    if (pendingTexts.length > 0) {
      logger.info('KB embedding file', {
        relPath,
        chunks: rawChunks.length,
        embeddingChunks: pendingTexts.length,
        cachedChunks: rawChunks.length - pendingTexts.length,
        model
      })
      const newVecs = await this.provider.embedBatch(pendingTexts)

      for (let j = 0; j < pendingIndices.length; j++) {
        const idx = pendingIndices[j]
        embeddings[idx] = newVecs[j]
      }
    }

    // Replace old chunks for this path
    this.db.prepare('DELETE FROM chunks WHERE path = ?').run(relPath)
    this.db.prepare('DELETE FROM chunks_fts WHERE path = ?').run(relPath)

    // Insert new chunks
    const insertChunk = this.db.prepare(
      'INSERT INTO chunks (id, path, start_line, end_line, hash, model, text, embedding, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const insertFts = this.db.prepare('INSERT INTO chunks_fts (text, id, path, start_line, end_line) VALUES (?, ?, ?, ?, ?)')

    const insertAll = this.db.transaction(() => {
      for (let i = 0; i < rawChunks.length; i++) {
        const chunk = rawChunks[i]
        const id = randomUUID()
        const embedding = embeddings[i]!
        insertChunk.run(id, relPath, chunk.startLine, chunk.endLine, chunk.hash, model, chunk.text, JSON.stringify(embedding), now)
        insertFts.run(chunk.text, id, relPath, chunk.startLine, chunk.endLine)
      }
    })
    insertAll()

    // Update files table
    let stat: fs.Stats
    try {
      stat = fs.statSync(absPath)
    } catch {
      stat = { mtimeMs: now, size: content.length } as fs.Stats
    }
    this.db
      .prepare('INSERT OR REPLACE INTO files (path, hash, mtime_ms, size) VALUES (?, ?, ?, ?)')
      .run(relPath, contentHash, Math.floor(stat.mtimeMs), stat.size)

    return rawChunks.length
  }

  removeFile(relPath: string): void {
    this.db.prepare('DELETE FROM chunks WHERE path = ?').run(relPath)
    this.db.prepare('DELETE FROM chunks_fts WHERE path = ?').run(relPath)
    this.db.prepare('DELETE FROM files WHERE path = ?').run(relPath)
  }
}
