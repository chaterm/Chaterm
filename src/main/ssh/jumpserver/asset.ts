// jumpserver-client.ts
import { Client, ConnectConfig } from 'ssh2'
import * as fs from 'fs'
import { Asset, parseJumpserverOutput } from './parser'

interface ServerInfo {
  name: string
  address: string
}

interface JumpServerConfig {
  host: string
  port?: number
  username: string
  privateKey?: string // 改为直接传入私钥内容
  password?: string
  passphrase?: string
}

class JumpServerClient {
  private conn: Client | null = null
  private stream: import('ssh2').ClientChannel | null = null // 持久化的 shell stream
  private config: JumpServerConfig
  private isConnected: boolean = false
  private outputBuffer: string = '' // 用于存储 stream 的输出
  private dataResolve: ((data: string) => void) | null = null // 用于 resolve executeCommand 的 Promise

  constructor(config: JumpServerConfig) {
    this.config = config
  }

  /**
   * 连接到JumpServer并建立一个持久的shell
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectConfig: ConnectConfig = {
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        keepaliveInterval: 10000,
        readyTimeout: 30000
      }

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
      this.conn.on('ready', () => {
        this.isConnected = true
        this.conn.shell((err, stream) => {
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
            if (retries === 0) {
              return reject(new Error('Failed to get initial menu prompt.'))
            }
            if (this.outputBuffer.includes('Opt>')) {
              console.log('初始菜单加载完毕')
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
        reject(err)
      })

      this.conn.connect(connectConfig)
    })
  }

  /**
   * 在持久化的 shell 中执行命令并获取输出
   */
  private async executeCommand(command: string): Promise<string> {
    if (!this.stream) {
      throw new Error('Shell stream is not available.')
    }

    return new Promise((resolve, reject) => {
      this.dataResolve = resolve

      this.stream!.write(command + '\r')

      // 设置超时
      setTimeout(() => {
        if (this.dataResolve) {
          this.dataResolve = null
          reject(new Error(`Command '${command}' timed out.`))
        }
      }, 10000) // 10秒超时
    })
  }

  /**
   * 获取所有资产
   */
  async getAllAssets(): Promise<Asset[]> {
    if (!this.isConnected) {
      await this.connect()
    }

    const allAssets: Asset[] = []
    const seenAssetAddresses = new Set<string>()

    // 获取第一页
    let output = await this.executeCommand('p')
    let { assets: pageAssets, pagination } = parseJumpserverOutput(output)

    pageAssets.forEach((asset) => {
      if (!seenAssetAddresses.has(asset.address)) {
        allAssets.push(asset)
        seenAssetAddresses.add(asset.address)
      }
    })

    // 如果有多页，继续获取后续页面
    while (pagination.currentPage < pagination.totalPages) {
      const nextPage = pagination.currentPage + 1

      output = await this.executeCommand('n')

      const { assets: newPageAssets, pagination: newPagination } = parseJumpserverOutput(output)

      // 总是更新分页信息
      if (newPagination.totalPages > 1) {
        pagination = newPagination
      } else {
        // 如果Jumpserver在后续页面不再返回分页信息，我们需要手动增加页码
        pagination.currentPage++
      }

      if (newPageAssets.length === 0 && pagination.currentPage < pagination.totalPages) {
        console.log('警告：在到达总页数之前，页面已无内容。')
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

      if (!newAssetsAdded && pagination.currentPage < pagination.totalPages) {
        console.log(`警告: 第 ${nextPage} 页未发现新资产，但总页数为 ${pagination.totalPages}。可能Jumpserver返回了重复数据。停止翻页。`)
        break
      }
    }

    return allAssets
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
      this.conn.end()
      this.isConnected = false
      console.log('连接已关闭')
    }
  }
}

export default JumpServerClient
