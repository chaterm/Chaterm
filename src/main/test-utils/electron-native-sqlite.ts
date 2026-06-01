import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'

const RESULT_PREFIX = '__NATIVE_SQLITE_RESULT__'
const projectRoot = resolve(process.cwd())
const require = createRequire(import.meta.url)

export type NativeSqliteCase =
  | 'sqlite-driver:test-connection'
  | 'sqlite-driver:metadata'
  | 'sqlite-driver:execute'
  | 'sqlite-driver:rollback-ddl'
  | 'db-assets:legacy-rebuild'

type NativeSqliteResult = {
  ok: boolean
  name?: string
  error?: {
    name?: string
    message?: string
    stack?: string
  }
}

type ExecResult = {
  error: Error | null
  stdout: string
  stderr: string
}

let bundlePromise: Promise<string> | null = null
let tempDir: string | null = null

function electronPath(): string {
  const electron = require('electron') as string | { default?: string }
  const path = typeof electron === 'string' ? electron : electron.default
  if (!path) throw new Error('Unable to resolve Electron executable for native sqlite tests')
  return path
}

async function bundleRunner(): Promise<string> {
  if (bundlePromise) return bundlePromise
  tempDir = mkdtempSync(join(tmpdir(), 'chaterm-native-sqlite-'))
  const runnerPath = join(tempDir, 'electron-native-sqlite-runner.mjs')
  bundlePromise = build({
    configFile: false,
    root: projectRoot,
    publicDir: false,
    logLevel: 'silent',
    build: {
      ssr: resolve(projectRoot, 'tests/native-sqlite/electron-native-sqlite-runner.ts'),
      outDir: tempDir,
      emptyOutDir: true,
      target: 'node24',
      minify: false,
      sourcemap: 'inline',
      rollupOptions: {
        external: ['better-sqlite3', 'electron'],
        output: {
          format: 'es',
          entryFileNames: 'electron-native-sqlite-runner.mjs'
        }
      }
    }
  }).then(() => runnerPath)
  return bundlePromise
}

function execElectron(file: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolveExec) => {
    execFile(
      file,
      args,
      {
        cwd: projectRoot,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        timeout: 30_000,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolveExec({
          error,
          stdout: String(stdout),
          stderr: String(stderr)
        })
      }
    )
  })
}

function parseResult(stdout: string): NativeSqliteResult | null {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith(RESULT_PREFIX))
  if (!line) return null
  return JSON.parse(line.slice(RESULT_PREFIX.length)) as NativeSqliteResult
}

export async function runElectronNativeSqliteCase(name: NativeSqliteCase): Promise<void> {
  const runnerPath = await bundleRunner()
  const { error, stdout, stderr } = await execElectron(electronPath(), [runnerPath, name])
  const result = parseResult(stdout)

  if (!error && result?.ok) return

  const detail = result?.error
    ? `${result.error.name ?? 'Error'}: ${result.error.message ?? 'unknown error'}\n${result.error.stack ?? ''}`
    : error?.message || 'Electron native sqlite runner failed without a result payload'

  throw new Error(
    [
      `Electron native sqlite case failed: ${name}`,
      detail.trim(),
      stdout.trim() ? `stdout:\n${stdout.trim()}` : '',
      stderr.trim() ? `stderr:\n${stderr.trim()}` : ''
    ]
      .filter(Boolean)
      .join('\n\n')
  )
}

process.once('exit', () => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
})
