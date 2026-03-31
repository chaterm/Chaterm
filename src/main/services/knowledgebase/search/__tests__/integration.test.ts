import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { EmbeddingProvider } from '../types'
import { createMockDatabase } from './mock-database'

// Mock better-sqlite3 so KbSearchManager uses our MockDatabase
vi.mock('better-sqlite3', () => {
  return {
    default: function MockDatabase() {
      return createMockDatabase()
    }
  }
})

import { KbSearchManager } from '../index'

/**
 * Mock embedding provider that produces simple but functional vectors.
 * Words in the text influence the vector values, so semantically similar
 * texts produce similar vectors (for testing purposes).
 */
function createTestProvider(dims = 8): EmbeddingProvider {
  function textToVec(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/)
    const vec = new Array(dims).fill(0)
    for (const word of words) {
      for (let i = 0; i < word.length && i < dims; i++) {
        vec[i] += word.charCodeAt(i) / 1000
      }
    }
    // Normalize
    const norm = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0))
    if (norm > 0) {
      for (let i = 0; i < dims; i++) vec[i] /= norm
    }
    return vec
  }

  return {
    id: 'test',
    model: 'test-embed',
    dims,
    async embedBatch(texts: string[]): Promise<number[][]> {
      return texts.map(textToVec)
    },
    async embedQuery(text: string): Promise<number[]> {
      return textToVec(text)
    }
  }
}

describe('KbSearchManager integration', () => {
  let tmpDir: string
  let dbPath: string
  let kbRoot: string
  let manager: KbSearchManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-search-integration-'))
    dbPath = path.join(tmpDir, 'test.db')
    kbRoot = path.join(tmpDir, 'kb')
    fs.mkdirSync(kbRoot)

    const provider = createTestProvider()
    manager = new KbSearchManager(dbPath, kbRoot, provider)
  })

  afterEach(() => {
    manager.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('fullIndex indexes all text files and skips binaries', async () => {
    // Create various files
    fs.writeFileSync(path.join(kbRoot, 'guide.md'), '# SSH Guide\n\nHow to configure SSH connections.')
    fs.writeFileSync(path.join(kbRoot, 'deploy.sh'), '#!/bin/bash\nssh user@server')
    fs.writeFileSync(path.join(kbRoot, 'config.yaml'), 'server:\n  host: 192.168.1.1\n  port: 22')
    fs.writeFileSync(path.join(kbRoot, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const result = await manager.fullIndex()
    expect(result.files).toBe(3) // md, sh, yaml -- not png
    expect(result.chunks).toBeGreaterThanOrEqual(3)

    const status = manager.status()
    expect(status.totalFiles).toBe(3)
    expect(status.totalChunks).toBeGreaterThanOrEqual(3)
    expect(status.provider).toBe('test')
  })

  it('fullIndex handles subdirectories', async () => {
    fs.mkdirSync(path.join(kbRoot, 'docs'))
    fs.writeFileSync(path.join(kbRoot, 'docs', 'api.md'), '# API Reference\n\nGET /users')
    fs.writeFileSync(path.join(kbRoot, 'readme.md'), '# Project README')

    const result = await manager.fullIndex()
    expect(result.files).toBe(2)
  })

  it('fullIndex skips dot-directories', async () => {
    fs.mkdirSync(path.join(kbRoot, '.hidden'))
    fs.writeFileSync(path.join(kbRoot, '.hidden', 'secret.md'), 'hidden content')
    fs.writeFileSync(path.join(kbRoot, 'visible.md'), 'visible content')

    const result = await manager.fullIndex()
    expect(result.files).toBe(1) // only visible.md
  })

  it('search returns relevant results', async () => {
    fs.writeFileSync(
      path.join(kbRoot, 'ssh.md'),
      '# SSH Configuration\n\nHow to configure SSH keys and connections.\n\nUse ssh-keygen to generate keys.'
    )
    fs.writeFileSync(
      path.join(kbRoot, 'docker.md'),
      '# Docker Guide\n\nHow to build and run Docker containers.\n\nUse docker-compose for multi-container apps.'
    )

    await manager.fullIndex()

    const results = await manager.search('SSH keys configuration', { maxResults: 5, minScore: 0 })
    expect(results.length).toBeGreaterThan(0)
    // SSH doc should be more relevant
    expect(results[0].path).toBe('ssh.md')
  })

  it('search returns empty when no chunks indexed', async () => {
    const results = await manager.search('anything')
    expect(results).toEqual([])
  })

  it('search uses FTS5 keyword matching', async () => {
    fs.writeFileSync(path.join(kbRoot, 'error.md'), 'Error: ECONNREFUSED when connecting to database')
    fs.writeFileSync(path.join(kbRoot, 'success.md'), 'All tests passed successfully')

    await manager.fullIndex()

    const results = await manager.search('ECONNREFUSED', { maxResults: 5, minScore: 0 })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].path).toBe('error.md')
  })

  it('onFileChanged + flushNow indexes new file', async () => {
    fs.writeFileSync(path.join(kbRoot, 'new.md'), 'Brand new content')

    manager.onFileChanged('new.md')
    await manager.flushNow()

    const status = manager.status()
    expect(status.totalFiles).toBe(1)
    expect(status.totalChunks).toBeGreaterThan(0)
  })

  it('onFileRemoved + flushNow cleans up', async () => {
    fs.writeFileSync(path.join(kbRoot, 'temp.md'), 'Temporary content')
    await manager.fullIndex()
    expect(manager.status().totalFiles).toBe(1)

    manager.onFileRemoved('temp.md')
    await manager.flushNow()

    expect(manager.status().totalFiles).toBe(0)
    expect(manager.status().totalChunks).toBe(0)
  })

  it('fullIndex cleans up files that no longer exist', async () => {
    fs.writeFileSync(path.join(kbRoot, 'keep.md'), 'Keep this')
    fs.writeFileSync(path.join(kbRoot, 'remove.md'), 'Remove this')

    await manager.fullIndex()
    expect(manager.status().totalFiles).toBe(2)

    // Delete one file from disk
    fs.unlinkSync(path.join(kbRoot, 'remove.md'))
    await manager.fullIndex()

    expect(manager.status().totalFiles).toBe(1)
  })

  it('re-indexing updates content when file changes', async () => {
    const filePath = path.join(kbRoot, 'doc.md')
    fs.writeFileSync(filePath, 'Version 1: Original content')
    await manager.fullIndex()

    const results1 = await manager.search('Original content', { minScore: 0 })
    expect(results1.length).toBeGreaterThan(0)

    fs.writeFileSync(filePath, 'Version 2: Completely different text about networking')
    manager.onFileChanged('doc.md')
    await manager.flushNow()

    const results2 = await manager.search('networking', { minScore: 0 })
    expect(results2.length).toBeGreaterThan(0)
    expect(results2[0].snippet).toContain('networking')
  })

  it('minScore filters low-relevance results', async () => {
    fs.writeFileSync(path.join(kbRoot, 'a.md'), 'SSH configuration guide for beginners')

    await manager.fullIndex()

    const allResults = await manager.search('unrelated random query xyz', { minScore: 0 })
    const filtered = await manager.search('unrelated random query xyz', { minScore: 0.99 })
    expect(filtered.length).toBeLessThanOrEqual(allResults.length)
  })
})
