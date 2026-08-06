export interface KbChunk {
  id: string
  path: string
  chunkIndex: number
  parentId?: string
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
  contextHeader: string
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
  scoreSource: 'dedicated-rerank' | 'llm-rerank' | 'rrf' | 'vector'
  snippet: string
}

export interface KbRankedChunk extends KbSearchResult {
  chunkIndex: number
  parentId?: string
  startOffset: number
  endOffset: number
  contextHeader: string
}

export interface KbSearchCandidate extends KbRankedChunk {
  id: string
  rrfScore: number
  vectorRank?: number
  keywordRank?: number
}

export interface VectorHit {
  id: string
  path: string
  chunkIndex: number
  parentId?: string
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
  contextHeader: string
  snippet: string
  score: number
}

export interface KeywordHit {
  id: string
  path: string
  chunkIndex: number
  parentId?: string
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
  contextHeader: string
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
  reranker?: KbReranker
}

export interface VectorSearchOptions {
  maxResults?: number
  minScore?: number
}

export interface KbRerankCandidate {
  index: number
  id: string
  path: string
  startLine: number
  endLine: number
  text: string
  retrievalScore: number
}

export interface KbRerankScore {
  index: number
  score: number
}

export interface KbReranker {
  readonly type: 'dedicated' | 'llm'
  rerank(query: string, candidates: KbRerankCandidate[]): Promise<KbRerankScore[]>
}

export interface SearchStatus {
  totalFiles: number
  totalChunks: number
  model: string
  provider: string
}

/** Child chunk before persistence and embedding. Offsets use Unicode code points. */
export interface RawChunk {
  parentIndex: number
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
  contextHeader: string
  text: string
}

/** Parent context chunk. Parent chunks are persisted but never embedded. */
export interface RawParentChunk {
  parentIndex: number
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
  text: string
}

export interface ChunkedDocument {
  parents: RawParentChunk[]
  children: RawChunk[]
}
