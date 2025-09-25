import { globby, Options } from 'globby'
import os from 'os'
import * as path from 'path'
import { arePathsEqual } from '@utils/path'
import * as fs from 'fs'

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
 * - Respects `.clineignore` via an optional validator (caller can pass ChatermIgnoreController)
 * - Does not apply .gitignore by default (can be added by callers by changing options)
 * - Sorting: default by path; 'none' preserves globby's order
 */
export async function globSearch(
  cwd: string,
  params: GlobSearchParams,
  accessValidator?: { validateAccess: (p: string) => boolean }
): Promise<GlobSearchResult> {
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

  // Optionally enrich with mtime for a small slice
  const matches: GlobMatch[] = limited.map((p) => {
    try {
      const st = fs.statSync(p)
      return { path: p, mtimeMs: st.mtimeMs, size: st.size }
    } catch {
      return { path: p }
    }
  })

  return { files: matches, total, truncated: total > matches.length }
}

export async function listFiles(dirPath: string, recursive: boolean, limit: number): Promise<[string[], boolean]> {
  // First resolve the path normally - path.resolve doesn't care about glob special characters
  const absolutePath = path.resolve(dirPath)
  // Do not allow listing files in root or home directory, which cline tends to want to do when the user's prompt is vague.
  const root = process.platform === 'win32' ? path.parse(absolutePath).root : '/'
  const isRoot = arePathsEqual(absolutePath, root)
  if (isRoot) {
    return [[root], false]
  }
  const homeDir = os.homedir()
  const isHomeDir = arePathsEqual(absolutePath, homeDir)
  if (isHomeDir) {
    return [[homeDir], false]
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

  return [filePaths, filePaths.length >= limit]
}

/*
Breadth-first traversal of directory structure level by level up to a limit:
   - Queue-based approach ensures proper breadth-first traversal
   - Processes directory patterns level by level
   - Captures a representative sample of the directory structure up to the limit
   - Minimizes risk of missing deeply nested files

- Notes:
   - Relies on globby to mark directories with /
   - Potential for loops if symbolic links reference back to parent (we could use followSymlinks: false but that may not be ideal for some projects and it's pointless if they're not using symlinks wrong)
   - Timeout mechanism prevents infinite loops
*/
async function globbyLevelByLevel(limit: number, options?: Options) {
  const results: Set<string> = new Set()
  const queue: string[] = ['*']

  const globbingProcess = async () => {
    while (queue.length > 0 && results.size < limit) {
      const pattern = queue.shift()!
      const filesAtLevel = await globby(pattern, options)

      for (const file of filesAtLevel) {
        if (results.size >= limit) {
          break
        }
        results.add(file)
        if (file.endsWith('/')) {
          // Escape parentheses in the path to prevent glob pattern interpretation
          // This is crucial for NextJS folder naming conventions which use parentheses like (auth), (dashboard)
          // Without escaping, glob treats parentheses as special pattern grouping characters
          const escapedFile = file.replace(/\(/g, '\\(').replace(/\)/g, '\\)')
          queue.push(`${escapedFile}*`)
        }
      }
    }
    return Array.from(results).slice(0, limit)
  }

  // Timeout after 10 seconds and return partial results
  const timeoutPromise = new Promise<string[]>((_, reject) => {
    setTimeout(() => reject(new Error('Globbing timeout')), 10_000)
  })
  try {
    return await Promise.race([globbingProcess(), timeoutPromise])
  } catch (error) {
    console.warn('Globbing timed out, returning partial results')
    return Array.from(results)
  }
}
