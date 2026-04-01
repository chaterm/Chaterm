import { describe, it, expect } from 'vitest'
import { chunkText, isIndexableFile, INDEXABLE_EXTENSIONS } from '../chunker'

describe('chunkText', () => {
  it('returns empty array for empty content', () => {
    expect(chunkText('')).toEqual([])
  })

  it('returns single chunk for short content', () => {
    const content = 'Hello world\nThis is a test'
    const chunks = chunkText(content, { tokens: 400, overlap: 80 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].startLine).toBe(1)
    expect(chunks[0].endLine).toBe(2)
    expect(chunks[0].text).toBe(content)
  })

  it('splits content into multiple chunks when exceeding maxChars', () => {
    // tokens=10 → maxChars=40, each line ~20 chars → ~2 lines per chunk
    const lines = Array.from({ length: 10 }, (_, i) => `Line number ${i + 1} here`)
    const content = lines.join('\n')
    const chunks = chunkText(content, { tokens: 10, overlap: 0 })
    expect(chunks.length).toBeGreaterThan(1)
    // All text should be covered
    for (const chunk of chunks) {
      expect(chunk.startLine).toBeGreaterThanOrEqual(1)
      expect(chunk.endLine).toBeLessThanOrEqual(10)
      expect(chunk.startLine).toBeLessThanOrEqual(chunk.endLine)
    }
  })

  it('preserves correct line numbers (1-indexed)', () => {
    const content = 'line1\nline2\nline3'
    const chunks = chunkText(content, { tokens: 400, overlap: 0 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].startLine).toBe(1)
    expect(chunks[0].endLine).toBe(3)
  })

  it('applies overlap between chunks', () => {
    // With overlap, consecutive chunks should share some lines
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${String(i + 1).padStart(2, '0')}: some content here.`)
    const content = lines.join('\n')
    const chunks = chunkText(content, { tokens: 10, overlap: 3 })
    expect(chunks.length).toBeGreaterThan(1)

    // Check that second chunk starts before the first chunk ends (overlap)
    if (chunks.length >= 2) {
      expect(chunks[1].startLine).toBeLessThanOrEqual(chunks[0].endLine)
    }
  })

  it('splits overly long single lines into max-sized chunks', () => {
    const chunkTokens = 10
    const maxChars = chunkTokens * 4 // 40
    const content = 'a'.repeat(maxChars * 3 + 10)
    const chunks = chunkText(content, { tokens: chunkTokens, overlap: 0 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(maxChars)
    }
  })

  it('produces SHA256 hashes for each chunk', () => {
    const content = 'Hello\nWorld'
    const chunks = chunkText(content, { tokens: 400, overlap: 0 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces different hashes for different content', () => {
    const c1 = chunkText('Hello', { tokens: 400, overlap: 0 })
    const c2 = chunkText('World', { tokens: 400, overlap: 0 })
    expect(c1[0].hash).not.toBe(c2[0].hash)
  })

  it('produces same hash for same content', () => {
    const c1 = chunkText('Hello\nWorld', { tokens: 400, overlap: 0 })
    const c2 = chunkText('Hello\nWorld', { tokens: 400, overlap: 0 })
    expect(c1[0].hash).toBe(c2[0].hash)
  })

  it('uses default parameters (tokens=400, overlap=80)', () => {
    const content = 'short text'
    const chunks = chunkText(content)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe('short text')
  })

  it('handles content with empty lines', () => {
    const content = 'line1\n\n\nline4'
    const chunks = chunkText(content, { tokens: 400, overlap: 0 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe(content)
    expect(chunks[0].startLine).toBe(1)
    expect(chunks[0].endLine).toBe(4)
  })
})

describe('isIndexableFile', () => {
  it('accepts markdown files', () => {
    expect(isIndexableFile('readme.md')).toBe(true)
    expect(isIndexableFile('doc/guide.MD')).toBe(true)
  })

  it('accepts script files', () => {
    expect(isIndexableFile('deploy.sh')).toBe(true)
    expect(isIndexableFile('script.py')).toBe(true)
    expect(isIndexableFile('app.ts')).toBe(true)
    expect(isIndexableFile('main.go')).toBe(true)
  })

  it('accepts config files', () => {
    expect(isIndexableFile('config.yaml')).toBe(true)
    expect(isIndexableFile('settings.json')).toBe(true)
    expect(isIndexableFile('app.toml')).toBe(true)
    expect(isIndexableFile('my.conf')).toBe(true)
  })

  it('accepts plain text files', () => {
    expect(isIndexableFile('notes.txt')).toBe(true)
    expect(isIndexableFile('output.log')).toBe(true)
    expect(isIndexableFile('data.csv')).toBe(true)
  })

  it('rejects binary files', () => {
    expect(isIndexableFile('image.png')).toBe(false)
    expect(isIndexableFile('photo.jpg')).toBe(false)
    expect(isIndexableFile('app.exe')).toBe(false)
    expect(isIndexableFile('lib.dll')).toBe(false)
    expect(isIndexableFile('data.db')).toBe(false)
    expect(isIndexableFile('index.sqlite3')).toBe(false)
  })

  it('rejects files with no extension', () => {
    expect(isIndexableFile('Makefile')).toBe(false)
    expect(isIndexableFile('LICENSE')).toBe(false)
  })

  it('is case-insensitive for extensions', () => {
    expect(isIndexableFile('README.MD')).toBe(true)
    expect(isIndexableFile('script.SH')).toBe(true)
    expect(isIndexableFile('IMAGE.PNG')).toBe(false)
  })

  it('handles paths with directories', () => {
    expect(isIndexableFile('docs/guide.md')).toBe(true)
    expect(isIndexableFile('src/main/app.ts')).toBe(true)
    expect(isIndexableFile('assets/logo.png')).toBe(false)
  })
})

describe('INDEXABLE_EXTENSIONS', () => {
  it('contains common text file extensions', () => {
    expect(INDEXABLE_EXTENSIONS.has('.md')).toBe(true)
    expect(INDEXABLE_EXTENSIONS.has('.txt')).toBe(true)
    expect(INDEXABLE_EXTENSIONS.has('.sh')).toBe(true)
    expect(INDEXABLE_EXTENSIONS.has('.yaml')).toBe(true)
    expect(INDEXABLE_EXTENSIONS.has('.json')).toBe(true)
    expect(INDEXABLE_EXTENSIONS.has('.py')).toBe(true)
  })

  it('does not contain binary extensions', () => {
    expect(INDEXABLE_EXTENSIONS.has('.png')).toBe(false)
    expect(INDEXABLE_EXTENSIONS.has('.exe')).toBe(false)
    expect(INDEXABLE_EXTENSIONS.has('.db')).toBe(false)
  })
})
