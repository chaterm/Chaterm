// jumpserver-client.ts
import { Client, ConnectConfig } from 'ssh2'
// import * as fs from 'fs'
import { Asset, parseJumpserverOutput } from './parser'

import { getPackageInfo } from './connectionManager'
import { LEGACY_ALGORITHMS } from '../sshHandle'

// interface ServerInfo {
//   name: string
//   address: string
// }

interface JumpServerConfig {
  host: string
  port?: number
  username: string
  privateKey?: string // 改为直接传入私钥内容
  password?: string
  passphrase?: string
  connIdentToken?: string
}

interface KeyboardInteractiveHandler {
  (prompts: any[], finish: (responses: string[]) => void): Promise<void>
}

interface AuthResultCallback {
  (success: boolean, error?: string): void
}

class JumpServerClient {
  private conn: Client | null = null
  private stream: import('ssh2').ClientChannel | null = null // 持久化的 shell stream
  private config: JumpServerConfig
  private isConnected: boolean = false
  private outputBuffer: string = '' // 用于存储 stream 的输出
  private dataResolve: ((data: string) => void) | null = null // 用于 resolve executeCommand 的 Promise
  private keyboardInteractiveHandler?: KeyboardInteractiveHandler // 二次验证处理器
  private authResultCallback?: AuthResultCallback // 验证结果回调

  constructor(config: JumpServerConfig, keyboardInteractiveHandler?: KeyboardInteractiveHandler, authResultCallback?: AuthResultCallback) {
    this.config = config
    this.keyboardInteractiveHandler = keyboardInteractiveHandler
    this.authResultCallback = authResultCallback
  }

  /**
   * 连接到JumpServer并建立一个持久的shell
   */
  async connect(): Promise<void> {
    console.log('JumpServerClient.connect: 开始连接到 JumpServer')
    return new Promise((resolve, reject) => {
      const connectConfig: ConnectConfig = {
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        keepaliveInterval: 10000,
        readyTimeout: 30000,
        tryKeyboard: true, // Enable keyboard interactive authentication for 2FA
        algorithms: LEGACY_ALGORITHMS
      }

      const identToken = this.config.connIdentToken ? `_t=${this.config.connIdentToken}` : ''
      const packageInfo = getPackageInfo()
      connectConfig.ident = `${packageInfo.name}_${packageInfo.version}` + identToken

      // 根据配置选择认证方式
      if (this.config.privateKey) {
        connectConfig.privateKey = Buffer.from(this.config.privateKey)
        if (this.config.passphrase) {
          connectConfig.passphrase = this.config.passphrase
        }
      } else if (this.config.password) {
        connectConfig.password = this.config.password
      } else {
        return reject(new Error('缺少认证信息：需要私钥或密码'))
      }

      this.conn = new Client()

      // Handle keyboard-interactive authentication for 2FA
      this.conn.on('keyboard-interactive', (_name, _instructions, _instructionsLang, prompts, finish) => {
        if (this.keyboardInteractiveHandler) {
          console.log('JumpServerClient: 需要二次验证，调用处理器...')
          // 调用处理器，但不等待它的结果，因为验证结果会通过 ready 或 error 事件来确定
          this.keyboardInteractiveHandler(prompts, finish).catch((err) => {
            console.error('JumpServerClient: 二次验证处理器出错', err)
            this.conn?.end()
            reject(err)
          })
        } else {
          console.log('JumpServerClient: 需要二次验证但没有处理器，拒绝连接')
          finish([])
          reject(new Error('需要二次验证但没有提供处理器'))
        }
      })

      this.conn.on('ready', () => {
        this.isConnected = true
        console.log('JumpServerClient: SSH 连接已建立')

        // 如果有验证结果回调，通知验证成功
        if (this.authResultCallback) {
          this.authResultCallback(true)
        }

        this.conn!.shell((err, stream) => {
          if (err) {
            return reject(err)
          }
          this.stream = stream

          // 设置统一的数据处理器
          this.stream.on('data', (data: Buffer) => {
            const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nry=><]/g
            const chunk = data.toString().replace(ansiRegex, '')
            this.outputBuffer += chunk

            // 如果有正在等待的命令，检查是否结束
            if (this.dataResolve && (this.outputBuffer.includes('[Host]>') || this.outputBuffer.includes('Opt>'))) {
              console.log('JumpServerClient: 检测到命令结束标志，返回输出，长度:', this.outputBuffer.length)
              this.dataResolve(this.outputBuffer)
              this.outputBuffer = '' // 清空缓冲区
              this.dataResolve = null // 重置 resolver
            }
          })

          this.stream.on('close', () => {
            console.log('Stream closed')
            this.isConnected = false
          })

          this.stream.on('error', (error: Error) => {
            console.error('Stream error:', error)
            if (this.dataResolve) {
              this.dataResolve = null
              this.outputBuffer = ''
              reject(error)
            }
          })

          // 等待初始菜单出现
          const waitForMenu = (retries = 10) => {
            console.log(`JumpServerClient: 等待初始菜单，剩余重试次数: ${retries}, 当前缓冲区内容长度: ${this.outputBuffer.length}`)
            if (retries === 0) {
              console.log('JumpServerClient: 等待初始菜单超时，缓冲区内容:', this.outputBuffer)
              return reject(new Error('Failed to get initial menu prompt.'))
            }
            if (this.outputBuffer.includes('Opt>')) {
              console.log('JumpServerClient: 初始菜单加载完毕，缓冲区内容:', this.outputBuffer)
              this.outputBuffer = '' // 清空初始菜单的 buffer
              resolve()
            } else {
              setTimeout(() => waitForMenu(retries - 1), 500)
            }
          }
          setTimeout(waitForMenu, 500) // 启动等待
        })
      })

      this.conn.on('error', (err) => {
        console.log('JumpServerClient: SSH 连接错误', err)

        // 如果有验证结果回调，通知验证失败
        if (this.authResultCallback) {
          this.authResultCallback(false, err.message)
        }

        reject(err)
      })

      this.conn.connect(connectConfig)
    })
  }

  /**
   * 在持久化的 shell 中执行命令并获取输出
   */
  private async executeCommand(command: string): Promise<string> {
    console.log(`JumpServerClient.executeCommand: 执行命令 "${command}"`)

    if (!this.stream) {
      console.log('JumpServerClient.executeCommand: Shell stream 不可用')
      throw new Error('Shell stream is not available.')
    }

    return new Promise((resolve, reject) => {
      this.dataResolve = resolve

      console.log(`JumpServerClient.executeCommand: 发送命令到 stream: "${command}"`)
      this.stream!.write(command + '\r')

      // 设置超时
      const timeoutId = setTimeout(() => {
        if (this.dataResolve) {
          console.log(`JumpServerClient.executeCommand: 命令 "${command}" 超时`)
          this.dataResolve = null
          reject(new Error(`Command '${command}' timed out.`))
        }
      }, 15000) // 减少到15秒超时

      // 保存原始的 resolve 函数，以便在成功时清除超时
      const originalResolve = this.dataResolve
      this.dataResolve = (data: string) => {
        clearTimeout(timeoutId)
        originalResolve(data)
      }
    })
  }

  /**
   * 获取所有资产
   */
  async getAllAssets(): Promise<Asset[]> {
    console.log('JumpServerClient.getAllAssets: 开始获取资产')

    if (!this.isConnected) {
      console.log('JumpServerClient.getAllAssets: 连接未建立，开始连接...')
      await this.connect()
      console.log('JumpServerClient.getAllAssets: 连接已建立')
    } else {
      console.log('JumpServerClient.getAllAssets: 连接已存在')
    }

    const allAssets: Asset[] = []
    const seenAssetAddresses = new Set<string>()

    console.log('JumpServerClient.getAllAssets: 执行命令 "p" 获取第一页资产...')
    // 获取第一页
    let output = await this.executeCommand('p')
    console.log('JumpServerClient.getAllAssets: 收到第一页输出，长度:', output.length)
    let { assets: pageAssets, pagination } = parseJumpserverOutput(output)
    console.log('JumpServerClient.getAllAssets: 解析第一页结果，资产数量:', pageAssets.length, '分页信息:', pagination)

    pageAssets.forEach((asset) => {
      if (!seenAssetAddresses.has(asset.address)) {
        allAssets.push(asset)
        seenAssetAddresses.add(asset.address)
      }
    })

    // 设置最大页数限制，避免获取过多页面
    const MAX_PAGES = 100 // 进一步减少到100页，更保守
    const maxPagesToFetch = Math.min(pagination.totalPages, MAX_PAGES)

    console.log(`JumpServerClient.getAllAssets: 总页数 ${pagination.totalPages}，限制获取 ${maxPagesToFetch} 页`)

    // 如果有多页，继续获取后续页面
    let consecutiveFailures = 0
    const MAX_CONSECUTIVE_FAILURES = 2 // 减少到2次连续失败就停止
    const startTime = Date.now()
    const MAX_TOTAL_TIME = 5 * 60 * 1000 // 最多5分钟

    while (pagination.currentPage < maxPagesToFetch && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
      // 检查总时间限制
      if (Date.now() - startTime > MAX_TOTAL_TIME) {
        console.log(`JumpServerClient.getAllAssets: 已运行超过5分钟，停止获取更多页面`)
        break
      }
      const nextPage = pagination.currentPage + 1
      console.log(`JumpServerClient.getAllAssets: 获取第 ${nextPage} 页...`)

      try {
        const pageStartTime = Date.now()

        // 尝试执行命令，如果失败则重试一次
        let commandSuccess = false
        let retryCount = 0
        const maxRetries = 1

        while (!commandSuccess && retryCount <= maxRetries) {
          try {
            output = await this.executeCommand('n')
            commandSuccess = true
          } catch (cmdError) {
            retryCount++
            if (retryCount <= maxRetries) {
              console.log(`JumpServerClient.getAllAssets: 第 ${nextPage} 页命令失败，重试 ${retryCount}/${maxRetries}`)
              await new Promise((resolve) => setTimeout(resolve, 2000)) // 等待2秒再重试
            } else {
              throw cmdError
            }
          }
        }

        const pageEndTime = Date.now()
        const pageTime = pageEndTime - pageStartTime

        console.log(`JumpServerClient.getAllAssets: 第 ${nextPage} 页输出长度: ${output.length}，耗时: ${pageTime}ms`)
        consecutiveFailures = 0 // 重置失败计数

        // 如果单页耗时过长，考虑停止
        if (pageTime > 15000) {
          // 超过15秒
          console.log(`JumpServerClient.getAllAssets: 第 ${nextPage} 页耗时过长 (${pageTime}ms)，可能后续页面会更慢，停止获取`)
          break
        }
      } catch (error) {
        consecutiveFailures++
        console.error(`JumpServerClient.getAllAssets: 获取第 ${nextPage} 页失败 (连续失败 ${consecutiveFailures} 次):`, error)

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.log(`JumpServerClient.getAllAssets: 连续失败 ${MAX_CONSECUTIVE_FAILURES} 次，停止获取更多页面`)
          break
        }

        // 手动增加页码，继续尝试下一页
        pagination.currentPage++
        continue
      }

      const { assets: newPageAssets, pagination: newPagination } = parseJumpserverOutput(output)

      // 总是更新分页信息
      if (newPagination.totalPages > 1) {
        pagination = newPagination
      } else {
        // 如果Jumpserver在后续页面不再返回分页信息，我们需要手动增加页码
        pagination.currentPage++
      }

      console.log(`JumpServerClient.getAllAssets: 第 ${nextPage} 页解析结果，资产数量: ${newPageAssets.length}`)

      if (newPageAssets.length === 0) {
        console.log(`JumpServerClient.getAllAssets: 第 ${nextPage} 页无资产，停止翻页`)
        break
      }

      let newAssetsAdded = false
      newPageAssets.forEach((asset) => {
        if (!seenAssetAddresses.has(asset.address)) {
          allAssets.push(asset)
          seenAssetAddresses.add(asset.address)
          newAssetsAdded = true
        }
      })

      if (!newAssetsAdded) {
        console.log(`JumpServerClient.getAllAssets: 第 ${nextPage} 页未发现新资产，可能是重复数据，停止翻页`)
        break
      }

      console.log(`JumpServerClient.getAllAssets: 第 ${nextPage} 页处理完成，当前总资产数: ${allAssets.length}`)
    }

    console.log(`JumpServerClient.getAllAssets: 完成，总共获取 ${allAssets.length} 个资产`)
    return allAssets
  }

  /**
   * 关闭连接
   */
  close(): void {
    if (this.isConnected) {
      if (this.stream) {
        this.stream.end()
        this.stream = null
      }
      if (this.conn) {
        this.conn.end()
      }
      this.isConnected = false
      console.log('连接已关闭')
    }
  }
}

export default JumpServerClient
