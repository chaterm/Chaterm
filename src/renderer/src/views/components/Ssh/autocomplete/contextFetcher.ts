export interface ContextInfo {
  context: string // 统一的上下文信息汇总
  timestamp: string
  executionTime: number
}

export interface ContextFetcherOptions {
  connectionId: string
  api: any
  enableOutput?: boolean
  outputCallback?: (message: string) => void
}

export class ContextFetcher {
  private connectionId: string
  private api: any
  private enableOutput: boolean
  private outputCallback?: (message: string) => void

  constructor(options: ContextFetcherOptions) {
    this.connectionId = options.connectionId
    this.api = options.api
    this.enableOutput = options.enableOutput || false
    this.outputCallback = options.outputCallback
  }

  /**
   * 测试历史命令获取
   */
  async testHistoryCommands(): Promise<void> {
    console.log('[ContextFetcher] 开始测试历史命令获取...')

    const testCommands = [
      'history',
      'history | tail -5',
      'fc -l',
      'fc -l -5',
      'echo $HISTFILE',
      'ls -la ~/.bash_history',
      'ls -la ~/.zsh_history',
      'tail -5 ~/.bash_history 2>/dev/null || echo "bash_history_not_found"',
      'tail -5 ~/.zsh_history 2>/dev/null || echo "zsh_history_not_found"',
      'echo $SHELL',
      'ps -p $$'
    ]

    for (const cmd of testCommands) {
      console.log(`[ContextFetcher] 测试命令: ${cmd}`)
      try {
        const result = await this.api.sshConnExec({
          cmd: cmd,
          id: this.connectionId
        })
        console.log(`[ContextFetcher] 结果 - 成功: ${result.success}`)
        console.log(`[ContextFetcher] 结果 - 输出: ${result.stdout}`)
        console.log(`[ContextFetcher] 结果 - 错误: ${result.stderr}`)
        console.log('---')
      } catch (error) {
        console.log(`[ContextFetcher] 命令执行失败: ${error}`)
      }
    }
  }

  /**
   * 获取上下文信息（包含历史命令和文件信息）
   */
  async fetchContext(): Promise<ContextInfo | null> {
    const startTime = performance.now()

    try {
      // 构建复合命令：获取当前目录、最近的10条历史命令、最近修改的20个文件
      const compositeCommand = [
        'echo "Current Directory" && pwd',
        // 直接从历史文件读取（根据测试结果优化）
        'echo "History Commands" && (tail -20 ~/.bash_history 2>/dev/null || tail -20 ~/.zsh_history 2>/dev/null || echo "no_history_file")',
        // 获取最近修改的20个文件/文件夹，按修改时间排序
        'echo "Directory Files" && ls -lt | head -21 | tail -20'
      ].join(' ; ')

      const result = await this.api.sshConnExec({
        cmd: compositeCommand,
        id: this.connectionId
      })

      const endTime = performance.now()
      const executionTime = Math.round(endTime - startTime)

      if (!result.success || !result.stdout) {
        console.log('[ContextFetcher] 命令执行失败:', { success: result.success, stdout: result.stdout, stderr: result.stderr })
        return null
      }

      console.log('[ContextFetcher] 原始输出:', result.stdout)
      console.log(`[ContextFetcher] 上下文获取完成，耗时: ${executionTime}ms`)
      const contextInfo: ContextInfo = {
        context: result.stdout,
        timestamp: new Date().toISOString(),
        executionTime: executionTime
      }
      return contextInfo
    } catch (error) {
      const endTime = performance.now()
      const executionTime = Math.round(endTime - startTime)
      console.error(`[ContextFetcher] 获取失败，耗时: ${executionTime}ms`, error)
      return null
    }
  }
}

/**
 * 创建上下文获取器实例
 */
export function createContextFetcher(options: ContextFetcherOptions): ContextFetcher {
  return new ContextFetcher(options)
}

/**
 * 快速获取上下文信息
 */
export async function quickFetchContext(connectionId: string, api: any): Promise<ContextInfo | null> {
  const fetcher = new ContextFetcher({
    connectionId,
    api,
    enableOutput: false
  })

  return await fetcher.fetchContext()
}
