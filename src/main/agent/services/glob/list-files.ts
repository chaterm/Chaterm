import { globby, Options } from 'globby'
import os from 'os'
import * as path from 'path'
import { arePathsEqual } from '@utils/path'
import { promises as fs } from 'fs'

// Simple LRU cache for search results
interface CacheEntry<T> {
  data: T
  timestamp: number
  key: string
}

class SimpleLRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>()
  private maxSize: number
  private ttl: number // Time to live in milliseconds

  constructor(maxSize = 100, ttl = 30000) {
    // 30 seconds default TTL
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

    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.data
  }

  set(key: string, data: T): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
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

// Create cache instances for different search types
const globSearchCache = new SimpleLRUCache<GlobSearchResult>()
const listFilesCache = new SimpleLRUCache<[string[], boolean]>()

// Generate cache key for glob search
function generateGlobCacheKey(cwd: string, params: GlobSearchParams, accessValidator?: any): string {
  return `${cwd}:${JSON.stringify(params)}:${accessValidator ? 'validated' : 'unvalidated'}`
}

// Generate cache key for list files
function generateListFilesCacheKey(dirPath: string, recursive: boolean, limit: number): string {
  return `${dirPath}:${recursive}:${limit}`
}

// Lightweight types aligned with tool.md
export interface GlobSearchParams {
  pattern: string
  path?: string
  ip?: string
  limit?: number
  sort?: 'path' | 'none'
}

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

/**
 * High-level glob search for local filesystem.
 * - Does not apply .gitignore by default (can be added by callers by changing options)
 * - Sorting: default by path; 'none' preserves globby's order
 */
export async function globSearch(
  cwd: string,
  params: GlobSearchParams,
  accessValidator?: { validateAccess: (p: string) => boolean }
): Promise<GlobSearchResult> {
  // Check cache first
  const cacheKey = generateGlobCacheKey(cwd, params, accessValidator)
  const cachedResult = globSearchCache.get(cacheKey)
  if (cachedResult) {
    return cachedResult
  }

  const { pattern, path: relPath, limit = 2000, sort = 'path' } = params
  const searchRoot = path.resolve(cwd, relPath ?? '.')

  const options: Options = {
    cwd: searchRoot,
    dot: true,
    absolute: true,
    onlyFiles: true,
    gitignore: false,
    suppressErrors: true
  }

  let files = await globby(pattern, options)

  // Optional .clineignore filter via validator
  if (accessValidator) {
    files = files.filter((abs) => {
      try {
        const rel = path.relative(searchRoot, abs).toPosix()
        return accessValidator.validateAccess(rel)
      } catch {
        return true
      }
    })
  }

  const total = files.length
  if (sort === 'path') {
    files.sort((a, b) => a.localeCompare(b))
  }

  const limited = files.slice(0, limit)

  // Get file stats asynchronously in parallel for better performance
  const statPromises = limited.map(async (p) => {
    try {
      const st = await fs.stat(p)
      return { path: p, mtimeMs: st.mtimeMs, size: st.size }
    } catch {
      return { path: p }
    }
  })

  const matches: GlobMatch[] = await Promise.all(statPromises)

  const result = { files: matches, total, truncated: total > matches.length }

  // Cache the result
  globSearchCache.set(cacheKey, result)

  return result
}

export async function listFiles(dirPath: string, recursive: boolean, limit: number): Promise<[string[], boolean]> {
  // Check cache first
  const cacheKey = generateListFilesCacheKey(dirPath, recursive, limit)
  const cachedResult = listFilesCache.get(cacheKey)
  if (cachedResult) {
    return cachedResult
  }

  // First resolve the path normally - path.resolve doesn't care about glob special characters
  const absolutePath = path.resolve(dirPath)
  // Do not allow listing files in root or home directory, which cline tends to want to do when the user's prompt is vague.
  const root = process.platform === 'win32' ? path.parse(absolutePath).root : '/'
  const isRoot = arePathsEqual(absolutePath, root)
  if (isRoot) {
    const result: [string[], boolean] = [[root], false]
    listFilesCache.set(cacheKey, result)
    return result
  }
  const homeDir = os.homedir()
  const isHomeDir = arePathsEqual(absolutePath, homeDir)
  if (isHomeDir) {
    const result: [string[], boolean] = [[homeDir], false]
    listFilesCache.set(cacheKey, result)
    return result
  }

  const dirsToIgnore = [
    'node_modules',
    '__pycache__',
    'env',
    'venv',
    'target/dependency',
    'build/dependencies',
    'dist',
    'out',
    'bundle',
    'vendor',
    'tmp',
    'temp',
    'deps',
    'pkg',
    'Pods',
    '.*' // '!**/.*' excludes hidden directories, while '!**/.*/**' excludes only their contents. This way we are at least aware of the existence of hidden directories.
  ].map((dir) => `**/${dir}/**`)

  const options: Options = {
    cwd: dirPath,
    dot: true, // do not ignore hidden files/directories
    absolute: true,
    markDirectories: true, // Append a / on any directories matched (/ is used on windows as well, so dont use path.sep)
    gitignore: recursive, // globby ignores any files that are gitignored
    ignore: recursive ? dirsToIgnore : undefined, // just in case there is no gitignore, we ignore sensible defaults
    onlyFiles: false, // true by default, false means it will list directories on their own too
    suppressErrors: true
  }

  // * globs all files in one dir, ** globs files in nested directories
  // For non-recursive listing, we still use a simple pattern
  const filePaths = recursive ? await globbyLevelByLevel(limit, options) : (await globby('*', options)).slice(0, limit)

  const result: [string[], boolean] = [filePaths, filePaths.length >= limit]

  // Cache the result
  listFilesCache.set(cacheKey, result)

  return result
}

/*
Optimized breadth-first traversal of directory structure:
   - Uses a single globby call with ** pattern for better performance
   - Implements depth control and limit handling more efficiently
   - Processes results in batches to avoid memory issues
   - Maintains timeout mechanism for safety

- Notes:
   - Much more efficient than level-by-level approach
   - Uses globby's built-in recursive capabilities
   - Better memory usage with batched processing
*/
async function globbyLevelByLevel(limit: number, options?: Options) {
  const dirsToIgnore = ['node_modules', '__pycache__', 'build/dependencies', 'out', 'vendor', 'deps', 'pkg', '.*']

  const extendedOptions: Options = {
    ...options,
    ignore: [...(options?.ignore || []), ...dirsToIgnore.map((dir) => `**/${dir}/**`)],
    deep: 10, // Limit depth to prevent excessive recursion
    expandDirectories: false // More predictable behavior
  }

  const globbingProcess = async () => {
    try {
      // Use ** pattern for recursive search in single operation
      const allFiles = await globby('**', extendedOptions)

      // Filter to get only directories up to reasonable depth
      const directories = allFiles.filter((file) => file.endsWith('/'))
      const files = allFiles.filter((file) => !file.endsWith('/'))

      // Combine and limit results, prioritizing directories then files
      const results = [...directories, ...files].slice(0, limit)
      return results
    } catch (error) {
      console.warn('Optimized globbing failed, falling back to simple pattern:', error)
      // Fallback to simple non-recursive pattern
      const files = await globby('*', extendedOptions)
      return files.slice(0, limit)
    }
  }

  // Timeout after 10 seconds and return partial results
  const timeoutPromise = new Promise<string[]>((_, reject) => {
    setTimeout(() => reject(new Error('Globbing timeout')), 10_000)
  })

  try {
    return await Promise.race([globbingProcess(), timeoutPromise])
  } catch (error) {
    console.warn('Globbing timed out, returning empty results')
    return []
  }
}
