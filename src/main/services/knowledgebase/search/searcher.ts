import type { KbSearchResult, VectorHit, KeywordHit } from './types'
import { getDefaultLanguage } from '../../../config/edition'

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function bm25RankToScore(rank: number): number {
  if (rank < 0) {
    const relevance = -rank
    return relevance / (1 + relevance)
  }
  return 1 / (1 + rank)
}

const CJK_LOCALE_PREFIXES = ['zh', 'ja', 'ko']
let cjkSegmenter: Intl.Segmenter | null = null

function getCjkSegmenter(): Intl.Segmenter {
  if (!cjkSegmenter) cjkSegmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  return cjkSegmenter
}

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/

function tokenizeCjk(raw: string): string[] {
  return [...getCjkSegmenter().segment(raw)]
    .filter((s) => s.isWordLike)
    .map((s) => s.segment.replace(/"/g, ''))
    .filter(Boolean)
}

function tokenizeDefault(raw: string): string[] {
  return (raw.match(/[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.replace(/"/g, '')).filter(Boolean)
}

export function buildFtsQuery(raw: string): string | null {
  const locale = getDefaultLanguage()
  const useCjk = CJK_LOCALE_PREFIXES.some((p) => locale.startsWith(p)) || CJK_RE.test(raw)
  const tokens = useCjk ? tokenizeCjk(raw) : tokenizeDefault(raw)
  if (tokens.length === 0) return null
  return tokens.map((t) => `"${t}"`).join(' OR ')
}

interface MergeOptions {
  vectorWeight: number
  textWeight: number
  minScore?: number
  maxResults?: number
}

export function mergeResults(vectorHits: VectorHit[], keywordHits: KeywordHit[], opts: MergeOptions): KbSearchResult[] {
  const map = new Map<string, { path: string; startLine: number; endLine: number; snippet: string; vectorScore: number; textScore: number }>()

  for (const v of vectorHits) {
    map.set(v.id, {
      path: v.path,
      startLine: v.startLine,
      endLine: v.endLine,
      snippet: v.snippet,
      vectorScore: v.score,
      textScore: 0
    })
  }

  for (const k of keywordHits) {
    const existing = map.get(k.id)
    const textScore = bm25RankToScore(k.bm25Rank)
    if (existing) {
      existing.textScore = textScore
    } else {
      map.set(k.id, {
        path: k.path,
        startLine: k.startLine,
        endLine: k.endLine,
        snippet: k.snippet,
        vectorScore: 0,
        textScore
      })
    }
  }

  let results: KbSearchResult[] = []
  for (const entry of map.values()) {
    const score = opts.vectorWeight * entry.vectorScore + opts.textWeight * entry.textScore
    results.push({
      path: entry.path,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score,
      snippet: entry.snippet
    })
  }

  if (opts.minScore !== undefined) {
    results = results.filter((r) => r.score >= opts.minScore!)
  }

  results.sort((a, b) => b.score - a.score)

  if (opts.maxResults !== undefined) {
    results = results.slice(0, opts.maxResults)
  }

  return results
}
