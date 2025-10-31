import * as path from 'path'

export interface GlobMatch {
  path: string
  mtimeMs?: number
  size?: number
}
export interface GlobSearchResult {
  files: GlobMatch[]
  total: number
  truncated: boolean
}
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

export interface RemoteGlobParams {
  pattern: string
  path?: string
  limit?: number
  sort?: 'path' | 'none'
}

export interface RemoteGrepParams {
  pattern: string
  path?: string
  include?: string
  case_sensitive?: boolean // false => add -i
  context_lines?: number
  max_matches?: number
}

/**
 * Build a bash command that expands a glob and prints absolute paths line by line.
 * Notes:
 * - Uses bash globstar/nullglob/dotglob for recursive/hidden expansion
 * - Caller should execute via remote terminal and pipe stdout to parser
 */
export function buildRemoteGlobCommand(params: RemoteGlobParams): string {
  const p = params.pattern.replace(/'/g, "'\\''")
  const cd = (params.path ?? '.').replace(/'/g, "'\\''")
  // Fallback when realpath is unavailable: use readlink -f or prefix with $PWD
  return `bash -lc 'shopt -s nullglob dotglob globstar; cd "${cd}"; for f in ${p}; do if command -v realpath >/dev/null 2>&1; then abspath=$(realpath "$f"); elif command -v readlink >/dev/null 2>&1; then abspath=$(readlink -f "$f" 2>/dev/null || echo "$PWD/\${f#./}"); else abspath="$PWD/\${f#./}"; fi; printf "%s\\n" "$abspath"; done'`
}

/**
 * Parse glob output where each line is an absolute file path.
 */
export function parseRemoteGlobOutput(stdout: string, sort: 'path' | 'none' = 'path', limit = 2000): GlobSearchResult {
  let files = stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (sort === 'path') files = files.sort((a, b) => a.localeCompare(b))
  const limited = files.slice(0, limit)
  return { files: limited.map((p) => ({ path: p })), total: files.length, truncated: files.length > limited.length }
}

/**
 * Build a system grep command. When case_sensitive=false (or undefined), add -i.
 */
export function buildRemoteGrepCommand(params: RemoteGrepParams): string {
  const { pattern, path: rel = '.', include, case_sensitive, context_lines, max_matches } = params
  const dir = rel.replace(/'/g, "'\\''")
  const parts: string[] = []
  parts.push(
    'grep',
    '-R',
    '-n',
    '-E',
    '--color=never',
    '--binary-files=without-match',
    '--exclude-dir=proc',
    '--exclude-dir=sys',
    '--exclude-dir=dev'
  )
  if (include) parts.push('--include', `'${include.replace(/'/g, "'\\''")}'`)
  if (typeof max_matches === 'number' && max_matches > 0) parts.push('-m', String(max_matches))
  if (typeof context_lines === 'number' && context_lines > 0) parts.push('-C', String(context_lines))
  if (case_sensitive === false || case_sensitive === undefined) parts.push('-i')
  parts.push(`'${pattern.replace(/'/g, "'\\''")}'`, '--', `'${dir}'`)
  return parts.join(' ')
}

/**
 * Parse grep output in the canonical format: file:line:content
 * Skips context lines that may appear with '-' separators when -C is used.
 */
export function parseRemoteGrepOutput(stdout: string, basePath: string): GrepMatch[] {
  const out: GrepMatch[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue
    const i = line.indexOf(':')
    const j = i >= 0 ? line.indexOf(':', i + 1) : -1
    if (i === -1 || j === -1) continue
    const file = line.slice(0, i)
    const lineNo = Number.parseInt(line.slice(i + 1, j), 10)
    if (!Number.isFinite(lineNo)) continue
    const text = line.slice(j + 1)
    // normalize to relative
    const abs = path.resolve(basePath, file)
    const rel = path.relative(basePath, abs) || path.basename(abs)
    out.push({ file: rel, line: lineNo, text })
  }
  return out
}

/**
 * TODO: Integrate with RemoteTerminalManager to execute built commands on the target host.
 * For now, these helpers only build commands and parse their outputs.
 */
export async function globSearchRemote(_ip: string, _params: RemoteGlobParams): Promise<GlobSearchResult> {
  throw new Error('globSearchRemote not integrated yet. Use buildRemoteGlobCommand + parseRemoteGlobOutput.')
}

export async function grepSearchRemote(_ip: string, _params: RemoteGrepParams): Promise<GrepSearchResult> {
  throw new Error('grepSearchRemote not integrated yet. Use buildRemoteGrepCommand + parseRemoteGrepOutput.')
}
