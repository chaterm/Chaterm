import { spawn } from 'child_process'
import * as path from 'path'

// Simple LRU cache for grep results
interface CacheEntry<T> {
  data: T
  timestamp: number
  key: string
}

class SimpleLRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>()
  private maxSize: number
  private ttl: number

  constructor(maxSize = 50, ttl = 60000) {
    // 1 minute default TTL for grep
    this.maxSize = maxSize
    this.ttl = ttl
  }

  get(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }

    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.data
  }

  set(key: string, data: T): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      key
    })
  }

  clear(): void {
    this.cache.clear()
  }
}

const grepCache = new SimpleLRUCache<GrepSearchResult>()

function generateGrepCacheKey(
  cwd: string,
  directoryPath: string,
  regex: string,
  include?: string,
  max?: number,
  ctx?: number,
  caseSensitive?: boolean
): string {
  return `${cwd}:${directoryPath}:${regex}:${include || ''}:${max || ''}:${ctx || ''}:${caseSensitive !== false}`
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

  // Use single pass with string iterator for better performance
  let startPos = 0
  const length = stdout.length

  while (startPos < length) {
    // Find end of current line
    let endPos = stdout.indexOf('\n', startPos)
    if (endPos === -1) endPos = length

    if (endPos > startPos) {
      const line = stdout.slice(startPos, endPos)

      // Skip empty lines and context lines (using --)
      if (line && !line.includes('--')) {
        // More efficient colon parsing with single pass
        const firstColon = line.indexOf(':')
        if (firstColon > 0) {
          const secondColon = line.indexOf(':', firstColon + 1)
          if (secondColon > firstColon) {
            const filePath = line.slice(0, firstColon)
            const lineNoStr = line.slice(firstColon + 1, secondColon)
            const content = line.slice(secondColon + 1)

            const lineNo = parseInt(lineNoStr, 10)
            if (Number.isFinite(lineNo)) {
              const abs = path.resolve(basePath, filePath)
              const rel = path.relative(basePath, abs) || path.basename(abs)
              matches.push({ file: rel, line: lineNo, text: content })
            }
          }
        }
      }
    }

    startPos = endPos + 1
  }

  return matches
}

/**
 * Local grep search using system grep with improved performance and timeout handling.
 * - caseSensitive=false => adds `-i` (ignore case)
 * - include => `--include <glob>`
 * - ctx => `-C <n>`; only matched lines are returned in the result structure
 * - Adds caching for repeated searches and timeout protection
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
  // Check cache first
  const cacheKey = generateGrepCacheKey(cwd, directoryPath, regex, include, max, ctx, caseSensitive)
  const cachedResult = grepCache.get(cacheKey)
  if (cachedResult) {
    return cachedResult
  }

  const base = path.resolve(cwd, directoryPath || '.')
  const args = buildArgs(regex, include, max, ctx, caseSensitive)
  // search path last, and guard with -- to avoid interpreting patterns as options
  args.push('--', base)

  // Improved spawn with timeout handling
  const timeoutPromise = new Promise<string>((_, reject) => {
    setTimeout(() => reject(new Error('Grep search timeout after 30 seconds')), 30000)
  })

  const grepPromise = new Promise<string>((resolve, reject) => {
    const child = spawn('grep', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 25000 // Kill after 25 seconds
    })

    let out = ''
    let err = ''

    // Use more efficient data handling with chunks
    const stdoutBuffer: Buffer[] = []
    const stderrBuffer: Buffer[] = []

    child.stdout.on('data', (chunk) => {
      stdoutBuffer.push(chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderrBuffer.push(chunk)
    })

    child.on('error', (e) => {
      reject(e)
    })

    child.on('close', (code) => {
      // Convert buffers to strings at once for better performance
      out = Buffer.concat(stdoutBuffer).toString('utf8')
      err = Buffer.concat(stderrBuffer).toString('utf8')

      if (code === 0 || code === 1) {
        // 0: matches found, 1: no matches
        resolve(out)
      } else {
        reject(new Error(err || `grep exited with code ${code}`))
      }
    })
  })

  try {
    const stdout = await Promise.race([grepPromise, timeoutPromise])
    const matches = parseGrepOutput(stdout, base)
    const result = { matches, total: matches.length, truncated: max ? matches.length >= max : false }

    // Cache the result
    grepCache.set(cacheKey, result)

    return result
  } catch (error) {
    if (error instanceof Error && error.message.includes('timeout')) {
      console.warn('Grep search timed out, returning empty results')
      return { matches: [], total: 0, truncated: false }
    }
    throw error
  }
}
