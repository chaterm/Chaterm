import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'

import type { EmbeddingProvider, EmbeddingConfig, KbSearchResult, SearchOptions, SearchStatus } from './types'
import { createEmbeddingProvider } from './embedding-provider'
import { initSchema } from './schema'
import { KbIndexer } from './indexer'
import { cosineSimilarity, buildFtsQuery, mergeResults } from './searcher'
import { isIndexableFile } from './chunker'

const DEBOUNCE_MS = 2000

export class KbSearchManager {
  private db: Database.Database
  private provider: EmbeddingProvider
  private indexer: KbIndexer
  private kbRoot: string
  private pendingChanges = new Set<string>()
  private pendingDeletes = new Set<string>()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(dbPath: string, kbRoot: string, provider: EmbeddingProvider) {
    this.kbRoot = kbRoot
    this.provider = provider

    // Ensure DB directory exists
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('busy_timeout = 5000')
    initSchema(this.db)

    this.indexer = new KbIndexer(this.db, this.provider, this.kbRoot)
  }

  /** Factory: create from config */
  static create(userId: string, dbDir: string, kbRoot: string, config: EmbeddingConfig): KbSearchManager {
    const dbPath = path.join(dbDir, userId, 'kb_search.db')
    const provider = createEmbeddingProvider(config)
    return new KbSearchManager(dbPath, kbRoot, provider)
  }

  /** Called by sync.ts watcher on add/change */
  onFileChanged(relPath: string): void {
    this.pendingDeletes.delete(relPath)
    this.pendingChanges.add(relPath)
    this.scheduleFlush()
  }

  /** Called by sync.ts watcher on unlink */
  onFileRemoved(relPath: string): void {
    this.pendingChanges.delete(relPath)
    this.pendingDeletes.add(relPath)
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.flush(), DEBOUNCE_MS)
  }

  private async flush(): Promise<void> {
    const changes = [...this.pendingChanges]
    const deletes = [...this.pendingDeletes]
    this.pendingChanges.clear()
    this.pendingDeletes.clear()

    for (const relPath of deletes) {
      this.indexer.removeFile(relPath)
    }
    for (const relPath of changes) {
      await this.indexer.indexFile(relPath)
    }
  }

  /** Full re-index of all files in KB root */
  async fullIndex(): Promise<{ files: number; chunks: number }> {
    let totalFiles = 0
    let totalChunks = 0

    const walk = (dir: string, prefix: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), relPath)
        } else if (entry.isFile() && isIndexableFile(entry.name)) {
          // Collect for async processing
          filesToIndex.push(relPath)
        }
      }
    }

    const filesToIndex: string[] = []
    walk(this.kbRoot, '')

    for (const relPath of filesToIndex) {
      const chunks = await this.indexer.indexFile(relPath)
      if (chunks > 0) {
        totalFiles++
        totalChunks += chunks
      }
    }

    // Clean up files no longer in KB
    const indexedFiles = this.db.prepare('SELECT path FROM files').all() as { path: string }[]
    const kbFiles = new Set(filesToIndex)
    for (const row of indexedFiles) {
      if (!kbFiles.has(row.path)) {
        this.indexer.removeFile(row.path)
      }
    }

    return { files: totalFiles, chunks: totalChunks }
  }

  /** Hybrid search: vector + FTS5 BM25 */
  async search(query: string, opts?: SearchOptions): Promise<KbSearchResult[]> {
    const maxResults = opts?.maxResults ?? 5
    const minScore = opts?.minScore ?? 0.7
    const vectorWeight = opts?.vectorWeight ?? 0.7
    const textWeight = opts?.textWeight ?? 0.3

    const model = this.provider.model
    const candidateLimit = maxResults * 3

    // Vector search: in-memory cosine similarity
    let queryVec: number[]
    try {
      queryVec = await this.provider.embedQuery(query)
    } catch {
      // If embedding fails, fall back to keyword-only search
      queryVec = []
    }

    const vectorHits = this.searchVector(queryVec, model, candidateLimit)
    const keywordHits = this.searchKeyword(query, candidateLimit)

    return mergeResults(vectorHits, keywordHits, {
      vectorWeight: queryVec.length > 0 ? vectorWeight : 0,
      textWeight: queryVec.length > 0 ? textWeight : 1,
      minScore,
      maxResults
    })
  }

  private searchVector(queryVec: number[], model: string, limit: number) {
    if (queryVec.length === 0) return []

    const rows = this.db.prepare('SELECT id, path, start_line, end_line, text, embedding FROM chunks WHERE model = ?').all(model) as Array<{
      id: string
      path: string
      start_line: number
      end_line: number
      text: string
      embedding: string
    }>

    const scored = rows.map((row) => {
      const vec = JSON.parse(row.embedding) as number[]
      return {
        id: row.id,
        path: row.path,
        startLine: row.start_line,
        endLine: row.end_line,
        snippet: row.text,
        score: cosineSimilarity(queryVec, vec)
      }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }

  private searchKeyword(query: string, limit: number) {
    const ftsQuery = buildFtsQuery(query)
    if (!ftsQuery) return []

    try {
      const rows = this.db
        .prepare(
          `SELECT id, path, start_line, end_line, text, bm25(chunks_fts) AS rank
           FROM chunks_fts WHERE chunks_fts MATCH ?
           ORDER BY rank LIMIT ?`
        )
        .all(ftsQuery, limit) as Array<{
        id: string
        path: string
        start_line: number
        end_line: number
        text: string
        rank: number
      }>

      return rows.map((row) => ({
        id: row.id,
        path: row.path,
        startLine: row.start_line,
        endLine: row.end_line,
        snippet: row.text,
        bm25Rank: row.rank
      }))
    } catch {
      return []
    }
  }

  status(): SearchStatus {
    const fileCount = this.db.prepare('SELECT count(*) as cnt FROM files').get() as { cnt: number }
    const chunkCount = this.db.prepare('SELECT count(*) as cnt FROM chunks').get() as { cnt: number }
    return {
      totalFiles: fileCount.cnt,
      totalChunks: chunkCount.cnt,
      model: this.provider.model,
      provider: this.provider.id
    }
  }

  /** Flush pending changes immediately (for testing) */
  async flushNow(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    await this.flush()
  }

  close(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.db.close()
  }
}
