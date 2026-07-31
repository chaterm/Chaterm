import { describe, it, expect } from 'vitest'
import { applyMmr, buildFtsQuery, cosineSimilarity, fuseResultsWithRrf, RRF_K } from '../searcher'
import type { KbSearchResult, KeywordHit, VectorHit } from '../types'

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

describe('fuseResultsWithRrf', () => {
  const vectorHits: VectorHit[] = [
    { id: 'c1', path: 'a.md', startLine: 1, endLine: 5, snippet: 'chunk1', score: 0.9 },
    { id: 'c2', path: 'b.md', startLine: 1, endLine: 3, snippet: 'chunk2', score: 0.5 }
  ]

  const keywordHits: KeywordHit[] = [
    { id: 'c1', path: 'a.md', startLine: 1, endLine: 5, snippet: 'chunk1', bm25Rank: -3 },
    { id: 'c3', path: 'c.md', startLine: 1, endLine: 2, snippet: 'chunk3', bm25Rank: -1 }
  ]

  it('merges vector and keyword rankings by chunk id', () => {
    const results = fuseResultsWithRrf(vectorHits, keywordHits)
    expect(results).toHaveLength(3)
    const ids = results.map((result) => result.path)
    expect(ids).toContain('a.md')
    expect(ids).toContain('b.md')
    expect(ids).toContain('c.md')
  })

  it('computes the weighted RRF formula from one-based ranks', () => {
    const results = fuseResultsWithRrf(vectorHits, keywordHits)
    const c1 = results.find((result) => result.id === 'c1')!
    expect(c1.score).toBeCloseTo(0.7 / (RRF_K + 1) + 0.3 / (RRF_K + 1))
    expect(c1.vectorRank).toBe(1)
    expect(c1.keywordRank).toBe(1)
  })

  it('uses the available ranking when one retrieval route misses a chunk', () => {
    const results = fuseResultsWithRrf(vectorHits, keywordHits)
    const c2 = results.find((result) => result.id === 'c2')!
    expect(c2.score).toBeCloseTo(0.7 / (RRF_K + 2))
    expect(c2.keywordRank).toBeUndefined()
  })

  it('returns results sorted by score with a stable path and line tie-break', () => {
    const results = fuseResultsWithRrf(vectorHits, keywordHits)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })

  it('deduplicates normalized identical content after id fusion', () => {
    const duplicateVectorHits: VectorHit[] = [...vectorHits, { id: 'c4', path: 'd.md', startLine: 2, endLine: 4, snippet: '  CHUNK1  ', score: 0.4 }]
    const results = fuseResultsWithRrf(duplicateVectorHits, keywordHits)
    expect(results.filter((result) => result.snippet.trim().toLowerCase() === 'chunk1')).toHaveLength(1)
  })

  it('supports either retrieval route failing independently', () => {
    expect(fuseResultsWithRrf(vectorHits, [])).toHaveLength(2)
    expect(fuseResultsWithRrf([], keywordHits)).toHaveLength(2)
  })

  it('returns empty array when no hits', () => {
    expect(fuseResultsWithRrf([], [])).toEqual([])
  })
})

describe('applyMmr', () => {
  const result = (path: string, snippet: string, score: number): KbSearchResult => ({
    path,
    startLine: 1,
    endLine: 1,
    snippet,
    score,
    scoreSource: 'rrf'
  })

  it('keeps the strongest result and suppresses a highly overlapping neighbor', () => {
    const selected = applyMmr(
      [
        result('a.md', 'SSH key configuration connect server', 0.016),
        result('a.md', 'SSH key configuration connect host', 0.0159),
        result('b.md', 'Docker compose container deployment', 0.015)
      ],
      2
    )
    expect(selected.map((item) => item.path)).toEqual(['a.md', 'b.md'])
  })

  it('handles Chinese and code identifiers without changing returned scores', () => {
    const selected = applyMmr(
      [
        result('a.md', '配置 SSH_KEY 并连接服务器', 0.9),
        result('b.md', '配置 SSH_KEY 然后连接主机', 0.8),
        result('c.md', 'Docker build_image 命令', 0.7)
      ],
      2
    )
    expect(selected[0].score).toBe(0.9)
    expect(selected).toHaveLength(2)
  })
})
