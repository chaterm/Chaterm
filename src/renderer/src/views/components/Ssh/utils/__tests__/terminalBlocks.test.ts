import { describe, expect, it } from 'vitest'
import { findBlockAt, matchPromptLineStart, type BlockBufferLine } from '../terminalBlocks'

const buildBuffer = (lines: Array<string | BlockBufferLine>): { lineCount: number; getLine: (y: number) => BlockBufferLine | undefined } => {
  const rows: BlockBufferLine[] = lines.map((line) => (typeof line === 'string' ? { text: line, isWrapped: false } : line))
  return {
    lineCount: rows.length,
    getLine: (y: number) => rows[y]
  }
}

const PROMPT = 'root@ubuntu-AutomMaasTest-4810115:/data/langfuse#'

describe('matchPromptLineStart', () => {
  it('matches a linux prompt followed by a command', () => {
    expect(matchPromptLineStart(`${PROMPT} sudo docker compose up`)).toEqual({ command: 'sudo docker compose up' })
  })

  it('matches a bare prompt row with no command', () => {
    expect(matchPromptLineStart(PROMPT)).toEqual({ command: '' })
  })

  it('strips ansi colour codes before matching', () => {
    expect(matchPromptLineStart(`\u001b[1;32m${PROMPT}\u001b[0m git status`)).toEqual({ command: 'git status' })
  })

  it('matches zsh theme prompts', () => {
    expect(matchPromptLineStart('➜  ~ git status')).toEqual({ command: 'git status' })
  })

  it('matches powershell prompts', () => {
    expect(matchPromptLineStart('PS C:\\Users\\test> dir')).toEqual({ command: 'dir' })
  })

  it('matches cisco privileged mode prompts', () => {
    expect(matchPromptLineStart('switch# show running-config')).toEqual({ command: 'show running-config' })
  })

  it('matches huawei user view prompts', () => {
    expect(matchPromptLineStart('<Huawei> display version')).toEqual({ command: 'display version' })
  })

  it('uses the session prompt as a fast path', () => {
    expect(matchPromptLineStart('myhost> uptime', 'myhost>')).toEqual({ command: 'uptime' })
  })

  it('falls back to generic patterns when the session prompt does not match', () => {
    expect(matchPromptLineStart(`${PROMPT} ls`, 'other-host:/tmp$')).toEqual({ command: 'ls' })
  })

  it('rejects ordinary output rows', () => {
    expect(matchPromptLineStart('  ✔ bed9376b51dc Pull complete')).toBeNull()
    expect(matchPromptLineStart(' ✘ langfuse-worker Error      context canceled')).toBeNull()
    expect(matchPromptLineStart('[+] Running 38/40')).toBeNull()
    expect(matchPromptLineStart('clickhouse [########] 242.6MB / 249MB    Pulling')).toBeNull()
  })

  it('rejects rows where a terminator is part of a word', () => {
    expect(matchPromptLineStart('echo $HOME')).toBeNull()
    expect(matchPromptLineStart('total 48K')).toBeNull()
  })

  it('rejects shell comments and markdown headings', () => {
    expect(matchPromptLineStart('# This is a comment')).toBeNull()
    expect(matchPromptLineStart('## Installation')).toBeNull()
  })

  it('rejects quoted text and markup that ends in an angle bracket', () => {
    expect(matchPromptLineStart('John> I think we should ship it')).toBeNull()
    expect(matchPromptLineStart('<meta charset="utf-8"> more markup')).toBeNull()
  })

  it('rejects blank and whitespace-only rows', () => {
    expect(matchPromptLineStart('')).toBeNull()
    expect(matchPromptLineStart('   ')).toBeNull()
  })
})

describe('findBlockAt', () => {
  // Mirrors the docker compose output from the reported screenshot.
  const dockerSession = buildBuffer([
    PROMPT,
    PROMPT,
    `${PROMPT} sudo docker compose up`,
    '[+] Running 38/40',
    ' ✔ postgres Pulled                                    26.5s',
    '   ✔ bed9376b51dc Pull complete                         0.9s',
    ' ✘ langfuse-worker Error      context canceled         31.5s',
    'Error response from daemon: failed to resolve reference "docker.langfuse.com/langfuse/langfuse:4": failed to do request: Head "htt',
    { text: 'ps://registry-1.docker.io/v2/langfuse/langfuse/manifests/4": dial tcp 108.160.167.147:443: i/o timeout', isWrapped: true },
    PROMPT,
    `${PROMPT} sudo docker compose up`,
    '[+] Running 3/9'
  ])

  it('selects the whole block when clicking inside the output', () => {
    expect(findBlockAt({ clickedLine: 5, ...dockerSession })).toEqual({ startLine: 2, endLine: 8 })
  })

  it('selects the whole block when clicking the command row', () => {
    expect(findBlockAt({ clickedLine: 2, ...dockerSession })).toEqual({ startLine: 2, endLine: 8 })
  })

  it('selects the whole block when clicking a wrapped continuation row', () => {
    expect(findBlockAt({ clickedLine: 8, ...dockerSession })).toEqual({ startLine: 2, endLine: 8 })
  })

  it('treats a bare prompt row as a single-row block', () => {
    expect(findBlockAt({ clickedLine: 9, ...dockerSession })).toEqual({ startLine: 9, endLine: 9 })
  })

  it('runs the final block to the end of the buffer', () => {
    expect(findBlockAt({ clickedLine: 11, ...dockerSession })).toEqual({ startLine: 10, endLine: 11 })
  })

  it('returns null when no prompt row precedes the click', () => {
    const truncated = buildBuffer(['  ✔ bed9376b51dc Pull complete', '  ✔ 6b37362b3da7 Pull complete'])
    expect(findBlockAt({ clickedLine: 1, ...truncated })).toBeNull()
  })

  it('does not include trailing blank rows in a block', () => {
    const withPadding = buildBuffer([`${PROMPT} ls`, 'file-a', 'file-b', '', '   ', ''])
    expect(findBlockAt({ clickedLine: 1, ...withPadding })).toEqual({ startLine: 0, endLine: 2 })
  })

  it('keeps a block intact when its output contains a shell comment', () => {
    const withComment = buildBuffer([`${PROMPT} cat setup.sh`, '#!/bin/bash', '# install dependencies', 'npm install', PROMPT])
    expect(findBlockAt({ clickedLine: 2, ...withComment })).toEqual({ startLine: 0, endLine: 3 })
  })

  it('respects the upward scan limit', () => {
    const session = buildBuffer([`${PROMPT} ls`, 'file-a', 'file-b'])
    expect(findBlockAt({ clickedLine: 2, maxScanUp: 1, ...session })).toBeNull()
  })

  it('rejects out-of-range rows', () => {
    expect(findBlockAt({ clickedLine: -1, ...dockerSession })).toBeNull()
    expect(findBlockAt({ clickedLine: dockerSession.lineCount, ...dockerSession })).toBeNull()
  })
})
