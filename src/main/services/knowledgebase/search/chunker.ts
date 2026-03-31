import { createHash } from 'crypto'
import path from 'path'
import type { RawChunk } from './types'

export const INDEXABLE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.sh',
  '.bash',
  '.zsh',
  '.yaml',
  '.yml',
  '.json',
  '.toml',
  '.ini',
  '.conf',
  '.cfg',
  '.py',
  '.js',
  '.ts',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.sql',
  '.html',
  '.css',
  '.xml',
  '.csv',
  '.log',
  '.env',
  '.dockerfile',
  '.makefile'
])

export function isIndexableFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  if (!ext) return false
  return INDEXABLE_EXTENSIONS.has(ext)
}

export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex')
}

/**
 * Split text content into chunks with overlap.
 * Ported from OpenClaw src/memory/internal.ts:chunkMarkdown
 */
export function chunkText(content: string, opts: { tokens?: number; overlap?: number } = {}): RawChunk[] {
  const tokens = opts.tokens ?? 400
  const overlap = opts.overlap ?? 80

  const lines = content.split('\n')
  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
    return []
  }

  const maxChars = Math.max(32, tokens * 4)
  const overlapChars = Math.max(0, overlap * 4)
  const chunks: RawChunk[] = []

  let current: Array<{ line: string; lineNo: number }> = []
  let currentChars = 0

  const flush = () => {
    if (current.length === 0) return
    const first = current[0]
    const last = current[current.length - 1]
    if (!first || !last) return
    const text = current.map((e) => e.line).join('\n')
    chunks.push({
      startLine: first.lineNo,
      endLine: last.lineNo,
      text,
      hash: hashText(text)
    })
  }

  const carryOverlap = () => {
    if (overlapChars <= 0 || current.length === 0) {
      current = []
      currentChars = 0
      return
    }
    let acc = 0
    const kept: Array<{ line: string; lineNo: number }> = []
    for (let i = current.length - 1; i >= 0; i--) {
      const entry = current[i]
      if (!entry) continue
      acc += entry.line.length + 1
      kept.unshift(entry)
      if (acc >= overlapChars) break
    }
    current = kept
    currentChars = kept.reduce((sum, e) => sum + e.line.length + 1, 0)
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const lineNo = i + 1

    // Split overly long lines into segments
    const segments: string[] = []
    if (line.length === 0) {
      segments.push('')
    } else {
      for (let start = 0; start < line.length; start += maxChars) {
        segments.push(line.slice(start, start + maxChars))
      }
    }

    for (const segment of segments) {
      const lineSize = segment.length + 1
      if (currentChars + lineSize > maxChars && current.length > 0) {
        flush()
        carryOverlap()
      }
      current.push({ line: segment, lineNo })
      currentChars += lineSize
    }
  }

  flush()
  return chunks
}
