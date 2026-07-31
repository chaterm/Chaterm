import type { KbSearchCandidate, KbSearchResult, VectorHit, KeywordHit } from './types'
import { getDefaultLanguage } from '../../../config/edition'

export const RRF_K = 60
export const RRF_VECTOR_WEIGHT = 0.7
export const RRF_KEYWORD_WEIGHT = 0.3
export const MMR_LAMBDA = 0.7

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

function normalizeContentSignature(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function fuseResultsWithRrf(vectorHits: VectorHit[], keywordHits: KeywordHit[]): KbSearchCandidate[] {
  const vectorRanks = new Map<string, number>()
  const keywordRanks = new Map<string, number>()
  const candidates = new Map<string, Omit<KbSearchCandidate, 'score' | 'scoreSource' | 'rrfScore'>>()

  vectorHits.forEach((hit, index) => {
    const rank = index + 1
    if (!vectorRanks.has(hit.id)) vectorRanks.set(hit.id, rank)
    if (!candidates.has(hit.id)) {
      candidates.set(hit.id, {
        id: hit.id,
        path: hit.path,
        startLine: hit.startLine,
        endLine: hit.endLine,
        snippet: hit.snippet,
        vectorRank: rank
      })
    }
  })

  keywordHits.forEach((hit, index) => {
    const rank = index + 1
    if (!keywordRanks.has(hit.id)) keywordRanks.set(hit.id, rank)
    const existing = candidates.get(hit.id)
    if (existing) {
      existing.keywordRank = rank
    } else {
      candidates.set(hit.id, {
        id: hit.id,
        path: hit.path,
        startLine: hit.startLine,
        endLine: hit.endLine,
        snippet: hit.snippet,
        keywordRank: rank
      })
    }
  })

  const fused = [...candidates.values()].map((candidate) => {
    const vectorRank = vectorRanks.get(candidate.id)
    const keywordRank = keywordRanks.get(candidate.id)
    const rrfScore =
      (vectorRank === undefined ? 0 : RRF_VECTOR_WEIGHT / (RRF_K + vectorRank)) +
      (keywordRank === undefined ? 0 : RRF_KEYWORD_WEIGHT / (RRF_K + keywordRank))

    return {
      ...candidate,
      vectorRank,
      keywordRank,
      score: rrfScore,
      rrfScore,
      scoreSource: 'rrf' as const
    }
  })

  fused.sort((a, b) => b.rrfScore - a.rrfScore || a.path.localeCompare(b.path) || a.startLine - b.startLine || a.id.localeCompare(b.id))

  const seenContent = new Set<string>()
  return fused.filter((candidate) => {
    const signature = normalizeContentSignature(candidate.snippet)
    if (!signature) return true
    if (seenContent.has(signature)) return false
    seenContent.add(signature)
    return true
  })
}

function tokenizeForSimilarity(text: string): Set<string> {
  const normalized = text.toLowerCase().trim()
  if (!normalized) return new Set()
  const tokens = CJK_RE.test(normalized)
    ? [...getCjkSegmenter().segment(normalized)].filter((part) => part.isWordLike).map((part) => part.segment)
    : (normalized.match(/[\p{L}\p{N}_-]+/gu) ?? [])
  return new Set(tokens.filter(Boolean))
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection++
  }
  return intersection / (a.size + b.size - intersection)
}

export function applyMmr(results: KbSearchResult[], limit: number, lambda = MMR_LAMBDA): KbSearchResult[] {
  if (limit <= 0 || results.length === 0) return []

  const maxScore = Math.max(...results.map((result) => result.score), Number.EPSILON)
  const candidates = results.map((result) => ({
    result,
    relevance: result.score / maxScore,
    tokens: tokenizeForSimilarity(result.snippet)
  }))
  const selected: Array<{ result: KbSearchResult; relevance: number; tokens: Set<string> }> = []

  while (selected.length < limit && candidates.length > 0) {
    let bestIndex = 0
    let bestScore = Number.NEGATIVE_INFINITY

    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index]
      let redundancy = 0
      for (const existing of selected) {
        redundancy = Math.max(redundancy, jaccardSimilarity(candidate.tokens, existing.tokens))
      }
      const mmrScore = lambda * candidate.relevance - (1 - lambda) * redundancy
      if (mmrScore > bestScore) {
        bestScore = mmrScore
        bestIndex = index
      }
    }

    selected.push(candidates[bestIndex])
    candidates.splice(bestIndex, 1)
  }

  return selected.map(({ result }) => result)
}
