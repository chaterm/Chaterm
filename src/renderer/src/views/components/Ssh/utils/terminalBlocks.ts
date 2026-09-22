import { stripAnsiBasic } from './ansiUtils'
import { matchPrompt } from './terminalPrompt'

/** Absolute buffer row range of one command block. Both ends are inclusive. */
export type BlockRange = {
  startLine: number
  endLine: number
}

/** Minimal view of a buffer row, so block lookup stays independent of xterm. */
export type BlockBufferLine = {
  text: string
  isWrapped: boolean
}

export type FindBlockOptions = {
  clickedLine: number
  lineCount: number
  getLine: (y: number) => BlockBufferLine | undefined
  /** Live prompt prefix of the session, used as a fast path before the generic patterns. */
  sessionPrompt?: string
  maxScanUp?: number
  maxScanDown?: number
}

// Prompts never run longer than this, so only the head of a row is scanned.
const MAX_PROMPT_SCAN = 200

// Scan limits mirror the ctrl-link prompt scan in sshConnect.vue.
const DEFAULT_MAX_SCAN_UP = 2000
const DEFAULT_MAX_SCAN_DOWN = 4000

// Cheap pre-filter: every prompt shape ends in one of these terminators or
// starts with a theme glyph. Output rows carrying none of them -- the bulk of
// any scan -- are rejected by a single test instead of a full pattern sweep.
const PROMPT_CHAR_HINT = /[$#%>➜❯❮➤➔λ]/

// Prompts are short, so only the leading tokens of a row can form one.
const MAX_PROMPT_TOKENS = 12

// A candidate ending in '>' is only accepted when it is anchored to a drive
// path ('C:\dir>', 'PS C:\dir>') or a full '<hostname>' wrapper. The generic
// fish pattern in terminalPrompt.ts matches any 'word word>' shape, which would
// otherwise treat ordinary output such as a quoted 'John> ...' or a stray
// '<meta charset="utf-8">' as a prompt and split a block in half. This is
// tested structurally rather than through matchPrompt's reported type, because
// that fish pattern is checked before the Windows ones and so reports 'linux'
// for a genuine PowerShell prompt. Fish and cisco user-mode prompts still open
// blocks through sessionPrompt.
const ANCHORED_ANGLE_PROMPT = /^(?:PS\s+)?[A-Za-z]:[\\/].*>$|^<[A-Za-z][A-Za-z0-9_-]*>$/

// A lone '$', '#', '%' or '>' is far more often output -- a shell comment, a
// quoted example, a blank comment line in a config file -- than a real prompt,
// so it does not open a block. Prompts carrying user/host/path context still
// match, and a degenerate PS1 is still covered by sessionPrompt.
const isBareTerminator = (candidate: string): boolean => /^[$#%>]$/.test(candidate.trim())

const isPromptCandidate = (candidate: string): boolean => {
  if (isBareTerminator(candidate)) return false
  if (!matchPrompt(candidate).isPrompt) return false
  if (candidate.endsWith('>') && !ANCHORED_ANGLE_PROMPT.test(candidate)) return false
  return true
}

/**
 * Match a row that begins with a shell prompt, optionally followed by a command.
 * Returns the command text after the prompt, or null when the row is not a
 * prompt row. Unlike isTerminalPromptLine this accepts trailing command text,
 * which is what makes it usable for locating the first row of a command block.
 */
export const matchPromptLineStart = (line: string, sessionPrompt?: string): { command: string } | null => {
  const text = stripAnsiBasic(line ?? '').trimEnd()
  if (!text) return null

  // The session's own prompt prefix is the most reliable signal, but it only
  // covers rows whose cwd still matches the live one, so a miss falls through
  // to the generic patterns rather than rejecting the row.
  const prompt = (sessionPrompt ?? '').trimEnd()
  if (prompt && text.startsWith(prompt)) {
    return { command: text.slice(prompt.length).trim() }
  }

  const head = text.slice(0, MAX_PROMPT_SCAN)
  if (!PROMPT_CHAR_HINT.test(head)) return null

  if (isPromptCandidate(text)) {
    return { command: '' }
  }

  // Walk whitespace boundaries in the head of the row. A prompt always ends at
  // one, whether or not it carries a terminator character -- zsh theme prompts
  // such as '➜  ~' end on the path instead.
  let tokens = 0
  for (let i = 1; i < head.length && tokens < MAX_PROMPT_TOKENS; i += 1) {
    if (!/\s/.test(head[i])) continue
    if (/\s/.test(head[i - 1])) continue
    tokens += 1

    const candidate = head.slice(0, i)
    if (!isPromptCandidate(candidate)) continue

    return { command: text.slice(i).trim() }
  }

  return null
}

/**
 * Resolve the command block containing clickedLine: from the nearest prompt row
 * at or above it, down to the row before the next prompt row.
 */
export const findBlockAt = ({
  clickedLine,
  lineCount,
  getLine,
  sessionPrompt,
  maxScanUp = DEFAULT_MAX_SCAN_UP,
  maxScanDown = DEFAULT_MAX_SCAN_DOWN
}: FindBlockOptions): BlockRange | null => {
  if (!Number.isInteger(clickedLine) || clickedLine < 0 || clickedLine >= lineCount) {
    return null
  }

  const isBlockStart = (y: number): boolean => {
    const line = getLine(y)
    if (!line) return false
    // Continuation rows of a wrapped line never open a block.
    if (line.isWrapped) return false
    return matchPromptLineStart(line.text, sessionPrompt) !== null
  }

  let startLine = -1
  const minY = Math.max(0, clickedLine - maxScanUp)
  for (let y = clickedLine; y >= minY; y -= 1) {
    if (isBlockStart(y)) {
      startLine = y
      break
    }
  }
  if (startLine === -1) return null

  let endLine = lineCount - 1
  const maxY = Math.min(lineCount - 1, startLine + maxScanDown)
  for (let y = startLine + 1; y <= maxY; y += 1) {
    if (isBlockStart(y)) {
      endLine = y - 1
      break
    }
  }

  // Blank rows below the last block are padding, not part of it.
  while (endLine > startLine && !(getLine(endLine)?.text ?? '').trim()) {
    endLine -= 1
  }

  return { startLine, endLine }
}
