import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'

import type {
  EmbeddingProvider,
  EmbeddingConfig,
  KbRankedChunk,
  KbSearchCandidate,
  KbSearchResult,
  KbRerankScore,
  SearchOptions,
  SearchStatus,
  VectorSearchOptions
} from './types'
import { createEmbeddingProvider } from './embedding-provider'
import { initSchema } from './schema'
import { KbIndexer } from './indexer'
import { applyMmr, collapseResultsByParent, cosineSimilarity, buildFtsQuery, fuseResultsWithRrf, mergeOverlappingResults } from './searcher'
import type { KbExpandedResult } from './searcher'
import { isIndexableFile } from './chunker'
import { createLogger } from '../../logging'

const DEBOUNCE_MS = 2000
const RERANK_CANDIDATE_LIMIT = 15
const DEFAULT_RERANK_THRESHOLD = 0.5
const RERANK_FALLBACK_MIN_SCORE = 0.15
const searchLogger = createLogger('kb-search')

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
    const model = this.provider.model
    const candidateLimit = RERANK_CANDIDATE_LIMIT

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
    const fused = fuseResultsWithRrf(vectorHits, keywordHits)
    const reranker = opts?.reranker
    const selectFinalResults = (results: KbRankedChunk[]) =>
      mergeOverlappingResults(applyMmr(this.expandParentResults(collapseResultsByParent(results)), maxResults))
    if (fused.length === 0) return []

    if (!reranker) {
      return selectFinalResults(fused.map((candidate) => this.toSearchResult(candidate)))
    }

    const rerankCandidates = fused.slice(0, RERANK_CANDIDATE_LIMIT)
    const fallbackResults = selectFinalResults(rerankCandidates.map((candidate) => this.toSearchResult(candidate)))

    try {
      const scores = await reranker.rerank(
        query,
        rerankCandidates.map((candidate, candidateIndex) => ({
          index: candidateIndex,
          id: candidate.id,
          path: candidate.path,
          startLine: candidate.startLine,
          endLine: candidate.endLine,
          text: [candidate.contextHeader, candidate.snippet].filter(Boolean).join('\n\n'),
          retrievalScore: candidate.rrfScore
        }))
      )
      const ranked = this.applyRerankScores(rerankCandidates, scores, reranker.type)
      if (ranked.length === 0) throw new Error('Reranker returned no valid scores')

      const relevant = ranked.filter((result) => result.score >= DEFAULT_RERANK_THRESHOLD)
      if (relevant.length > 0) {
        return selectFinalResults(relevant)
      }

      return ranked[0].score >= RERANK_FALLBACK_MIN_SCORE ? mergeOverlappingResults(this.expandParentResults([ranked[0]])) : []
    } catch (error) {
      searchLogger.warn('Knowledge base rerank failed', {
        event: 'kb.search.rerank_failed',
        rerankerType: reranker.type,
        errorName: error instanceof Error ? error.name : 'UnknownError'
      })
      return fallbackResults
    }
  }

  async searchVectorSimilarity(query: string, opts?: VectorSearchOptions): Promise<KbSearchResult[]> {
    const maxResults = opts?.maxResults ?? 5
    let queryVec: number[]
    try {
      queryVec = await this.provider.embedQuery(query)
    } catch {
      return []
    }

    return this.searchVector(queryVec, this.provider.model, maxResults)
      .filter((hit) => opts?.minScore === undefined || hit.score >= opts.minScore)
      .map((hit) => ({
        path: hit.path,
        startLine: hit.startLine,
        endLine: hit.endLine,
        snippet: hit.snippet,
        score: hit.score,
        scoreSource: 'vector' as const
      }))
  }

  private applyRerankScores(candidates: KbSearchCandidate[], scores: KbRerankScore[], rerankerType: 'dedicated' | 'llm'): KbRankedChunk[] {
    const scoreSource: KbSearchResult['scoreSource'] = rerankerType === 'dedicated' ? 'dedicated-rerank' : 'llm-rerank'
    const byIndex = new Map<number, number>()
    for (const item of scores) {
      if (!Number.isInteger(item.index) || item.index < 0 || item.index >= candidates.length) continue
      if (!Number.isFinite(item.score) || item.score < 0 || item.score > 1 || byIndex.has(item.index)) continue
      byIndex.set(item.index, item.score)
    }

    return [...byIndex.entries()]
      .map(([index, score]) => ({
        index,
        result: {
          ...this.toSearchResult(candidates[index]),
          score,
          scoreSource
        }
      }))
      .sort((a, b) => b.result.score - a.result.score || candidates[b.index].rrfScore - candidates[a.index].rrfScore)
      .map(({ result }) => result)
  }

  private toSearchResult(candidate: KbSearchCandidate): KbRankedChunk {
    return {
      id: candidate.id,
      path: candidate.path,
      chunkIndex: candidate.chunkIndex,
      parentId: candidate.parentId,
      startLine: candidate.startLine,
      endLine: candidate.endLine,
      startOffset: candidate.startOffset,
      endOffset: candidate.endOffset,
      contextHeader: candidate.contextHeader,
      score: candidate.score,
      scoreSource: candidate.scoreSource,
      snippet: candidate.snippet
    }
  }

  private searchVector(queryVec: number[], model: string, limit: number) {
    if (queryVec.length === 0) return []

    const rows = this.db
      .prepare(
        'SELECT id, path, chunk_index, parent_id, start_line, end_line, start_offset, end_offset, context_header, text, embedding FROM chunks WHERE model = ?'
      )
      .all(model) as Array<{
      id: string
      path: string
      chunk_index: number
      parent_id: string | null
      start_line: number
      end_line: number
      start_offset: number
      end_offset: number
      context_header: string
      text: string
      embedding: string
    }>

    const scored = rows.map((row) => {
      const vec = JSON.parse(row.embedding) as number[]
      return {
        id: row.id,
        path: row.path,
        chunkIndex: row.chunk_index,
        parentId: row.parent_id ?? undefined,
        startLine: row.start_line,
        endLine: row.end_line,
        startOffset: row.start_offset,
        endOffset: row.end_offset,
        contextHeader: row.context_header,
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
          `SELECT
             chunks.id AS id,
             chunks.path AS path,
             chunks.chunk_index AS chunk_index,
             chunks.parent_id AS parent_id,
             chunks.start_line AS start_line,
             chunks.end_line AS end_line,
             chunks.start_offset AS start_offset,
             chunks.end_offset AS end_offset,
             chunks.context_header AS context_header,
             chunks.text AS text,
             bm25(chunks_fts) AS rank
           FROM chunks_fts
           INNER JOIN chunks ON chunks.id = chunks_fts.id
           WHERE chunks_fts MATCH ?
           ORDER BY rank LIMIT ?`
        )
        .all(ftsQuery, limit) as Array<{
        id: string
        path: string
        chunk_index: number
        parent_id: string | null
        start_line: number
        end_line: number
        start_offset: number
        end_offset: number
        context_header: string
        text: string
        rank: number
      }>

      return rows.map((row) => ({
        id: row.id,
        path: row.path,
        chunkIndex: row.chunk_index,
        parentId: row.parent_id ?? undefined,
        startLine: row.start_line,
        endLine: row.end_line,
        startOffset: row.start_offset,
        endOffset: row.end_offset,
        contextHeader: row.context_header,
        snippet: row.text,
        bm25Rank: row.rank
      }))
    } catch {
      return []
    }
  }

  private expandParentResults(results: KbRankedChunk[]): KbExpandedResult[] {
    if (results.length === 0) return []
    const parentIds = [...new Set(results.map((result) => result.parentId).filter((id): id is string => !!id))]
    const parentMap = new Map<
      string,
      { path: string; start_line: number; end_line: number; start_offset: number; end_offset: number; text: string }
    >()

    if (parentIds.length > 0) {
      const placeholders = parentIds.map(() => '?').join(', ')
      const rows = this.db
        .prepare(
          `SELECT id, path, start_line, end_line, start_offset, end_offset, text
           FROM parent_chunks WHERE id IN (${placeholders})`
        )
        .all(...parentIds) as Array<{
        id: string
        path: string
        start_line: number
        end_line: number
        start_offset: number
        end_offset: number
        text: string
      }>
      rows.forEach((row) => parentMap.set(row.id, row))
    }

    const expanded = results.map((result) => {
      const parent = result.parentId ? parentMap.get(result.parentId) : undefined
      if (!parent) {
        return {
          path: result.path,
          startLine: result.startLine,
          endLine: result.endLine,
          startOffset: result.startOffset,
          endOffset: result.endOffset,
          score: result.score,
          scoreSource: result.scoreSource,
          snippet: result.snippet
        }
      }
      return {
        path: parent.path,
        startLine: parent.start_line,
        endLine: parent.end_line,
        startOffset: parent.start_offset,
        endOffset: parent.end_offset,
        score: result.score,
        scoreSource: result.scoreSource,
        snippet: parent.text
      }
    })

    return expanded
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
