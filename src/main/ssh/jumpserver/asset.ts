// jumpserver-client.ts
import { Client, ConnectConfig } from 'ssh2'
// import * as fs from 'fs'
import { Asset, parseJumpserverOutput } from './parser'

import { getPackageInfo } from './connectionManager'
import { LEGACY_ALGORITHMS } from '../algorithms'
import { createLogger } from '@logging'

const logger = createLogger('jumpserver')

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
    logger.info('Starting connection to JumpServer', { event: 'jumpserver.asset.connect', host: this.config.host })
    return new Promise((resolve, reject) => {
      const connectConfig: ConnectConfig = {
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        keepaliveInterval: 10000,
        readyTimeout: 180000,
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
          logger.debug('Two-factor authentication required, calling handler', { event: 'jumpserver.asset.2fa' })
          // Call handler but don't wait for its result, as authentication result will be determined by ready or error event
          this.keyboardInteractiveHandler(prompts, finish).catch((err) => {
            logger.error('Two-factor authentication handler error', {
              event: 'jumpserver.asset.2fa.error',
              error: err instanceof Error ? err.message : String(err)
            })
            this.conn?.end()
            reject(err)
          })
        } else {
          logger.warn('Two-factor authentication required but no handler provided', { event: 'jumpserver.asset.2fa.nohandler' })
          finish([])
          reject(new Error('Two-factor authentication required but no handler provided'))
        }
      })

      this.conn.on('ready', () => {
        this.isConnected = true
        logger.info('SSH connection established for asset fetch', { event: 'jumpserver.asset.connected' })

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
              logger.debug('Command end marker detected', { event: 'jumpserver.asset.command.done', bufferLength: this.outputBuffer.length })
              this.dataResolve(this.outputBuffer)
              this.outputBuffer = '' // Clear buffer
              this.dataResolve = null // Reset resolver
            }
          })

          this.stream.on('close', () => {
            logger.debug('Asset fetch stream closed', { event: 'jumpserver.asset.stream.close' })
            this.isConnected = false
          })

          this.stream.on('error', (error: Error) => {
            logger.error('Asset fetch stream error', { event: 'jumpserver.asset.stream.error', error: error.message })
            if (this.dataResolve) {
              this.dataResolve = null
              this.outputBuffer = ''
              reject(error)
            }
          })

          // Wait for initial menu to appear
          const waitForMenu = (retries = 10) => {
            logger.debug('Waiting for initial menu', { event: 'jumpserver.asset.menu.wait', retries, bufferLength: this.outputBuffer.length })
            if (retries === 0) {
              logger.warn('Timeout waiting for initial menu', { event: 'jumpserver.asset.menu.timeout' })
              return reject(new Error('Failed to get initial menu prompt.'))
            }
            if (this.outputBuffer.includes('Opt>')) {
              logger.debug('Initial menu loaded', { event: 'jumpserver.asset.menu.ready' })
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
        logger.error('SSH connection error during asset fetch', { event: 'jumpserver.asset.error', error: err.message })

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
    logger.debug('Executing command on JumpServer', { event: 'jumpserver.asset.command', command })

    if (!this.stream) {
      logger.warn('Shell stream not available', { event: 'jumpserver.asset.stream.unavailable' })
      throw new Error('Shell stream is not available.')
    }

    return new Promise((resolve, reject) => {
      this.dataResolve = resolve

      logger.debug('Sending command to stream', { event: 'jumpserver.asset.command.send', command })
      this.stream!.write(command + '\r')

      // Set timeout
      const timeoutId = setTimeout(() => {
        if (this.dataResolve) {
          logger.warn('Command timed out', { event: 'jumpserver.asset.command.timeout', command })
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
    logger.info('Starting to fetch assets', { event: 'jumpserver.asset.fetch.start' })

    if (!this.isConnected) {
      logger.debug('Connection not established, starting connection', { event: 'jumpserver.asset.fetch.connecting' })
      await this.connect()
      logger.debug('Connection established', { event: 'jumpserver.asset.fetch.connected' })
    }

    const allAssets: Asset[] = []
    const seenAssetAddresses = new Set<string>()

    logger.debug('Fetching first page of assets', { event: 'jumpserver.asset.fetch.page', page: 1 })
    // Get first page
    let output = await this.executeCommand('p')
    logger.debug('Received first page output', { event: 'jumpserver.asset.fetch.page.done', page: 1, outputLength: output.length })
    let { assets: pageAssets, pagination } = parseJumpserverOutput(output)
    logger.debug('Parsed first page', {
      event: 'jumpserver.asset.fetch.page.parsed',
      page: 1,
      assetCount: pageAssets.length,
      totalPages: pagination.totalPages
    })

    pageAssets.forEach((asset) => {
      if (!seenAssetAddresses.has(asset.address)) {
        allAssets.push(asset)
        seenAssetAddresses.add(asset.address)
      }
    })

    // Set maximum page limit to avoid fetching too many pages
    const MAX_PAGES = 100 // Further reduced to 100 pages, more conservative
    const maxPagesToFetch = Math.min(pagination.totalPages, MAX_PAGES)

    logger.debug('Asset fetch plan', { event: 'jumpserver.asset.fetch.plan', totalPages: pagination.totalPages, maxPagesToFetch })

    // If there are multiple pages, continue fetching subsequent pages
    let consecutiveFailures = 0
    const MAX_CONSECUTIVE_FAILURES = 2 // Reduced to 2 consecutive failures before stopping
    const startTime = Date.now()
    const MAX_TOTAL_TIME = 5 * 60 * 1000 // Maximum 5 minutes

    while (pagination.currentPage < maxPagesToFetch && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
      // Check total time limit
      if (Date.now() - startTime > MAX_TOTAL_TIME) {
        logger.warn('Asset fetch running for more than 5 minutes, stopping', { event: 'jumpserver.asset.fetch.timeout' })
        break
      }
      const nextPage = pagination.currentPage + 1
      logger.debug('Fetching next page', { event: 'jumpserver.asset.fetch.page', page: nextPage })

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
              logger.debug('Page command failed, retrying', { event: 'jumpserver.asset.fetch.retry', page: nextPage, retryCount, maxRetries })
              await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait 2 seconds before retry
            } else {
              throw cmdError
            }
          }
        }

        const pageEndTime = Date.now()
        const pageTime = pageEndTime - pageStartTime

        logger.debug('Page fetched', { event: 'jumpserver.asset.fetch.page.done', page: nextPage, outputLength: output.length, timeMs: pageTime })
        consecutiveFailures = 0 // Reset failure count

        // If single page takes too long, consider stopping
        if (pageTime > 15000) {
          // Exceeds 15 seconds
          logger.warn('Page fetch too slow, stopping pagination', { event: 'jumpserver.asset.fetch.slow', page: nextPage, timeMs: pageTime })
          break
        }
      } catch (error) {
        consecutiveFailures++
        logger.error('Failed to fetch page', {
          event: 'jumpserver.asset.fetch.error',
          page: nextPage,
          consecutiveFailures,
          error: error instanceof Error ? error.message : String(error)
        })

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.warn('Too many consecutive failures, stopping', { event: 'jumpserver.asset.fetch.abort', consecutiveFailures })
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

      logger.debug('Page parsed', { event: 'jumpserver.asset.fetch.page.parsed', page: nextPage, assetCount: newPageAssets.length })

      if (newPageAssets.length === 0) {
        logger.debug('Empty page, stopping pagination', { event: 'jumpserver.asset.fetch.empty', page: nextPage })
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
        logger.debug('No new assets on page, stopping pagination', { event: 'jumpserver.asset.fetch.duplicate', page: nextPage })
        break
      }

      logger.debug('Page processed', { event: 'jumpserver.asset.fetch.progress', page: nextPage, totalAssets: allAssets.length })
    }

    logger.info('Asset fetch complete', { event: 'jumpserver.asset.fetch.done', totalAssets: allAssets.length })
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
      logger.debug('Asset client connection closed', { event: 'jumpserver.asset.close' })
    }
  }
}

export default JumpServerClient
