import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { createLogger } from '../../logging'
import type { EmbeddingProvider } from './types'
import { buildEmbeddingText, CHUNKING_SIGNATURE, chunkDocument, hashText, isIndexableFile } from './chunker'

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

    const model = this.provider.model
    const indexSignature = `${CHUNKING_SIGNATURE}:${model}`
    const existing = this.db.prepare('SELECT hash, index_signature FROM files WHERE path = ?').get(relPath) as
      { hash: string; index_signature: string } | undefined
    if (existing?.hash === contentHash && existing.index_signature === indexSignature) return 0

    const { parents, children } = chunkDocument(content, relPath)
    const now = Date.now()

    let stat: fs.Stats
    try {
      stat = fs.statSync(absPath)
    } catch {
      stat = { mtimeMs: now, size: content.length } as fs.Stats
    }

    if (children.length === 0) {
      this.db.transaction(() => {
        this.deleteIndexedFile(relPath)
        this.upsertFile(relPath, contentHash, indexSignature, stat)
      })()
      return 0
    }

    // Resolve embeddings: reuse from existing chunks table, or mark as pending
    const embeddings: (number[] | null)[] = children.map(() => null)
    const embeddingTexts = children.map((chunk) => buildEmbeddingText(relPath, chunk))
    const embeddingHashes = embeddingTexts.map(hashText)
    const pendingIndices: number[] = []
    const pendingTexts: string[] = []

    const getCached = this.db.prepare('SELECT embedding FROM chunks WHERE model = ? AND hash = ? LIMIT 1')

    for (let i = 0; i < children.length; i++) {
      const cached = getCached.get(model, embeddingHashes[i]) as { embedding: string } | undefined
      if (cached) {
        embeddings[i] = JSON.parse(cached.embedding)
      } else {
        pendingIndices.push(i)
        pendingTexts.push(embeddingTexts[i])
      }
    }

    // Batch embed uncached chunks
    if (pendingTexts.length > 0) {
      logger.info('KB embedding file', {
        relPath,
        chunks: children.length,
        embeddingChunks: pendingTexts.length,
        cachedChunks: children.length - pendingTexts.length,
        model
      })
      const newVecs = await this.provider.embedBatch(pendingTexts)

      for (let j = 0; j < pendingIndices.length; j++) {
        const idx = pendingIndices[j]
        embeddings[idx] = newVecs[j]
      }
    }

    const insertParent = this.db.prepare(
      'INSERT INTO parent_chunks (id, path, parent_index, start_line, end_line, start_offset, end_offset, text, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const insertChunk = this.db.prepare(
      'INSERT INTO chunks (id, path, chunk_index, parent_id, start_line, end_line, start_offset, end_offset, context_header, hash, model, text, embedding, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const insertFts = this.db.prepare('INSERT INTO chunks_fts (text, id, path, start_line, end_line) VALUES (?, ?, ?, ?, ?)')

    const insertAll = this.db.transaction(() => {
      this.deleteIndexedFile(relPath)

      const parentIds = parents.map(() => randomUUID())
      for (let i = 0; i < parents.length; i++) {
        const parent = parents[i]
        insertParent.run(
          parentIds[i],
          relPath,
          parent.parentIndex,
          parent.startLine,
          parent.endLine,
          parent.startOffset,
          parent.endOffset,
          parent.text,
          now
        )
      }

      for (let i = 0; i < children.length; i++) {
        const chunk = children[i]
        const id = randomUUID()
        const embedding = embeddings[i]!
        const parentId = chunk.parentIndex >= 0 ? parentIds[chunk.parentIndex] : null
        insertChunk.run(
          id,
          relPath,
          i,
          parentId,
          chunk.startLine,
          chunk.endLine,
          chunk.startOffset,
          chunk.endOffset,
          chunk.contextHeader,
          embeddingHashes[i],
          model,
          chunk.text,
          JSON.stringify(embedding),
          now
        )
        insertFts.run(embeddingTexts[i], id, relPath, chunk.startLine, chunk.endLine)
      }

      this.upsertFile(relPath, contentHash, indexSignature, stat)
    })
    insertAll()

    return children.length
  }

  removeFile(relPath: string): void {
    this.deleteIndexedFile(relPath)
    this.db.prepare('DELETE FROM files WHERE path = ?').run(relPath)
  }

  private deleteIndexedFile(relPath: string): void {
    this.db.prepare('DELETE FROM chunks WHERE path = ?').run(relPath)
    this.db.prepare('DELETE FROM chunks_fts WHERE path = ?').run(relPath)
    this.db.prepare('DELETE FROM parent_chunks WHERE path = ?').run(relPath)
  }

  private upsertFile(relPath: string, contentHash: string, indexSignature: string, stat: fs.Stats): void {
    this.db
      .prepare('INSERT OR REPLACE INTO files (path, hash, index_signature, mtime_ms, size) VALUES (?, ?, ?, ?, ?)')
      .run(relPath, contentHash, indexSignature, Math.floor(stat.mtimeMs), stat.size)
  }
}
