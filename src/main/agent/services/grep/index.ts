import { spawn } from 'child_process'
import * as path from 'path'

export interface GrepMatch {
  file: string
  line: number
  text: string
}
export interface GrepSearchResult {
  matches: GrepMatch[]
  total: number
  truncated: boolean
}

function buildArgs(regex: string, include?: string, max?: number, ctx?: number, caseSensitive?: boolean) {
  const args: string[] = []
  args.push('-R') // recursive
  args.push('-n') // line numbers
  args.push('-E') // extended regex
  args.push('--color=never')
  args.push('--binary-files=without-match')
  // common noisy virtual trees
  args.push('--exclude-dir=proc', '--exclude-dir=sys', '--exclude-dir=dev')
  if (include) args.push('--include', include)
  if (typeof max === 'number' && max > 0) args.push('-m', String(max))
  if (typeof ctx === 'number' && ctx > 0) args.push('-C', String(ctx))
  // grep -i means ignore case; our API default is false (ignore case)
  if (caseSensitive === false || caseSensitive === undefined) args.push('-i')
  // pattern
  args.push(regex)
  return args
}

function parseGrepOutput(stdout: string, basePath: string): GrepMatch[] {
  const matches: GrepMatch[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue
    // Matched lines are in the format file:line:content
    // Context lines (when -C is used) often use '-' separator (file-line-content) — skip those
    const firstColon = line.indexOf(':')
    const secondColon = firstColon >= 0 ? line.indexOf(':', firstColon + 1) : -1
    if (firstColon === -1 || secondColon === -1) continue
    const filePath = line.slice(0, firstColon)
    const lineNoStr = line.slice(firstColon + 1, secondColon)
    const content = line.slice(secondColon + 1)
    const lineNo = Number.parseInt(lineNoStr, 10)
    if (!Number.isFinite(lineNo)) continue
    const abs = path.resolve(basePath, filePath)
    const rel = path.relative(basePath, abs) || path.basename(abs)
    matches.push({ file: rel, line: lineNo, text: content })
  }
  return matches
}

/**
 * Local grep search using system grep.
 * - caseSensitive=false => adds `-i` (ignore case)
 * - include => `--include <glob>`
 * - ctx => `-C <n>`; only matched lines are returned in the result structure
 */
export async function regexSearchMatches(
  cwd: string,
  directoryPath: string,
  regex: string,
  include?: string,
  max?: number,
  ctx?: number,
  caseSensitive?: boolean
): Promise<GrepSearchResult> {
  const base = path.resolve(cwd, directoryPath || '.')
  const args = buildArgs(regex, include, max, ctx, caseSensitive)
  // search path last, and guard with -- to avoid interpreting patterns as options
  args.push('--', base)

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn('grep', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d.toString('utf8')))
    child.stderr.on('data', (d) => (err += d.toString('utf8')))
    child.on('error', (e) => reject(e))
    child.on('close', (code) => {
      if (code === 0 || code === 1) {
        // 0: matches found, 1: no matches
        resolve(out)
      } else {
        reject(new Error(err || `grep exited with code ${code}`))
      }
    })
  })

  const matches = parseGrepOutput(stdout, base)
  return { matches, total: matches.length, truncated: false }
}
