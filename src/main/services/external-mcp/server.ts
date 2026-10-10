import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { getGlobalState } from '../../agent/core/storage/state'
import { CommandSecurityManager } from '../../agent/core/security/CommandSecurityManager'
import { decideCommand } from '../../agent/core/security/command-policy'
import { connectAssetInfo, getCurrentChatermDatabase } from '../../storage/database'
import { RemoteExecutionService } from './execution-service'

const logger = createLogger('external-mcp')
const MCP_PATH = '/mcp'
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 30 * 60 * 1000
const MAX_LIST_LIMIT = 200
const PREFERRED_PORT = 9727
const MAX_PORT_ATTEMPTS = 100

type RuntimeState = { enabled: boolean; port: number | null }
type Session = { server: McpServer; transport: StreamableHTTPServerTransport }

function jsonRpcError(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message }, id: null }))
}

function trimOutput(value: string): string {
  return value.length > 16_000 ? `${value.slice(0, 16_000)}\n[output truncated]` : value
}

export class ExternalMcpServer {
  private httpServer?: ReturnType<typeof createServer>
  private state: RuntimeState = { enabled: false, port: null }
  private sessions = new Map<string, Session>()
  private readonly execution = new RemoteExecutionService()
  private readonly runtimePath: string
  private readonly security = new CommandSecurityManager()

  constructor(
    private readonly getTargets = async () => getCurrentChatermDatabase(),
    runtimePath?: string,
    private readonly preferredPort = PREFERRED_PORT
  ) {
    this.runtimePath = runtimePath || join(require('electron').app.getPath('userData'), 'setting', 'external-mcp.json')
  }

  async start(): Promise<void> {
    await this.security.initialize()
    let enabled = false
    try {
      const raw = JSON.parse(await readFile(this.runtimePath, 'utf8')) as Partial<RuntimeState>
      enabled = raw.enabled === true
      if (Number.isInteger(raw.port) && raw.port! > 0 && raw.port! <= 65535) this.state.port = raw.port!
    } catch {
      /* first launch */
    }
    this.state.enabled = enabled
    if (!enabled) return this.persist()
    await this.listen()
  }

  private async listen(): Promise<void> {
    if (this.httpServer) return
    const server = createServer((req, res) => void this.handle(req, res))
    const port = await this.bindPort(server)
    this.httpServer = server
    this.state.port = port
    await this.persist()
    logger.info('External MCP server started', { event: 'external-mcp.started', port })
  }

  // Port order: the fixed preferred port, then the last port that worked, then +1 from there.
  // Stable ports keep copied client configs valid across restarts.
  private async bindPort(server: ReturnType<typeof createServer>): Promise<number> {
    const saved = this.state.port
    const candidates = [this.preferredPort]
    if (saved && saved !== this.preferredPort) candidates.push(saved)
    let next = (saved && saved > this.preferredPort ? saved : this.preferredPort) + 1
    while (candidates.length < MAX_PORT_ATTEMPTS && next <= 65535) candidates.push(next++)
    for (const port of candidates) {
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(port, '127.0.0.1', () => {
            server.off('error', reject)
            resolve()
          })
        })
        return port
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      }
    }
    throw new Error('No free port for external MCP server')
  }

  private async persist(): Promise<void> {
    await mkdir(join(this.runtimePath, '..'), { recursive: true })
    await writeFile(this.runtimePath, JSON.stringify(this.state), { mode: 0o600 })
  }

  // No credentials: the server is loopback-only, and the Origin check blocks browser pages (CSRF / DNS rebinding).
  private allowed(req: IncomingMessage): boolean {
    const origin = req.headers.origin
    if (origin && origin !== 'http://localhost' && origin !== 'http://127.0.0.1') return false
    return this.state.enabled === true
  }

  private async createSession(): Promise<Session> {
    const server = new McpServer(
      { name: 'chaterm', version: '0.12.5' },
      { capabilities: { tools: {} }, instructions: 'Use chaterm_list_targets, then chaterm_exec. Targets are managed by Chaterm.' }
    )
    server.registerTool(
      'chaterm_list_targets',
      {
        title: 'List Chaterm SSH targets',
        description: 'List servers managed by Chaterm. Credentials are never returned.',
        inputSchema: {
          search: z.string().optional().default(''),
          limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional().default(50),
          offset: z.number().int().min(0).optional().default(0)
        }
      },
      async ({ search, limit, offset }) => {
        const db = await this.getTargets()
        const targets = db.listMcpTargets(search, limit, offset)
        return { content: [{ type: 'text', text: JSON.stringify({ targets }) }], structuredContent: { targets } }
      }
    )
    server.registerTool(
      'chaterm_exec',
      {
        title: 'Execute a command through Chaterm',
        description: 'Execute a non-interactive command on a Chaterm-managed target. Set requires_approval=true for changes or risky operations.',
        inputSchema: {
          target_id: z.string().min(1),
          command: z.string().min(1),
          requires_approval: z.boolean().default(false),
          timeout_ms: z.number().int().min(1000).max(MAX_TIMEOUT_MS).optional().default(DEFAULT_TIMEOUT_MS)
        }
      },
      async ({ target_id, command, requires_approval, timeout_ms }) => {
        const db = await this.getTargets()
        const target = db.getMcpTarget(target_id)
        if (!target) return this.toolError('invalid_target', 'Target is not managed by Chaterm')
        const settings = await this.loadAutoApprovalSettings()
        await this.security.reloadConfig()
        const decision = decideCommand(this.security.validateCommandSecurity(command), settings, requires_approval)
        if (decision.action === 'block') return this.toolError('command_blocked', decision.reason)
        if (decision.action === 'ask') {
          let elicitation
          try {
            elicitation = await server.server.elicitInput({
              mode: 'form',
              message: `Approve command on ${target.name}: ${command}\n\nReason: ${decision.reason}`,
              requestedSchema: { type: 'object', properties: { approve: { type: 'boolean', title: 'Approve command' } }, required: ['approve'] }
            })
          } catch {
            return this.toolError('approval_unavailable', 'This MCP client does not support approval prompts')
          }
          if (elicitation.action !== 'accept' || elicitation.content?.approve !== true)
            return this.toolError('approval_denied', 'User denied command execution')
        }
        const info = await connectAssetInfo(target_id)
        if (!info) return this.toolError('invalid_target', 'Target credentials are unavailable')
        const abort = new AbortController()
        try {
          const result = await this.execution.execute(
            target_id,
            {
              id: target_id,
              assetUuid: target_id,
              host: info.host || target.host,
              asset_ip: info.asset_ip || info.host || target.host,
              targetIp: target.host,
              port: target.port,
              username: info.username,
              password: info.password,
              privateKey: info.privateKey,
              passphrase: info.passphrase,
              sshType: info.sshType || target.connection_type,
              needProxy: !!info.needProxy,
              proxyName: info.proxyName,
              proxyConfig: info.proxyConfig,
              jumpHostUuid: info.jumpHostUuid
            },
            command,
            timeout_ms,
            abort.signal
          )
          const response = { ...result, stdout: trimOutput(result.stdout), stderr: trimOutput(result.stderr) }
          return { isError: result.status !== 'executed', content: [{ type: 'text', text: JSON.stringify(response) }], structuredContent: response }
        } catch (error) {
          return this.toolError('execution_failed', error instanceof Error ? error.message : 'Remote execution failed')
        }
      }
    )
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomBytes(18).toString('base64url') })
    await server.connect(transport)
    return { server, transport }
  }

  private toolError(code: string, message: string) {
    return { isError: true, content: [{ type: 'text' as const, text: `${code}: ${message}` }] }
  }

  private async loadAutoApprovalSettings() {
    const current = await getGlobalState('autoApprovalSettings').catch(() => undefined)
    return {
      version: current?.version || 3,
      enabled: current?.enabled === true,
      actions: {
        readFiles: true,
        editFiles: false,
        executeSafeCommands: current?.actions?.executeSafeCommands ?? true,
        executeAllCommands: current?.actions?.executeAllCommands ?? false,
        autoExecuteReadOnlyCommands: current?.actions?.autoExecuteReadOnlyCommands ?? true
      },
      enableNotifications: current?.enableNotifications !== false,
      favorites: current?.favorites || []
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.url !== MCP_PATH || !this.allowed(req)) return jsonRpcError(res, 403, 'Forbidden')
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    let session = sessionId ? this.sessions.get(sessionId) : undefined
    if (!session && req.method === 'POST') {
      session = await this.createSession()
      await session.transport.handleRequest(req, res)
      if (session.transport.sessionId) this.sessions.set(session.transport.sessionId, session)
      return
    }
    if (!session) return jsonRpcError(res, 404, 'MCP session not found')
    if (req.method === 'DELETE') {
      await session.transport.close()
      this.sessions.delete(sessionId!)
      res.writeHead(204)
      res.end()
      return
    }
    await session.transport.handleRequest(req, res)
  }

  async setEnabled(enabled: boolean) {
    this.state.enabled = enabled
    if (enabled) {
      this.execution.reset()
      await this.listen()
    } else if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()))
      this.httpServer = undefined
      await this.execution.dispose()
      for (const s of this.sessions.values()) await s.transport.close()
      this.sessions.clear()
    }
    await this.persist()
    return this.status()
  }

  status() {
    return { enabled: this.state.enabled, endpoint: this.httpServer && this.state.port ? `http://127.0.0.1:${this.state.port}${MCP_PATH}` : null }
  }
  async dispose() {
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()))
      this.httpServer = undefined
    }
    await this.execution.dispose()
    for (const session of this.sessions.values()) await session.transport.close()
    this.sessions.clear()
  }
}
