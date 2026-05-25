import { app } from 'electron'
import { execa } from 'execa'
import fs from 'fs'
import path from 'path'

const logger = createLogger('rtk-output-filter')

const DEFAULT_TIMEOUT_MS = 5_000

export interface RtkOutputFilterParams {
  command: string
  output: string
  cwd?: string
  timeoutMs?: number
}

export interface RtkOutputFilterResult {
  output: string
  applied: boolean
  reason?: string
}

export interface RtkRunnerOptions {
  input: string
  cwd?: string
  timeoutMs: number
}

export interface RtkRunnerResult {
  exitCode: number
  stdout: string
  stderr: string
}

export type RtkRunner = (file: string, args: string[], options: RtkRunnerOptions) => Promise<RtkRunnerResult>

export interface RtkOutputFilterServiceOptions {
  binaryPath?: string
  timeoutMs?: number
  resourceRoot?: string
  isPackaged?: boolean
  allowPathFallback?: boolean
  runner?: RtkRunner
}

export class RtkOutputFilterService {
  private readonly binaryPath?: string
  private readonly timeoutMs: number
  private readonly resourceRoot?: string
  private readonly isPackaged?: boolean
  private readonly allowPathFallback?: boolean
  private readonly runner: RtkRunner

  constructor(options: RtkOutputFilterServiceOptions = {}) {
    this.binaryPath = options.binaryPath
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.resourceRoot = options.resourceRoot
    this.isPackaged = options.isPackaged
    this.allowPathFallback = options.allowPathFallback
    this.runner = options.runner ?? this.runRtk
  }

  async filterOutput(params: RtkOutputFilterParams): Promise<RtkOutputFilterResult> {
    const command = params.command.trim()
    const output = params.output ?? ''

    if (!command) {
      return { output, applied: false, reason: 'empty-command' }
    }

    if (output.length === 0) {
      return { output, applied: false, reason: 'empty-output' }
    }

    const binary = this.resolveBinary()
    if (!binary) {
      logger.warn('RTK binary not found; using original command output', {
        event: 'rtk.output_filter.binary_missing',
        platform: process.platform,
        arch: process.arch
      })
      return { output, applied: false, reason: 'binary-missing' }
    }

    const timeoutMs = params.timeoutMs ?? this.timeoutMs

    try {
      const result = await this.runner(binary, ['pipe', '--command', command], {
        input: output,
        cwd: params.cwd,
        timeoutMs
      })

      if (result.exitCode !== 0) {
        logger.warn('RTK output filter exited non-zero; using original command output', {
          event: 'rtk.output_filter.non_zero_exit',
          exitCode: result.exitCode,
          stderrLength: result.stderr.length
        })
        return { output, applied: false, reason: 'non-zero-exit' }
      }

      if (result.stdout.length === 0 && output.length > 0) {
        logger.warn('RTK output filter returned empty output for non-empty input; using original command output', {
          event: 'rtk.output_filter.empty_filtered_output',
          inputLength: output.length
        })
        return { output, applied: false, reason: 'empty-filtered-output' }
      }

      if (result.stdout === output) {
        return { output, applied: false, reason: 'unchanged' }
      }

      return { output: result.stdout, applied: true }
    } catch (error) {
      logger.warn('RTK output filter failed; using original command output', {
        event: 'rtk.output_filter.failed_open',
        error: error instanceof Error ? error.message : String(error)
      })
      return { output, applied: false, reason: 'filter-error' }
    }
  }

  private resolveBinary(): string | null {
    if (this.binaryPath) {
      return this.binaryPath
    }

    const envPath = process.env.CHATERM_RTK_PATH?.trim()
    if (envPath) {
      return envPath
    }

    const platformArch = `${process.platform}-${process.arch}`
    const executableName = process.platform === 'win32' ? 'rtk.exe' : 'rtk'
    const resourceRoots = this.getResourceRoots()

    for (const root of resourceRoots) {
      const candidate = path.join(root, 'rtk', platformArch, executableName)
      if (this.isExecutable(candidate)) {
        return candidate
      }
    }

    if (this.shouldAllowPathFallback()) {
      return 'rtk'
    }

    return null
  }

  private getResourceRoots(): string[] {
    if (this.resourceRoot) {
      return [this.resourceRoot]
    }

    const roots: string[] = []
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath

    if (this.getIsPackaged() && resourcesPath) {
      roots.push(resourcesPath)
    }

    roots.push(path.join(process.cwd(), 'resources'))
    return roots
  }

  private getIsPackaged(): boolean {
    return this.isPackaged ?? Boolean(app.isPackaged)
  }

  private shouldAllowPathFallback(): boolean {
    return this.allowPathFallback ?? !this.getIsPackaged()
  }

  private isExecutable(filePath: string): boolean {
    try {
      if (process.platform === 'win32') {
        return fs.existsSync(filePath)
      }
      fs.accessSync(filePath, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  private async runRtk(file: string, args: string[], options: RtkRunnerOptions): Promise<RtkRunnerResult> {
    const result = await execa(file, args, {
      input: options.input,
      cwd: options.cwd,
      timeout: options.timeoutMs,
      reject: false,
      stripFinalNewline: false
    })

    return {
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout,
      stderr: result.stderr
    }
  }
}
