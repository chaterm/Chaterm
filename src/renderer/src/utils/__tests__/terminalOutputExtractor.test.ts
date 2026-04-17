import { describe, expect, it } from 'vitest'
import { extractFinalOutput } from '../terminalOutputExtractor'

describe('extractFinalOutput', () => {
  it('extracts output from standard "Terminal output" fenced block', () => {
    const input = `Terminal output:\n\`\`\`\nls -la\n-rw-r--r--  1 user  staff  1234 Jan 1 12:00 file.txt\n\`\`\``
    expect(extractFinalOutput(input)).toBe('ls -la\n-rw-r--r--  1 user  staff  1234 Jan 1 12:00 file.txt')
  })

  it('extracts output from a simple fenced block', () => {
    const input = `\`\`\`\npwd\n/home/user\n\`\`\``
    expect(extractFinalOutput(input)).toBe('pwd\n/home/user')
  })

  it('extracts multi-line output', () => {
    const input = `Terminal output:\n\`\`\`\nCommand 1\nOutput 1\nCommand 2\nOutput 2\n\`\`\``
    expect(extractFinalOutput(input)).toBe('Command 1\nOutput 1\nCommand 2\nOutput 2')
  })

  it('returns empty string for empty fenced output', () => {
    const input = `Terminal output:\n\`\`\`\n\n\`\`\``
    expect(extractFinalOutput(input)).toBe('')
  })

  it('returns cleaned plain text for unformatted output', () => {
    expect(extractFinalOutput('Unformatted output')).toBe('Unformatted output')
  })

  it('returns empty string for empty input', () => {
    expect(extractFinalOutput('')).toBe('')
  })
})
