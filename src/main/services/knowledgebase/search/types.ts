export interface KbChunk {
  id: string
  path: string
  startLine: number
  endLine: number
  text: string
  hash: string
  embedding: number[]
}

export interface KbFileEntry {
  path: string
  hash: string
  mtimeMs: number
  size: number
}

export interface KbSearchResult {
  path: string
  startLine: number
  endLine: number
  score: number
  snippet: string
}

export interface VectorHit {
  id: string
  path: string
  startLine: number
  endLine: number
  snippet: string
  score: number
}

export interface KeywordHit {
  id: string
  path: string
  startLine: number
  endLine: number
  snippet: string
  bm25Rank: number
}

export interface EmbeddingConfig {
  region: 'global' | 'cn'
  apiKey: string
  baseUrl: string
}

export interface EmbeddingProvider {
  readonly id: string
  readonly model: string
  readonly dims: number
  embedBatch(texts: string[]): Promise<number[][]>
  embedQuery(text: string): Promise<number[]>
}

export interface SearchOptions {
  maxResults?: number
  minScore?: number
  vectorWeight?: number
  textWeight?: number
}

export interface SearchStatus {
  totalFiles: number
  totalChunks: number
  model: string
  provider: string
}

/** Raw chunk before embedding (output of chunkText) */
export interface RawChunk {
  startLine: number
  endLine: number
  text: string
  hash: string
}
