import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { KbSearchProgress } from '../../../agent/shared/ExtensionMessage'
import { KbSearchManager } from '../search'
import type { DocumentChunker, EmbeddingProvider } from '../search/types'

describe('KbSearchManager progress', () => {
  let tempDir: string | undefined
  let manager: KbSearchManager | undefined

  afterEach(() => {
    manager?.close()
    manager = undefined
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true })
    tempDir = undefined
  })

  it('reports measured retrieval and rerank stages', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaterm-kb-progress-'))
    const kbRoot = path.join(tempDir, 'knowledgebase')
    fs.mkdirSync(kbRoot)
    fs.writeFileSync(path.join(kbRoot, 'beegfs.md'), 'BeeGFS client mount configuration and troubleshooting steps.')

    const provider: EmbeddingProvider = {
      id: 'test-provider',
      model: 'test-embedding',
      dims: 2,
      embedBatch: vi.fn(async (texts: string[]) => texts.map(() => [1, 0])),
      embedQuery: vi.fn(async () => [1, 0])
    }
    const chunker: DocumentChunker = {
      chunkDocument: vi.fn(async (content: string) => ({
        parents: [{ parentIndex: 0, startLine: 1, endLine: 1, startOffset: 0, endOffset: content.length, text: content }],
        children: [
          {
            parentIndex: 0,
            startLine: 1,
            endLine: 1,
            startOffset: 0,
            endOffset: content.length,
            contextHeader: '',
            text: content
          }
        ]
      })),
      close: vi.fn()
    }
    manager = new KbSearchManager(path.join(tempDir, 'kb_search.db'), kbRoot, provider, chunker)
    await manager.fullIndex()

    const progress: KbSearchProgress[] = []
    const results = await manager.search('BeeGFS mount', {
      reranker: {
        type: 'llm',
        rerank: vi.fn(async () => [{ index: 0, score: 0.95 }])
      },
      onProgress: (event) => {
        progress.push(event)
      }
    })

    expect(results).toHaveLength(1)
    expect(progress.map((event) => event.phase)).toEqual(['embedding', 'retrieving', 'reranking', 'completed'])
    expect(progress.at(-1)).toEqual(
      expect.objectContaining({
        candidateCount: 1,
        resultCount: 1,
        rerankerType: 'llm',
        rerankFallback: false,
        embeddingFallback: false,
        embeddingMs: expect.any(Number),
        retrievalMs: expect.any(Number),
        rerankMs: expect.any(Number)
      })
    )

    const fallbackProgress: KbSearchProgress[] = []
    const fallbackResults = await manager.search('BeeGFS mount', {
      reranker: {
        type: 'llm',
        rerank: vi.fn(async () => {
          throw new Error('rerank unavailable')
        })
      },
      onProgress: (event) => {
        fallbackProgress.push(event)
      }
    })

    expect(fallbackResults).toHaveLength(1)
    expect(fallbackProgress.at(-1)).toEqual(expect.objectContaining({ phase: 'completed', rerankFallback: true, resultCount: 1 }))
  })
})
