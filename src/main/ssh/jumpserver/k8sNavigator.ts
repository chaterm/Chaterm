import { Client } from 'ssh2'
import { BrowserWindow } from 'electron'
import { ChatermDatabaseService } from '../../storage/db/chaterm.service'
import { parseJumpserverOutput, type Asset, type PaginationInfo } from './parser'
import { JUMPSERVER_CONSTANTS } from './constants'
import { jumpserverConnections, jumpserverConnectionStatus, jumpserverK8sSessions } from './state'
import { handleJumpServerKeyboardInteractive } from './mfa'

const logger = createLogger('jumpserver.k8s')

const ANSI_REGEX = /[][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nry=><]/g
const PAGE_SETTLE_DELAY = 300
const MAX_PAGE_TURNS = 20
const SHELL_READY_PROMPT_REGEX = /[a-zA-Z0-9_-]+#\s*$/

interface BastionConnConfig {
  host: string
  port: number
  username: string
  privateKey?: string
  passphrase?: string
  password?: string
}

interface ShellStream {
  write(chunk: string): boolean
  on(event: string, listener: (...args: unknown[]) => void): unknown
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown
  close?: () => void
  end?: () => void
}

interface ReusableBastionConnection {
  connectionId: string
  conn: Client
}

interface BastionConnectOptions {
  mfaEvent?: Electron.IpcMainInvokeEvent
  mfaRequestId?: string
}

interface K8sConnectOptions {
  allowAutoConnect?: boolean
  mfaEvent?: Electron.IpcMainInvokeEvent
  mfaRequestId?: string
}

const sendToRenderer = (channel: string, data: unknown): void => {
  BrowserWindow.getAllWindows().forEach((w) => {
    try {
      w.webContents.send(channel, data)
    } catch (err) {
      logger.warn('Failed to send to renderer', { event: 'k8s.sendToRenderer.error', channel, hasError: !!err })
    }
  })
}

const stripAnsi = (input: string): string => input.replace(ANSI_REGEX, '')

const hasPaginationMarker = (output: string): boolean => output.includes('页码：') || output.includes('Page:')

const isK8sMenuReady = (output: string): boolean => output.includes('[K8S]>') && hasPaginationMarker(output)

const isShellReady = (output: string): boolean => {
  if (output.includes('Welcome to JumpServer kubectl')) return true
  const trimmedTail = output.split('\n').pop() || ''
  return SHELL_READY_PROMPT_REGEX.test(trimmedTail)
}

/**
 * Load bastion connection config from local DB by uuid.
 * Mirrors the auth assembly in refreshOrganizationAssetsLogic.
 */
async function loadBastionConnConfig(bastionUuid: string): Promise<BastionConnConfig> {
  const dbService = await ChatermDatabaseService.getInstance()
  const db = dbService.getDb()

  const assetStmt = db.prepare('SELECT asset_ip, port, username, password, key_chain_id FROM t_assets WHERE uuid = ?')
  const assetRow = assetStmt.get(bastionUuid) as
    | { asset_ip?: string; port?: number; username?: string; password?: string; key_chain_id?: number }
    | undefined

  if (!assetRow || !assetRow.asset_ip || !assetRow.username) {
    throw new Error('Bastion asset not found or missing required fields')
  }

  const config: BastionConnConfig = {
    host: assetRow.asset_ip,
    port: assetRow.port || 22,
    username: assetRow.username
  }

  const keyChainId = assetRow.key_chain_id || 0
  if (keyChainId > 0) {
    const keyStmt = db.prepare('SELECT chain_private_key as privateKey, passphrase FROM t_asset_chains WHERE key_chain_id = ?')
    const keyRow = keyStmt.get(keyChainId) as { privateKey?: string; passphrase?: string } | undefined

    if (!keyRow || !keyRow.privateKey) {
      throw new Error('Keychain not found for bastion')
    }
    config.privateKey = keyRow.privateKey
    if (keyRow.passphrase) config.passphrase = keyRow.passphrase
  } else if (assetRow.password) {
    config.password = assetRow.password
  } else {
    throw new Error('Missing authentication information: private key or password required')
  }

  return config
}

/**
 * Establish a fresh ssh2 connection to the bastion.
 */
function connectBastion(config: BastionConnConfig, options?: BastionConnectOptions): Promise<Client> {
  // TODO(k8s-jumpserver-auto-connect):
  // For future "agent proactive connect" support, migrate this to the shared
  // JumpServer connection bootstrap (proxy/MFA/ident/legacy algorithms), and
  // avoid keeping a standalone bootstrap implementation here.
  return new Promise((resolve, reject) => {
    const conn = new Client()
    const onReady = () => {
      conn.removeListener('error', onError)
      resolve(conn)
    }
    const onError = (err: Error) => {
      conn.removeListener('ready', onReady)
      reject(err)
    }
    conn.once('ready', onReady)
    conn.once('error', onError)

    conn.on('keyboard-interactive', async (_name, _instructions, _instructionsLang, prompts, finish) => {
      if (!options?.mfaEvent) {
        finish([])
        reject(new Error('Two-factor authentication required. Please refresh from a foreground window and complete MFA.'))
        return
      }

      try {
        const requestId = options.mfaRequestId || `k8s-sync-${Date.now()}`
        await handleJumpServerKeyboardInteractive(options.mfaEvent, requestId, prompts, finish)
      } catch (err) {
        conn.end()
        reject(err as Error)
      }
    })

    const connectOpts: Record<string, unknown> = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT,
      keepaliveInterval: 10000,
      tryKeyboard: true
    }
    if (config.privateKey) {
      connectOpts.privateKey = config.privateKey
      if (config.passphrase) connectOpts.passphrase = config.passphrase
    } else if (config.password) {
      connectOpts.password = config.password
    }

    conn.connect(connectOpts as never)
  })
}

/**
 * Open a shell stream on the given conn.
 */
function openShell(conn: Client, cols?: number, rows?: number): Promise<ShellStream> {
  return new Promise((resolve, reject) => {
    const opts: Record<string, unknown> = { term: 'xterm-256color' }
    if (typeof cols === 'number') opts.cols = cols
    if (typeof rows === 'number') opts.rows = rows
    conn.shell(opts as never, (err: Error | undefined, stream: unknown) => {
      if (err) reject(err)
      else resolve(stream as ShellStream)
    })
  })
}

/**
 * Wait until predicate(buffer) is true and the buffer has been idle for `settleMs`.
 * Returns the accumulated buffer once stable.
 */
function waitForStable(
  stream: ShellStream,
  predicate: (output: string) => boolean,
  initialBuffer: string,
  timeoutMs: number,
  settleMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = initialBuffer
    let settleTimer: NodeJS.Timeout | null = null
    let predicateMet = predicate(buffer)

    const cleanup = () => {
      stream.removeListener('data', onData)
      stream.removeListener('error', onError)
      stream.removeListener('close', onClose)
      if (settleTimer) clearTimeout(settleTimer)
      clearTimeout(timeout)
    }

    const tryFinalize = () => {
      if (!predicateMet) return
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        cleanup()
        resolve(buffer)
      }, settleMs)
    }

    const onData = (...args: unknown[]) => {
      const data = args[0] as Buffer | string
      const chunk = stripAnsi(typeof data === 'string' ? data : data.toString())
      buffer += chunk
      if (!predicateMet) {
        predicateMet = predicate(buffer)
      }
      tryFinalize()
    }
    const onError = (...args: unknown[]) => {
      const err = args[0] as Error
      cleanup()
      reject(err)
    }
    const onClose = () => {
      cleanup()
      reject(new Error('Stream closed before stabilization'))
    }

    stream.on('data', onData)
    stream.on('error', onError)
    stream.on('close', onClose)

    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timeout waiting for output to stabilize'))
    }, timeoutMs)

    if (predicateMet) tryFinalize()
  })
}

/**
 * Try to close stream/conn, ignoring errors.
 */
function safeTeardown(conn: Client, stream: ShellStream | null, closeConn: boolean = true): void {
  if (stream) {
    try {
      if (typeof stream.close === 'function') stream.close()
      else if (typeof stream.end === 'function') stream.end()
    } catch {
      // ignore
    }
  }
  if (closeConn) {
    try {
      conn.end()
    } catch {
      // ignore
    }
  }
}

function findReusableBastionConnection(bastionUuid: string): ReusableBastionConnection | null {
  for (const [connectionId, connectionData] of jumpserverConnections.entries()) {
    if (connectionData.jumpserverUuid !== bastionUuid) continue
    const status = jumpserverConnectionStatus.get(connectionId)
    if (status && status.isVerified === false) continue
    return { connectionId, conn: connectionData.conn as Client }
  }

  // Fallback: reuse the underlying authenticated conn from an active K8s session.
  // This covers the case where user connected from K8s UI auto-connect path without
  // creating a main SSH terminal connection entry.
  for (const [terminalId, session] of jumpserverK8sSessions.entries()) {
    if (session.bastionUuid !== bastionUuid) continue
    const stream = session.stream as any
    if (!stream || stream.destroyed || stream.writable === false) continue
    return { connectionId: `k8s:${terminalId}`, conn: session.conn as Client }
  }

  return null
}

/**
 * List K8s assets reachable through a JumpServer bastion.
 * Optionally navigate to a specific page (1-based).
 */
export async function listK8sAssetsByBastion(
  bastionUuid: string,
  page?: number,
  options?: BastionConnectOptions
): Promise<{ assets: Asset[]; pagination: PaginationInfo }> {
  const targetPage = page && page > 0 ? page : 1
  const config = await loadBastionConnConfig(bastionUuid)
  const conn = await connectBastion(config, options)
  let stream: ShellStream | null = null

  try {
    stream = await openShell(conn)

    // 1) Wait for main menu Opt>
    await waitForStable(stream, (out) => out.includes('Opt>'), '', JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT, PAGE_SETTLE_DELAY)

    // 2) Send 'k' to enter K8S submenu
    stream.write('k\r')

    // 3) Wait for first K8s page to settle
    let pageBuffer = await waitForStable(stream, isK8sMenuReady, '', JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT, PAGE_SETTLE_DELAY)

    // 4) Page through if needed (n\r per page)
    let currentPage = 1
    while (currentPage < targetPage) {
      stream.write('n\r')
      pageBuffer = await waitForStable(stream, isK8sMenuReady, '', JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT, PAGE_SETTLE_DELAY)
      currentPage += 1
      if (currentPage > MAX_PAGE_TURNS) break
    }

    const parsed = parseJumpserverOutput(pageBuffer)

    // 5) Try to exit submenu cleanly
    try {
      stream.write('q\r')
    } catch {
      // ignore
    }

    logger.debug('Listed K8s assets', {
      event: 'k8s.list.success',
      bastionUuid,
      page: parsed.pagination.currentPage,
      totalPages: parsed.pagination.totalPages,
      count: parsed.assets.length
    })

    return { assets: parsed.assets, pagination: parsed.pagination }
  } catch (err) {
    logger.error('Failed to list K8s assets', {
      event: 'k8s.list.error',
      bastionUuid,
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  } finally {
    safeTeardown(conn, stream)
  }
}

/**
 * Fetch all K8s assets from a JumpServer bastion across all pages.
 * Used for full sync into k8s_clusters table.
 */
export async function syncK8sAssetsFromBastion(bastionUuid: string, options?: BastionConnectOptions): Promise<Asset[]> {
  const config = await loadBastionConnConfig(bastionUuid)
  const conn = await connectBastion(config, options)
  let stream: ShellStream | null = null
  const allAssets: Asset[] = []

  try {
    stream = await openShell(conn)

    await waitForStable(stream, (out) => out.includes('Opt>'), '', JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT, PAGE_SETTLE_DELAY)
    stream.write('k\r')

    let pageBuffer = await waitForStable(stream, isK8sMenuReady, '', JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT, PAGE_SETTLE_DELAY)
    let parsed = parseJumpserverOutput(pageBuffer)
    allAssets.push(...parsed.assets)

    const totalPages = parsed.pagination.totalPages
    let currentPage = parsed.pagination.currentPage

    while (currentPage < totalPages && currentPage < MAX_PAGE_TURNS) {
      stream.write('n\r')
      pageBuffer = await waitForStable(stream, isK8sMenuReady, '', JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT, PAGE_SETTLE_DELAY)
      parsed = parseJumpserverOutput(pageBuffer)
      allAssets.push(...parsed.assets)
      currentPage = parsed.pagination.currentPage
    }

    logger.info('Synced all K8s assets from bastion', {
      event: 'k8s.sync.success',
      bastionUuid,
      totalAssets: allAssets.length,
      totalPages
    })

    return allAssets
  } catch (err) {
    logger.error('Failed to sync K8s assets', {
      event: 'k8s.sync.error',
      bastionUuid,
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  } finally {
    safeTeardown(conn, stream)
  }
}

/**
 * Navigate to a specific K8s asset and keep the shell stream open for terminal IO.
 * The returned session is tracked in jumpserverK8sSessions.
 */
export async function connectK8sAssetByIdentity(
  terminalId: string,
  cluster: {
    bastion_uuid: string
    bastion_asset_address: string
    bastion_asset_name: string
    bastion_asset_id_last?: number | null
  },
  cols: number,
  rows: number,
  forwardToRenderer: boolean = true,
  options?: K8sConnectOptions
): Promise<{ resolvedAssetId: number }> {
  const reusable = findReusableBastionConnection(cluster.bastion_uuid)
  let conn: Client
  let ownsConnection = false
  let sourceConnectionId: string | undefined

  if (reusable) {
    conn = reusable.conn
    sourceConnectionId = reusable.connectionId
  } else if (options?.allowAutoConnect) {
    const config = await loadBastionConnConfig(cluster.bastion_uuid)
    conn = await connectBastion(config, {
      mfaEvent: options.mfaEvent,
      mfaRequestId: options.mfaRequestId
    })
    ownsConnection = true
  } else {
    throw new Error('No authenticated JumpServer connection found. Please connect to the bastion host first.')
  }

  let stream: ShellStream | null = null

  try {
    logger.info('Preparing JumpServer connection for K8s session', {
      event: ownsConnection ? 'k8s.connect.autoconnect' : 'k8s.connect.reuse',
      terminalId,
      sourceConnectionId
    })
    stream = await openShell(conn, cols, rows)

    // 1) Wait for main menu
    await waitForStable(stream, (out) => out.includes('Opt>'), '', JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT, PAGE_SETTLE_DELAY)

    // 2) Enter K8S submenu
    stream.write('k\r')

    // 3) Wait for first K8s page to stabilize
    let pageBuffer = await waitForStable(stream, isK8sMenuReady, '', JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT, PAGE_SETTLE_DELAY)

    let assetId: number | null = null

    // 4) Deterministic path: always scan by address+name.
    // Do not trust cached menu IDs because they can drift after asset list changes.
    let pageTurns = 0
    while (pageTurns < MAX_PAGE_TURNS) {
      const parsed = parseJumpserverOutput(pageBuffer)
      const match = parsed.assets.find((a) => a.address === cluster.bastion_asset_address && a.name === cluster.bastion_asset_name)
      if (match) {
        assetId = match.id
        break
      }
      if (parsed.pagination.currentPage >= parsed.pagination.totalPages) break
      stream.write('n\r')
      pageBuffer = await waitForStable(stream, isK8sMenuReady, '', JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT, PAGE_SETTLE_DELAY)
      pageTurns += 1
    }

    if (assetId === null) {
      throw new Error(`K8s asset not found by name+address (name=${cluster.bastion_asset_name}, address=${cluster.bastion_asset_address})`)
    }

    stream.write(`${assetId}\r`)
    await waitForStable(stream, isShellReady, '', JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT, PAGE_SETTLE_DELAY)

    // 5) Persist session and wire up data forwarding
    jumpserverK8sSessions.set(terminalId, {
      conn,
      stream,
      ownsConnection,
      bastionUuid: cluster.bastion_uuid,
      bastionAssetAddress: cluster.bastion_asset_address,
      bastionAssetName: cluster.bastion_asset_name
    })

    const dataChannel = `k8s:terminal:data:${terminalId}`
    const exitChannel = `k8s:terminal:exit:${terminalId}`

    if (forwardToRenderer) {
      stream.on('data', (...args: unknown[]) => {
        const data = args[0] as Buffer | string
        sendToRenderer(dataChannel, typeof data === 'string' ? data : data.toString())
      })
    }

    stream.on('close', () => {
      jumpserverK8sSessions.delete(terminalId)
      if (ownsConnection) {
        try {
          conn.end()
        } catch {
          /* ignore */
        }
      }
      if (forwardToRenderer) {
        sendToRenderer(exitChannel, {})
      }
    })

    logger.info('K8s shell ready', { event: 'k8s.connect.ready', terminalId, assetId })
    return { resolvedAssetId: assetId }
  } catch (err) {
    safeTeardown(conn, stream, ownsConnection)
    logger.error('Failed to connect K8s asset', {
      event: 'k8s.connect.error',
      terminalId,
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  }
}

/**
 * Tear down an existing K8s session.
 */
export function closeK8sSession(terminalId: string): void {
  const session = jumpserverK8sSessions.get(terminalId)
  if (!session) return

  const { conn, stream, ownsConnection } = session as { conn: Client; stream: ShellStream; ownsConnection?: boolean }
  try {
    if (stream && typeof stream.close === 'function') stream.close()
    else if (stream && typeof stream.end === 'function') stream.end()
  } catch {
    // ignore
  }
  if (ownsConnection) {
    try {
      conn.end()
    } catch {
      // ignore
    }
  }
  jumpserverK8sSessions.delete(terminalId)
  logger.debug('Closed K8s session', { event: 'k8s.close', terminalId })
}
