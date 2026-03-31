import { describe, it, expect } from 'vitest'
import { cosineSimilarity, bm25RankToScore, buildFtsQuery, mergeResults } from '../searcher'
import type { VectorHit, KeywordHit } from '../types'

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0)
  })

  it('returns 0 when either vector is zero', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0)
    expect(cosineSimilarity([1, 2], [0, 0])).toBe(0)
  })

  it('computes correct similarity for known vectors', () => {
    // cos([1,0], [1,1]) = 1 / sqrt(2) ≈ 0.7071
    expect(cosineSimilarity([1, 0], [1, 1])).toBeCloseTo(1 / Math.sqrt(2))
  })

  it('handles negative components', () => {
    // cos([1,0], [-1,0]) = -1 but we clamp result
    const sim = cosineSimilarity([1, 0], [-1, 0])
    expect(sim).toBeCloseTo(-1.0)
  })
})

describe('bm25RankToScore', () => {
  it('converts negative rank to score in (0, 1)', () => {
    // rank = -2 → relevance = 2 → score = 2/3 ≈ 0.667
    expect(bm25RankToScore(-2)).toBeCloseTo(2 / 3)
  })

  it('converts zero rank to 1', () => {
    // rank = 0 → score = 1 / (1+0) = 1
    expect(bm25RankToScore(0)).toBeCloseTo(1.0)
  })

  it('converts positive rank to score in (0, 1)', () => {
    // rank = 1 → score = 1/2 = 0.5
    expect(bm25RankToScore(1)).toBeCloseTo(0.5)
  })

  it('higher relevance (more negative rank) gives higher score', () => {
    expect(bm25RankToScore(-10)).toBeGreaterThan(bm25RankToScore(-1))
  })
})

describe('buildFtsQuery', () => {
  it('returns null for empty string', () => {
    expect(buildFtsQuery('')).toBeNull()
  })

  it('returns null for string with only punctuation', () => {
    expect(buildFtsQuery('!@#$%')).toBeNull()
  })

  // --- Default (non-CJK) tokenization ---
  it('extracts tokens and joins with OR', () => {
    expect(buildFtsQuery('hello world')).toBe('"hello" OR "world"')
  })

  it('strips quotes from tokens', () => {
    expect(buildFtsQuery('"hello"')).toBe('"hello"')
  })

  // --- CJK tokenization (auto-detected from content) ---
  it('segments Chinese into words', () => {
    const result = buildFtsQuery('如何使用阿里云ossutil工具')
    expect(result).toContain('"ossutil"')
    // Should NOT be a single giant token
    expect(result!.split(' OR ').length).toBeGreaterThan(2)
  })

  it('handles mixed space-separated CJK and Latin', () => {
    const result = buildFtsQuery('SSH 配置')
    expect(result).toContain('"SSH"')
    expect(result).toContain('"配置"')
  })

  it('handles mixed inline CJK and Latin', () => {
    const result = buildFtsQuery('deploy 部署 v2')
    expect(result).toContain('"deploy"')
    expect(result).toContain('"部署"')
    expect(result).toContain('"v2"')
  })

  // CJK segmenter is also triggered by content detection (CJK_RE)
  it('segments Chinese words correctly', () => {
    const result = buildFtsQuery('如何使用工具')
    expect(result).toContain('"如何"')
    expect(result).toContain('"使用"')
    expect(result).toContain('"工具"')
  })
})

describe('mergeResults', () => {
  const vectorHits: VectorHit[] = [
    { id: 'c1', path: 'a.md', startLine: 1, endLine: 5, snippet: 'chunk1', score: 0.9 },
    { id: 'c2', path: 'b.md', startLine: 1, endLine: 3, snippet: 'chunk2', score: 0.5 }
  ]

  const keywordHits: KeywordHit[] = [
    { id: 'c1', path: 'a.md', startLine: 1, endLine: 5, snippet: 'chunk1', bm25Rank: -3 },
    { id: 'c3', path: 'c.md', startLine: 1, endLine: 2, snippet: 'chunk3', bm25Rank: -1 }
  ]

  it('merges vector and keyword results by id', () => {
    const results = mergeResults(vectorHits, keywordHits, { vectorWeight: 0.7, textWeight: 0.3 })
    // Should have c1, c2, c3
    expect(results).toHaveLength(3)
    const ids = results.map((r) => r.path)
    expect(ids).toContain('a.md')
    expect(ids).toContain('b.md')
    expect(ids).toContain('c.md')
  })

  it('computes combined score correctly for overlapping results', () => {
    const results = mergeResults(vectorHits, keywordHits, { vectorWeight: 0.7, textWeight: 0.3 })
    const c1 = results.find((r) => r.path === 'a.md')!
    // c1: vectorScore=0.9, bm25Rank=-3 → textScore=3/4=0.75
    // combined = 0.7*0.9 + 0.3*0.75 = 0.63 + 0.225 = 0.855
    expect(c1.score).toBeCloseTo(0.855)
  })

  it('assigns zero for missing dimension', () => {
    const results = mergeResults(vectorHits, keywordHits, { vectorWeight: 0.7, textWeight: 0.3 })
    const c2 = results.find((r) => r.path === 'b.md')!
    // c2: only vector, no keyword → textScore=0
    // combined = 0.7*0.5 + 0.3*0 = 0.35
    expect(c2.score).toBeCloseTo(0.35)
  })

  it('returns results sorted by score descending', () => {
    const results = mergeResults(vectorHits, keywordHits, { vectorWeight: 0.7, textWeight: 0.3 })
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })

  it('filters by minScore', () => {
    const results = mergeResults(vectorHits, keywordHits, {
      vectorWeight: 0.7,
      textWeight: 0.3,
      minScore: 0.5
    })
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('limits results by maxResults', () => {
    const results = mergeResults(vectorHits, keywordHits, {
      vectorWeight: 0.7,
      textWeight: 0.3,
      maxResults: 1
    })
    expect(results).toHaveLength(1)
  })

  it('returns empty array when no hits', () => {
    expect(mergeResults([], [], { vectorWeight: 0.7, textWeight: 0.3 })).toEqual([])
  })
})
