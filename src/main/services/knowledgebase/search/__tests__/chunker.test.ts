import { describe, expect, it } from 'vitest'
import {
  ABSOLUTE_MAX_CHUNK_SIZE,
  buildEmbeddingText,
  CHILD_CHUNK_OVERLAP,
  CHILD_CHUNK_SIZE,
  chunkDocument,
  INDEXABLE_EXTENSIONS,
  isIndexableFile,
  PARENT_CHUNK_OVERLAP,
  PARENT_CHUNK_SIZE
} from '../chunker'

describe('chunkDocument', () => {
  it('returns no chunks for empty content', () => {
    expect(chunkDocument('', 'empty.md')).toEqual({ parents: [], children: [] })
  })

  it('keeps a short document as a searchable unparented child', () => {
    const content = '# SSH Guide\n\nConfigure SSH keys.'
    const result = chunkDocument(content, 'guide.md')

    expect(result.parents).toEqual([])
    expect(result.children).toEqual([
      expect.objectContaining({
        parentIndex: -1,
        startLine: 1,
        endLine: 3,
        startOffset: 0,
        endOffset: Array.from(content).length,
        text: content
      })
    ])
  })

  it('uses heading-aware breadcrumbs for structured Markdown children', () => {
    const body = Array.from({ length: 18 }, () => 'SSH configuration details and troubleshooting guidance.').join('\n')
    const content = `# Chaterm\n\n## Install\n${body}\n\n## Configure\n${body}\n\n## Troubleshoot\n${body}`
    const result = chunkDocument(content, 'guide.md')

    expect(result.parents.length).toBeGreaterThan(0)
    expect(result.children.length).toBeGreaterThan(3)
    expect(result.children.some((chunk) => chunk.contextHeader.includes('# Chaterm') && chunk.contextHeader.includes('## Configure'))).toBe(true)
    expect(result.children.every((chunk) => chunk.parentIndex >= 0)).toBe(true)

    const runes = Array.from(content)
    for (const chunk of [...result.parents, ...result.children]) {
      expect(runes.slice(chunk.startOffset, chunk.endOffset).join('')).toBe(chunk.text)
    }
  })

  it('groups adjacent small heading parents without changing their child chunks', () => {
    const sections = Array.from({ length: 12 }, (_, index) => `### Step ${index + 1}\n${`detail-${index + 1} `.repeat(12)}\n`)
    const content = sections.join('')
    const result = chunkDocument(content, 'steps.md')

    expect(result.parents).toHaveLength(1)
    expect(result.parents[0]).toEqual(
      expect.objectContaining({
        startOffset: 0,
        endOffset: Array.from(content).length,
        text: content
      })
    )
    expect(result.children).toHaveLength(sections.length)
    expect(result.children.map((chunk) => chunk.text)).toEqual(sections)
    expect(result.children.every((chunk) => chunk.parentIndex === 0)).toBe(true)
  })

  it('never merges adjacent parents across a top-level Markdown heading', () => {
    const content = Array.from(
      { length: 4 },
      (_, index) => `# Chapter ${index + 1}\n${Array.from({ length: 45 }, () => `chapter-${index + 1} details`).join('\n')}\n`
    ).join('')
    const result = chunkDocument(content, 'chapters.md')

    expect(result.parents).toHaveLength(4)
    for (const parent of result.parents) {
      expect(parent.text.match(/^# Chapter/gm)).toHaveLength(1)
      expect(Array.from(parent.text).length).toBeLessThanOrEqual(PARENT_CHUNK_SIZE)
    }
    expect(result.children.every((chunk) => chunk.parentIndex >= 0)).toBe(true)
  })

  it('balances a small final parent group without introducing a second size target', () => {
    const section = (index: number, size: number) => `### Section ${index}\n${String(index).repeat(size)}\n`
    const content = [section(1, 1500), section(2, 1500), section(3, 900), section(4, 300)].join('')
    const result = chunkDocument(content, 'balanced.md')

    expect(result.parents).toHaveLength(2)
    expect(result.parents.every((parent) => Array.from(parent.text).length <= PARENT_CHUNK_SIZE)).toBe(true)
    expect(Array.from(result.parents[1].text).length).toBeGreaterThan(1000)
    expect(result.children.every((chunk) => chunk.parentIndex >= 0)).toBe(true)
  })

  it('does not treat Shell comments as Markdown headings', () => {
    const content = [
      '#!/bin/bash',
      ...Array.from({ length: 12 }, (_, index) => [
        `# Step ${index + 1}`,
        `echo "preparing step ${index + 1}"`,
        `echo "running step ${index + 1}"`
      ]).flat()
    ].join('\n')

    const shellResult = chunkDocument(content, 'deploy.sh')
    const markdownResult = chunkDocument(content, 'deploy.md')

    expect(shellResult.parents).toHaveLength(1)
    expect(shellResult.children.length).toBeGreaterThan(1)
    expect(shellResult.children.every((chunk) => chunk.parentIndex === 0)).toBe(true)
    expect(markdownResult.parents).toHaveLength(0)
    expect(markdownResult.children.every((chunk) => chunk.parentIndex === -1)).toBe(true)
  })

  it('carries the deepest active heading into a large section', () => {
    const content = [
      '# Product',
      '## Guide',
      '### Install',
      Array.from({ length: 40 }, () => 'Install details.').join('\n'),
      '### Configure',
      Array.from({ length: 40 }, () => 'Configuration details.').join('\n'),
      '## Reference',
      Array.from({ length: 40 }, () => 'Reference details.').join('\n'),
      '## FAQ',
      Array.from({ length: 40 }, () => 'FAQ details.').join('\n')
    ].join('\n')
    const result = chunkDocument(content, 'product.md')

    expect(result.children.some((chunk) => chunk.contextHeader.includes('### Configure'))).toBe(true)
  })

  it('uses Chinese chapter markers as heuristic boundaries', () => {
    const content = Array.from({ length: 7 }, (_, index) => `第${index + 1}章 主题${index + 1}\n${`章节${index + 1}内容。`.repeat(45)}`).join('\n\n')
    const result = chunkDocument(content, 'chapters.txt')

    expect(result.children.length).toBeGreaterThan(1)
    expect(result.children.some((chunk) => chunk.text.includes('第2章'))).toBe(true)
  })

  it('keeps complete paragraphs when paragraph boundaries fit the child target', () => {
    const paragraphs = Array.from({ length: 8 }, (_, index) => `Paragraph ${index + 1}: ${`semantic-unit-${index + 1} `.repeat(10)}`)
    const result = chunkDocument(paragraphs.join('\n\n'), 'paragraphs.txt')

    for (const paragraph of paragraphs) {
      expect(result.children.some((chunk) => chunk.text.includes(paragraph))).toBe(true)
    }
  })

  it('repeats a Markdown table header without splitting individual rows', () => {
    const header = '| Name | Value |\n| --- | --- |\n'
    const rows = Array.from({ length: 30 }, (_, index) => `| row-${index + 1} | ${'value '.repeat(6)}|`)
    const result = chunkDocument(header + rows.join('\n') + '\n', 'table.md')

    expect(result.children.length).toBeGreaterThan(1)
    expect(result.children.every((chunk) => chunk.text.startsWith(header))).toBe(true)
    for (const row of rows) {
      expect(result.children.some((chunk) => chunk.text.includes(row))).toBe(true)
    }
  })

  it('keeps a protected fenced code block atomic below the WeKnora absolute maximum', () => {
    const code = `\`\`\`ts\n${'const value = 1\n'.repeat(40)}\`\`\``
    const result = chunkDocument(code, 'code.md')

    expect(Array.from(code).length).toBeGreaterThan(CHILD_CHUNK_SIZE)
    expect(result.children).toHaveLength(1)
    expect(result.children[0].text).toBe(code)
  })

  it('force-splits protected content only at the absolute maximum', () => {
    const code = `\`\`\`txt\n${'x'.repeat(ABSOLUTE_MAX_CHUNK_SIZE + 500)}\n\`\`\``
    const result = chunkDocument(code, 'code.md')

    expect(result.children.length).toBeGreaterThan(1)
    expect(result.children.every((chunk) => Array.from(chunk.text).length <= ABSOLUTE_MAX_CHUNK_SIZE)).toBe(true)
  })

  it('treats the configured chunk size as a target for an indivisible long line', () => {
    const content = 'x'.repeat(CHILD_CHUNK_SIZE * 3)
    const result = chunkDocument(content, 'long-line.txt')

    expect(result.children).toHaveLength(1)
    expect(result.children[0].text).toBe(content)
    expect(Array.from(result.children[0].text).length).toBeGreaterThan(CHILD_CHUNK_SIZE)
  })

  it('does not split a protected Markdown link below the absolute maximum', () => {
    const content = `[documentation](https://example.com/${'path-segment/'.repeat(40)})`
    const result = chunkDocument(content, 'link.md')

    expect(Array.from(content).length).toBeGreaterThan(CHILD_CHUNK_SIZE)
    expect(result.children).toHaveLength(1)
    expect(result.children[0].text).toBe(content)
  })

  it('tracks Unicode offsets in code points rather than UTF-16 code units', () => {
    const content = '标题😀\n正文🚀'
    const [chunk] = chunkDocument(content, 'unicode.txt').children

    expect(chunk.startOffset).toBe(0)
    expect(chunk.endOffset).toBe(Array.from(content).length)
    expect(chunk.endOffset).toBeLessThan(content.length)
  })

  it('prepends path and heading context only to embedding text', () => {
    const chunk = {
      parentIndex: -1,
      startLine: 1,
      endLine: 1,
      startOffset: 0,
      endOffset: 4,
      contextHeader: '# Guide',
      text: 'body'
    }

    expect(buildEmbeddingText('docs/guide.md', chunk)).toBe('docs/guide.md\n\n# Guide\n\nbody')
    expect(chunk.text).toBe('body')
  })

  it('pins the selected WeKnora parent and child defaults', () => {
    expect({ PARENT_CHUNK_SIZE, PARENT_CHUNK_OVERLAP, CHILD_CHUNK_SIZE, CHILD_CHUNK_OVERLAP }).toEqual({
      PARENT_CHUNK_SIZE: 4096,
      PARENT_CHUNK_OVERLAP: 80,
      CHILD_CHUNK_SIZE: 384,
      CHILD_CHUNK_OVERLAP: 76
    })
  })
})

describe('isIndexableFile', () => {
  it('accepts supported text, code, and configuration files', () => {
    expect(isIndexableFile('readme.md')).toBe(true)
    expect(isIndexableFile('script.py')).toBe(true)
    expect(isIndexableFile('config.yaml')).toBe(true)
    expect(isIndexableFile('output.log')).toBe(true)
  })

  it('rejects binaries and extensionless files', () => {
    expect(isIndexableFile('image.png')).toBe(false)
    expect(isIndexableFile('data.sqlite3')).toBe(false)
    expect(isIndexableFile('Makefile')).toBe(false)
  })

  it('matches extensions case-insensitively', () => {
    expect(isIndexableFile('README.MD')).toBe(true)
    expect(isIndexableFile('SCRIPT.SH')).toBe(true)
  })

  it('retains the existing supported-extension contract', () => {
    expect(INDEXABLE_EXTENSIONS.has('.md')).toBe(true)
    expect(INDEXABLE_EXTENSIONS.has('.ts')).toBe(true)
    expect(INDEXABLE_EXTENSIONS.has('.png')).toBe(false)
  })
})
