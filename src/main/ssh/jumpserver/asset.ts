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
  privateKey?: string // Changed to directly pass private key content
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
  private stream: import('ssh2').ClientChannel | null = null // Persistent shell stream
  private config: JumpServerConfig
  private isConnected: boolean = false
  private outputBuffer: string = '' // Buffer for storing stream output
  private dataResolve: ((data: string) => void) | null = null // Resolver for executeCommand Promise
  private keyboardInteractiveHandler?: KeyboardInteractiveHandler // Two-factor authentication handler
  private authResultCallback?: AuthResultCallback // Authentication result callback

  constructor(config: JumpServerConfig, keyboardInteractiveHandler?: KeyboardInteractiveHandler, authResultCallback?: AuthResultCallback) {
    this.config = config
    this.keyboardInteractiveHandler = keyboardInteractiveHandler
    this.authResultCallback = authResultCallback
  }

  /**
   * Connect to JumpServer and establish a persistent shell
   */
  async connect(): Promise<void> {
    console.log('JumpServerClient.connect: Starting connection to JumpServer')
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

      // Select authentication method based on configuration
      if (this.config.privateKey) {
        connectConfig.privateKey = Buffer.from(this.config.privateKey)
        if (this.config.passphrase) {
          connectConfig.passphrase = this.config.passphrase
        }
      } else if (this.config.password) {
        connectConfig.password = this.config.password
      } else {
        return reject(new Error('Missing authentication info: private key or password required'))
      }

      this.conn = new Client()

      // Handle keyboard-interactive authentication for 2FA
      this.conn.on('keyboard-interactive', (_name, _instructions, _instructionsLang, prompts, finish) => {
        if (this.keyboardInteractiveHandler) {
          console.log('JumpServerClient: Two-factor authentication required, calling handler...')
          // Call handler but don't wait for its result, as authentication result will be determined by ready or error event
          this.keyboardInteractiveHandler(prompts, finish).catch((err) => {
            console.error('JumpServerClient: Two-factor authentication handler error', err)
            this.conn?.end()
            reject(err)
          })
        } else {
          console.log('JumpServerClient: Two-factor authentication required but no handler provided, rejecting connection')
          finish([])
          reject(new Error('Two-factor authentication required but no handler provided'))
        }
      })

      this.conn.on('ready', () => {
        this.isConnected = true
        console.log('JumpServerClient: SSH connection established')

        // If authentication result callback exists, notify success
        if (this.authResultCallback) {
          this.authResultCallback(true)
        }

        this.conn!.shell((err, stream) => {
          if (err) {
            return reject(err)
          }
          this.stream = stream

          // Set up unified data handler
          this.stream.on('data', (data: Buffer) => {
            const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nry=><]/g
            const chunk = data.toString().replace(ansiRegex, '')
            this.outputBuffer += chunk

            // If there's a waiting command, check if it's finished
            if (this.dataResolve && (this.outputBuffer.includes('[Host]>') || this.outputBuffer.includes('Opt>'))) {
              console.log('JumpServerClient: Command end marker detected, returning output, length:', this.outputBuffer.length)
              this.dataResolve(this.outputBuffer)
              this.outputBuffer = '' // Clear buffer
              this.dataResolve = null // Reset resolver
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

          // Wait for initial menu to appear
          const waitForMenu = (retries = 10) => {
            console.log(
              `JumpServerClient: Waiting for initial menu, remaining retries: ${retries}, current buffer length: ${this.outputBuffer.length}`
            )
            if (retries === 0) {
              console.log('JumpServerClient: Timeout waiting for initial menu, buffer content:', this.outputBuffer)
              return reject(new Error('Failed to get initial menu prompt.'))
            }
            if (this.outputBuffer.includes('Opt>')) {
              console.log('JumpServerClient: Initial menu loaded, buffer content:', this.outputBuffer)
              this.outputBuffer = '' // Clear initial menu buffer
              resolve()
            } else {
              setTimeout(() => waitForMenu(retries - 1), 500)
            }
          }
          setTimeout(waitForMenu, 500) // Start waiting
        })
      })

      this.conn.on('error', (err) => {
        console.log('JumpServerClient: SSH connection error', err)

        // If authentication result callback exists, notify failure
        if (this.authResultCallback) {
          this.authResultCallback(false, err.message)
        }

        reject(err)
      })

      this.conn.connect(connectConfig)
    })
  }

  /**
   * Execute command in persistent shell and get output
   */
  private async executeCommand(command: string): Promise<string> {
    console.log(`JumpServerClient.executeCommand: Executing command "${command}"`)

    if (!this.stream) {
      console.log('JumpServerClient.executeCommand: Shell stream not available')
      throw new Error('Shell stream is not available.')
    }

    return new Promise((resolve, reject) => {
      this.dataResolve = resolve

      console.log(`JumpServerClient.executeCommand: Sending command to stream: "${command}"`)
      this.stream!.write(command + '\r')

      // Set timeout
      const timeoutId = setTimeout(() => {
        if (this.dataResolve) {
          console.log(`JumpServerClient.executeCommand: Command "${command}" timed out`)
          this.dataResolve = null
          reject(new Error(`Command '${command}' timed out.`))
        }
      }, 15000) // Reduced to 15 second timeout

      // Save original resolve function to clear timeout on success
      const originalResolve = this.dataResolve
      this.dataResolve = (data: string) => {
        clearTimeout(timeoutId)
        originalResolve(data)
      }
    })
  }

  /**
   * Get all assets
   */
  async getAllAssets(): Promise<Asset[]> {
    console.log('JumpServerClient.getAllAssets: Starting to fetch assets')

    if (!this.isConnected) {
      console.log('JumpServerClient.getAllAssets: Connection not established, starting connection...')
      await this.connect()
      console.log('JumpServerClient.getAllAssets: Connection established')
    } else {
      console.log('JumpServerClient.getAllAssets: Connection already exists')
    }

    const allAssets: Asset[] = []
    const seenAssetAddresses = new Set<string>()

    console.log('JumpServerClient.getAllAssets: Executing command "p" to get first page of assets...')
    // Get first page
    let output = await this.executeCommand('p')
    console.log('JumpServerClient.getAllAssets: Received first page output, length:', output.length)
    let { assets: pageAssets, pagination } = parseJumpserverOutput(output)
    console.log('JumpServerClient.getAllAssets: Parsed first page result, asset count:', pageAssets.length, 'pagination info:', pagination)

    pageAssets.forEach((asset) => {
      if (!seenAssetAddresses.has(asset.address)) {
        allAssets.push(asset)
        seenAssetAddresses.add(asset.address)
      }
    })

    // Set maximum page limit to avoid fetching too many pages
    const MAX_PAGES = 100 // Further reduced to 100 pages, more conservative
    const maxPagesToFetch = Math.min(pagination.totalPages, MAX_PAGES)

    console.log(`JumpServerClient.getAllAssets: Total pages ${pagination.totalPages}, limiting fetch to ${maxPagesToFetch} pages`)

    // If there are multiple pages, continue fetching subsequent pages
    let consecutiveFailures = 0
    const MAX_CONSECUTIVE_FAILURES = 2 // Reduced to 2 consecutive failures before stopping
    const startTime = Date.now()
    const MAX_TOTAL_TIME = 5 * 60 * 1000 // Maximum 5 minutes

    while (pagination.currentPage < maxPagesToFetch && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
      // Check total time limit
      if (Date.now() - startTime > MAX_TOTAL_TIME) {
        console.log(`JumpServerClient.getAllAssets: Running for more than 5 minutes, stopping fetch of more pages`)
        break
      }
      const nextPage = pagination.currentPage + 1
      console.log(`JumpServerClient.getAllAssets: Fetching page ${nextPage}...`)

      try {
        const pageStartTime = Date.now()

        // Try to execute command, retry once if it fails
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
              console.log(`JumpServerClient.getAllAssets: Page ${nextPage} command failed, retrying ${retryCount}/${maxRetries}`)
              await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait 2 seconds before retry
            } else {
              throw cmdError
            }
          }
        }

        const pageEndTime = Date.now()
        const pageTime = pageEndTime - pageStartTime

        console.log(`JumpServerClient.getAllAssets: Page ${nextPage} output length: ${output.length}, time taken: ${pageTime}ms`)
        consecutiveFailures = 0 // Reset failure count

        // If single page takes too long, consider stopping
        if (pageTime > 15000) {
          // Exceeds 15 seconds
          console.log(`JumpServerClient.getAllAssets: Page ${nextPage} took too long (${pageTime}ms), subsequent pages may be slower, stopping fetch`)
          break
        }
      } catch (error) {
        consecutiveFailures++
        console.error(`JumpServerClient.getAllAssets: Failed to fetch page ${nextPage} (consecutive failures ${consecutiveFailures}):`, error)

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.log(`JumpServerClient.getAllAssets: ${MAX_CONSECUTIVE_FAILURES} consecutive failures, stopping fetch of more pages`)
          break
        }

        // Manually increment page number, continue trying next page
        pagination.currentPage++
        continue
      }

      const { assets: newPageAssets, pagination: newPagination } = parseJumpserverOutput(output)

      // Always update pagination info
      if (newPagination.totalPages > 1) {
        pagination = newPagination
      } else {
        // If JumpServer no longer returns pagination info on subsequent pages, we need to manually increment page number
        pagination.currentPage++
      }

      console.log(`JumpServerClient.getAllAssets: Page ${nextPage} parsed result, asset count: ${newPageAssets.length}`)

      if (newPageAssets.length === 0) {
        console.log(`JumpServerClient.getAllAssets: Page ${nextPage} has no assets, stopping pagination`)
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
        console.log(`JumpServerClient.getAllAssets: Page ${nextPage} found no new assets, may be duplicate data, stopping pagination`)
        break
      }

      console.log(`JumpServerClient.getAllAssets: Page ${nextPage} processing complete, current total asset count: ${allAssets.length}`)
    }

    console.log(`JumpServerClient.getAllAssets: Complete, total assets fetched: ${allAssets.length}`)
    return allAssets
  }

  /**
   * Close connection
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
      console.log('Connection closed')
    }
  }
}

export default JumpServerClient
