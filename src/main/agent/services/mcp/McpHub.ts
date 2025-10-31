import { setTimeout as setTimeoutPromise } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  CallToolResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
  ReadResourceResultSchema
} from '@modelcontextprotocol/sdk/types.js'
import {
  DEFAULT_MCP_TIMEOUT_SECONDS,
  McpResource,
  McpResourceResponse,
  McpResourceTemplate,
  McpServer,
  McpTool,
  McpToolCallResponse,
  MIN_MCP_TIMEOUT_SECONDS
} from '@shared/mcp'
import { secondsToMs } from '@utils/time'
import chokidar, { FSWatcher } from 'chokidar'
import deepEqual from 'fast-deep-equal'
import * as fs from 'fs/promises'
import ReconnectingEventSource from 'reconnecting-eventsource'
import { z } from 'zod'
// import { TelemetryService } from '../telemetry/TelemetryService'
// import { BrowserWindow } from 'electron'

import { DEFAULT_REQUEST_TIMEOUT_MS } from './constants'
import { BaseConfigSchema, McpSettingsSchema, ServerConfigSchema } from './schemas'
import { McpConnection, McpServerConfig, Transport } from './types'
export class McpHub {
  getMcpServersPath: () => Promise<string>
  getMcpSettingsFilePath: () => Promise<string>
  private clientVersion: string
  // private telemetryService: TelemetryService
  // private mainWindow?: BrowserWindow
  private postMessageToWebview?: (message: any) => Promise<void>

  private settingsWatcher?: FSWatcher
  private fileWatchers: Map<string, FSWatcher> = new Map()
  connections: McpConnection[] = []
  isConnecting: boolean = false

  // Store notifications for display in chat
  private pendingNotifications: Array<{
    serverName: string
    level: string
    message: string
    timestamp: number
  }> = []

  // Callback for sending notifications to active task
  private notificationCallback?: (serverName: string, level: string, message: string) => void

  constructor(
    getMcpServersPath: () => Promise<string>,
    getMcpSettingsFilePath: () => Promise<string>,
    clientVersion: string,
    postMessageToWebview?: (message: any) => Promise<void>
    // telemetryService: TelemetryService
  ) {
    this.getMcpServersPath = getMcpServersPath
    this.getMcpSettingsFilePath = getMcpSettingsFilePath
    this.clientVersion = clientVersion
    this.postMessageToWebview = postMessageToWebview
    // this.telemetryService = telemetryService
    this.watchMcpSettingsFile()
    this.initializeMcpServers()
  }

  // Set main window reference for IPC communication
  // setMainWindow(mainWindow: BrowserWindow) {
  //   this.mainWindow = mainWindow
  // }

  getActiveServers(): McpServer[] {
    // Only return enabled servers
    return this.connections.filter((conn) => !conn.server.disabled).map((conn) => conn.server)
  }

  getAllServers(): McpServer[] {
    return this.connections.map((conn) => conn.server)
  }

  private async readAndValidateMcpSettingsFile(): Promise<z.infer<typeof McpSettingsSchema> | undefined> {
    try {
      const settingsPath = await this.getMcpSettingsFilePath()
      const content = await fs.readFile(settingsPath, 'utf-8')

      let config: any

      // Parse JSON file content
      try {
        config = JSON.parse(content)
      } catch (_error) {
        if (this.postMessageToWebview) {
          await this.postMessageToWebview({
            type: 'notification',
            notification: {
              type: 'error',
              title: 'MCP Settings Error',
              description: 'Invalid MCP settings format. Please ensure your settings follow the correct JSON format.'
            }
          })
        }
        return undefined
      }

      // Validate against schema
      const result = McpSettingsSchema.safeParse(config)
      if (!result.success) {
        if (this.postMessageToWebview) {
          await this.postMessageToWebview({
            type: 'notification',
            notification: {
              type: 'error',
              title: 'MCP Settings Error',
              description: 'Invalid MCP settings schema.'
            }
          })
        }
        return undefined
      }

      return result.data
    } catch (error) {
      console.error('Failed to read MCP settings:', error)
      return undefined
    }
  }

  private skipNextFileWatcherChange: boolean = false

  private async watchMcpSettingsFile(): Promise<void> {
    const settingsPath = await this.getMcpSettingsFilePath()

    this.settingsWatcher = chokidar.watch(settingsPath, {
      persistent: true, // Keep the process running as long as files are being watched
      ignoreInitial: true, // Don't fire 'add' events when discovering the file initially
      awaitWriteFinish: {
        // Wait for writes to finish before emitting events (handles chunked writes)
        stabilityThreshold: 100, // Wait 100ms for file size to remain constant
        pollInterval: 100 // Check file size every 100ms while waiting for stability
      },
      atomic: true // Handle atomic writes where editors write to a temp file then rename (prevents duplicate events)
    })

    this.settingsWatcher.on('change', async () => {
      // Notify renderer process about config file content change
      try {
        const content = await fs.readFile(settingsPath, 'utf-8')
        if (this.postMessageToWebview) {
          await this.postMessageToWebview({
            type: 'mcpConfigFileChanged',
            content
          })
        }
      } catch (error) {
        console.error('Failed to read MCP config file for change notification:', error)
      }

      // Skip if this was an internal toggle operation
      if (this.skipNextFileWatcherChange) {
        this.skipNextFileWatcherChange = false
        return
      }

      const settings = await this.readAndValidateMcpSettingsFile()
      console.log('File changed:', settings)

      if (settings) {
        try {
          await this.updateServerConnections(settings.mcpServers)
        } catch (error) {
          console.error('Failed to process MCP settings change:', error)
        }
      }
    })

    this.settingsWatcher.on('error', (error) => {
      console.error('Error watching MCP settings file:', error)
    })
  }

  private async initializeMcpServers(): Promise<void> {
    const settings = await this.readAndValidateMcpSettingsFile()
    if (settings) {
      await this.updateServerConnections(settings.mcpServers)
    }
  }

  private findConnection(name: string, _source: 'rpc' | 'internal'): McpConnection | undefined {
    return this.connections.find((conn) => conn.server.name === name)
  }

  private async connectToServer(name: string, config: z.infer<typeof ServerConfigSchema>, source: 'rpc' | 'internal'): Promise<void> {
    // Remove existing connection if it exists (should never happen, the connection should be deleted beforehand)
    this.connections = this.connections.filter((conn) => conn.server.name !== name)

    // Get autoApprove configuration from settings
    let autoApprove: string[] = []
    try {
      const settingsPath = await this.getMcpSettingsFilePath()
      const content = await fs.readFile(settingsPath, 'utf-8')
      const settings = McpSettingsSchema.parse(JSON.parse(content))
      autoApprove = settings.mcpServers[name]?.autoApprove || []
    } catch (error) {
      // Ignore errors reading autoApprove settings
    }

    if (config.disabled) {
      //console.log(`[MCP Debug] Creating disabled connection object for server "${name}"`)
      // Create a connection object for disabled server so it appears in UI
      const disabledConnection: McpConnection = {
        server: {
          name,
          config: JSON.stringify(config),
          status: 'disconnected',
          disabled: true,
          type: config.type,
          autoApprove
        },
        client: null as unknown as Client,
        transport: null as unknown as Transport
      }
      this.connections.push(disabledConnection)
      return
    }

    try {
      // Each MCP server requires its own transport connection and has unique capabilities, configurations, and error handling. Having separate clients also allows proper scoping of resources/tools and independent server management like reconnection.
      const client = new Client(
        {
          name: 'Chaterm',
          version: this.clientVersion
        },
        {
          capabilities: {}
        }
      )

      let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport

      switch (config.type) {
        case 'stdio': {
          transport = new StdioClientTransport({
            command: config.command,
            args: config.args,
            cwd: config.cwd,
            env: {
              // ...(config.env ? await injectEnv(config.env) : {}), // Commented out as injectEnv is not found
              ...getDefaultEnvironment(),
              ...(config.env || {}) // Use config.env directly or an empty object
            },
            stderr: 'pipe'
          })

          transport.onerror = async (error) => {
            console.error(`Transport error for "${name}":`, error)
            const connection = this.findConnection(name, source)
            if (connection) {
              connection.server.status = 'disconnected'
              this.appendErrorMessage(connection, error instanceof Error ? error.message : `${error}`)
            }
            await this.notifyWebviewOfServerChanges()
          }

          transport.onclose = async () => {
            const connection = this.findConnection(name, source)
            if (connection) {
              connection.server.status = 'disconnected'
            }
            await this.notifyWebviewOfServerChanges()
          }

          await transport.start()
          const stderrStream = transport.stderr
          if (stderrStream) {
            stderrStream.on('data', async (data: Buffer) => {
              const output = data.toString()
              const isInfoLog = !/\berror\b/i.test(output)

              if (isInfoLog) {
                console.log(`Server "${name}" info:`, output)
              } else {
                console.error(`Server "${name}" stderr:`, output)
                const connection = this.findConnection(name, source)
                if (connection) {
                  this.appendErrorMessage(connection, output)
                  if (connection.server.status === 'disconnected') {
                    await this.notifyWebviewOfServerChanges()
                  }
                }
              }
            })
          } else {
            console.error(`No stderr stream for ${name}`)
          }
          transport.start = async () => {}
          break
        }
        case 'http': {
          // Try StreamableHTTP first, fallback to SSE if connection fails
          transport = new StreamableHTTPClientTransport(new URL(config.url), {
            requestInit: {
              headers: config.headers
            }
          })

          transport.onerror = async (error) => {
            console.error(`Transport error for "${name}":`, error)
            const connection = this.findConnection(name, source)
            if (connection) {
              connection.server.status = 'disconnected'
              this.appendErrorMessage(connection, error instanceof Error ? error.message : `${error}`)
            }
            await this.notifyWebviewOfServerChanges()
          }
          break
        }
        default:
          throw new Error(`Unknown transport type: ${(config as any).type}`)
      }

      const connection: McpConnection = {
        server: {
          name,
          config: JSON.stringify(config),
          status: 'connecting',
          disabled: config.disabled,
          type: config.type,
          autoApprove
        },
        client,
        transport
      }
      this.connections.push(connection)

      await client.connect(transport)

      connection.server.status = 'connected'
      connection.server.error = ''

      // Try to set notification handler using the client's method
      try {
        // Import the notification schema from MCP SDK
        const { z } = await import('zod')

        // Define the notification schema for notifications/message
        const NotificationMessageSchema = z.object({
          method: z.literal('notifications/message'),
          params: z
            .object({
              level: z.enum(['debug', 'info', 'warning', 'error']).optional(),
              logger: z.string().optional(),
              data: z.string().optional(),
              message: z.string().optional()
            })
            .optional()
        })

        // Set the notification handler
        connection.client.setNotificationHandler(NotificationMessageSchema as any, async (notification: any) => {
          //console.log(`[MCP Notification] ${name}:`, JSON.stringify(notification, null, 2))

          const params = notification.params || {}
          const level = params.level || 'info'
          const data = params.data || params.message || ''
          const logger = params.logger || ''

          //console.log(`[MCP Message Notification] ${name}: level=${level}, data=${data}, logger=${logger}`)

          // Format the message
          const message = logger ? `[${logger}] ${data}` : data

          // Send notification directly to active task if callback is set
          if (this.notificationCallback) {
            //console.log(`[MCP Debug] Sending notification to active task: ${message}`)
            this.notificationCallback(name, level, message)
          } else {
            // Fallback: store for later retrieval
            //console.log(`[MCP Debug] No active task, storing notification: ${message}`)
            this.pendingNotifications.push({
              serverName: name,
              level,
              message,
              timestamp: Date.now()
            })
          }
        })
        //console.log(`[MCP Debug] Successfully set notifications/message handler for ${name}`)

        // Also set a fallback handler for any other notification types
        connection.client.fallbackNotificationHandler = async (notification: any) => {
          //console.log(`[MCP Fallback Notification] ${name}:`, JSON.stringify(notification, null, 2))

          // Send notification to renderer process
          if (this.postMessageToWebview) {
            await this.postMessageToWebview({
              type: 'notification',
              notification: {
                type: 'info',
                title: `MCP ${name}`,
                description: `${notification.method || 'unknown'} - ${JSON.stringify(notification.params || {})}`
              }
            })
          }
        }
        //console.log(`[MCP Debug] Successfully set fallback notification handler for ${name}`)
      } catch (error) {
        console.error(`[MCP Debug] Error setting notification handlers for ${name}:`, error)
      }

      // Initial fetch of tools and resources
      connection.server.tools = await this.fetchToolsList(name)
      connection.server.resources = await this.fetchResourcesList(name)
      connection.server.resourceTemplates = await this.fetchResourceTemplatesList(name)
    } catch (error) {
      // Update status with error
      const connection = this.findConnection(name, source)
      if (connection) {
        connection.server.status = 'disconnected'
        this.appendErrorMessage(connection, error instanceof Error ? error.message : String(error))
      }
      throw error
    }
  }

  private appendErrorMessage(connection: McpConnection, error: string) {
    const newError = connection.server.error ? `${connection.server.error}\n${error}` : error
    connection.server.error = newError //.slice(0, 800)
  }

  private async fetchToolsList(serverName: string): Promise<McpTool[]> {
    try {
      const connection = this.connections.find((conn) => conn.server.name === serverName)

      if (!connection) {
        throw new Error(`No connection found for server: ${serverName}`)
      }

      // Disabled servers don't have clients, so return empty tools list
      if (connection.server.disabled || !connection.client) {
        return []
      }

      const response = await connection.client.request({ method: 'tools/list' }, ListToolsResultSchema, {
        timeout: DEFAULT_REQUEST_TIMEOUT_MS
      })

      // Get autoApprove settings
      const settingsPath = await this.getMcpSettingsFilePath()
      const content = await fs.readFile(settingsPath, 'utf-8')
      const config = JSON.parse(content)
      const autoApproveConfig = config.mcpServers[serverName]?.autoApprove || []

      // Mark tools as always allowed based on settings
      const tools = (response?.tools || []).map((tool) => ({
        ...tool,
        autoApprove: autoApproveConfig.includes(tool.name)
      }))

      return tools
    } catch (error) {
      console.error(`Failed to fetch tools for ${serverName}:`, error)
      return []
    }
  }

  private async fetchResourcesList(serverName: string): Promise<McpResource[]> {
    try {
      const connection = this.connections.find((conn) => conn.server.name === serverName)

      // Disabled servers don't have clients, so return empty resources list
      if (!connection || connection.server.disabled || !connection.client) {
        return []
      }

      const response = await connection.client.request({ method: 'resources/list' }, ListResourcesResultSchema, {
        timeout: DEFAULT_REQUEST_TIMEOUT_MS
      })
      return response?.resources || []
    } catch (_error) {
      // console.error(`Failed to fetch resources for ${serverName}:`, error)
      return []
    }
  }

  private async fetchResourceTemplatesList(serverName: string): Promise<McpResourceTemplate[]> {
    try {
      const connection = this.connections.find((conn) => conn.server.name === serverName)

      // Disabled servers don't have clients, so return empty resource templates list
      if (!connection || connection.server.disabled || !connection.client) {
        return []
      }

      const response = await connection.client.request({ method: 'resources/templates/list' }, ListResourceTemplatesResultSchema, {
        timeout: DEFAULT_REQUEST_TIMEOUT_MS
      })

      return response?.resourceTemplates || []
    } catch (_error) {
      // console.error(`Failed to fetch resource templates for ${serverName}:`, error)
      return []
    }
  }

  async deleteConnection(name: string): Promise<void> {
    const connection = this.connections.find((conn) => conn.server.name === name)
    if (connection) {
      try {
        // Only close transport and client if they exist (disabled servers don't have them)
        if (connection.transport) {
          await connection.transport.close()
        }
        if (connection.client) {
          await connection.client.close()
        }
      } catch (error) {
        console.error(`Failed to close transport for ${name}:`, error)
      }
      this.connections = this.connections.filter((conn) => conn.server.name !== name)
    }
  }

  async updateServerConnectionsRPC(newServers: Record<string, McpServerConfig>): Promise<void> {
    this.isConnecting = true
    this.removeAllFileWatchers()
    const currentNames = new Set(this.connections.map((conn) => conn.server.name))
    const newNames = new Set(Object.keys(newServers))

    // Delete removed servers
    for (const name of currentNames) {
      if (!newNames.has(name)) {
        await this.deleteConnection(name)
        console.log(`Deleted MCP server: ${name}`)
      }
    }

    // Update or add servers
    for (const [name, config] of Object.entries(newServers)) {
      const currentConnection = this.connections.find((conn) => conn.server.name === name)

      if (!currentConnection) {
        // New server
        try {
          if (config.type === 'stdio') {
            this.setupFileWatcher(name, config)
          }
          await this.connectToServer(name, config, 'rpc')
        } catch (error) {
          console.error(`Failed to connect to new MCP server ${name}:`, error)
        }
      } else if (!deepEqual(JSON.parse(currentConnection.server.config), config)) {
        // Existing server with changed config
        try {
          if (config.type === 'stdio') {
            this.setupFileWatcher(name, config)
          }
          await this.deleteConnection(name)
          await this.connectToServer(name, config, 'rpc')
          console.log(`Reconnected MCP server with updated config: ${name}`)
        } catch (error) {
          console.error(`Failed to reconnect MCP server ${name}:`, error)
        }
      }
      // If server exists with same config, do nothing
    }

    this.isConnecting = false
  }

  async updateServerConnections(newServers: Record<string, McpServerConfig>): Promise<void> {
    this.isConnecting = true
    this.removeAllFileWatchers()
    const currentNames = new Set(this.connections.map((conn) => conn.server.name))
    const newNames = new Set(Object.keys(newServers))

    // Delete removed servers
    for (const name of currentNames) {
      if (!newNames.has(name)) {
        await this.deleteConnection(name)
        console.log(`Deleted MCP server: ${name}`)
      }
    }

    // Update or add servers
    for (const [name, config] of Object.entries(newServers)) {
      const currentConnection = this.connections.find((conn) => conn.server.name === name)

      if (!currentConnection) {
        // New server
        try {
          if (config.type === 'stdio') {
            this.setupFileWatcher(name, config)
          }
          await this.connectToServer(name, config, 'internal')
        } catch (error) {
          console.error(`Failed to connect to new MCP server ${name}:`, error)
        }
      } else if (!deepEqual(JSON.parse(currentConnection.server.config), config)) {
        // Existing server with changed config
        try {
          if (config.type === 'stdio') {
            this.setupFileWatcher(name, config)
          }
          await this.deleteConnection(name)
          await this.connectToServer(name, config, 'internal')
          console.log(`Reconnected MCP server with updated config: ${name}`)
        } catch (error) {
          console.error(`Failed to reconnect MCP server ${name}:`, error)
        }
      }
      // If server exists with same config, do nothing
    }
    await this.notifyWebviewOfServerChanges()
    this.isConnecting = false
  }

  private setupFileWatcher(name: string, config: Extract<McpServerConfig, { type: 'stdio' }>) {
    const filePath = config.args?.find((arg: string) => arg.includes('build/index.js'))
    if (filePath) {
      // we use chokidar instead of onDidSaveTextDocument because it doesn't require the file to be open in the editor. The settings config is better suited for onDidSave since that will be manually updated by the user or Chaterm (and we want to detect save events, not every file change)
      const watcher = chokidar.watch(filePath, {
        // persistent: true,
        // ignoreInitial: true,
        // awaitWriteFinish: true, // This helps with atomic writes
      })

      watcher.on('change', () => {
        console.log(`Detected change in ${filePath}. Restarting server ${name}...`)
        this.restartConnection(name)
      })

      this.fileWatchers.set(name, watcher)
    }
  }

  private removeAllFileWatchers() {
    this.fileWatchers.forEach((watcher) => watcher.close())
    this.fileWatchers.clear()
  }

  async restartConnectionRPC(serverName: string): Promise<McpServer[]> {
    this.isConnecting = true

    // Get existing connection and update its status
    const connection = this.connections.find((conn) => conn.server.name === serverName)
    const inMemoryConfig = connection?.server.config
    if (inMemoryConfig) {
      connection.server.status = 'connecting'
      connection.server.error = ''
      await setTimeoutPromise(500) // artificial delay to show user that server is restarting
      try {
        await this.deleteConnection(serverName)
        // Try to connect again using existing config
        await this.connectToServer(serverName, JSON.parse(inMemoryConfig), 'rpc')
      } catch (error) {
        console.error(`Failed to restart connection for ${serverName}:`, error)
      }
    }

    this.isConnecting = false

    const config = await this.readAndValidateMcpSettingsFile()
    if (!config) {
      throw new Error('Failed to read or validate MCP settings')
    }

    const serverOrder = Object.keys(config.mcpServers || {})
    return this.getSortedMcpServers(serverOrder)
  }

  async restartConnection(serverName: string): Promise<void> {
    this.isConnecting = true

    // Get existing connection and update its status
    const connection = this.connections.find((conn) => conn.server.name === serverName)
    const config = connection?.server.config
    if (config) {
      if (this.postMessageToWebview) {
        await this.postMessageToWebview({
          type: 'notification',
          notification: {
            type: 'info',
            title: 'MCP Server',
            description: `Restarting ${serverName} MCP server...`
          }
        })
      }
      connection.server.status = 'connecting'
      connection.server.error = ''
      await this.notifyWebviewOfServerChanges()
      await setTimeoutPromise(500) // artificial delay to show user that server is restarting
      try {
        await this.deleteConnection(serverName)
        // Try to connect again using existing config
        await this.connectToServer(serverName, JSON.parse(config), 'internal')
        if (this.postMessageToWebview) {
          await this.postMessageToWebview({
            type: 'notification',
            notification: {
              type: 'success',
              title: 'MCP Server',
              description: `${serverName} MCP server connected`
            }
          })
        }
      } catch (error) {
        console.error(`Failed to restart connection for ${serverName}:`, error)
        if (this.postMessageToWebview) {
          await this.postMessageToWebview({
            type: 'notification',
            notification: {
              type: 'error',
              title: 'MCP Server',
              description: `Failed to connect to ${serverName} MCP server`
            }
          })
        }
      }
    }

    await this.notifyWebviewOfServerChanges()
    this.isConnecting = false
  }

  /**
   * Gets sorted MCP servers based on the order defined in settings
   * @param serverOrder Array of server names in the order they appear in settings
   * @returns Array of McpServer objects sorted according to settings order
   */
  getSortedMcpServers(serverOrder: string[]): McpServer[] {
    return [...this.connections]
      .sort((a, b) => {
        const indexA = serverOrder.indexOf(a.server.name)
        const indexB = serverOrder.indexOf(b.server.name)
        return indexA - indexB
      })
      .map((connection) => connection.server)
  }

  private async notifyWebviewOfServerChanges(): Promise<void> {
    // servers should always be sorted in the order they are defined in the settings file
    const settingsPath = await this.getMcpSettingsFilePath()
    const content = await fs.readFile(settingsPath, 'utf-8')
    const config = JSON.parse(content)
    const serverOrder = Object.keys(config.mcpServers || {})

    // Get sorted servers
    const sortedServers = this.getSortedMcpServers(serverOrder)

    // Send update using the unified postMessageToWebview callback
    // The main/index.ts messageSender will route this to the appropriate IPC channels
    if (this.postMessageToWebview) {
      await this.postMessageToWebview({
        type: 'mcpServersUpdate',
        mcpServers: sortedServers
      })
    }
  }

  async sendLatestMcpServers() {
    await this.notifyWebviewOfServerChanges()
  }

  async getLatestMcpServersRPC(): Promise<McpServer[]> {
    const settings = await this.readAndValidateMcpSettingsFile()
    if (!settings) {
      // Return empty array if settings can't be read or validated
      return []
    }

    const serverOrder = Object.keys(settings.mcpServers || {})
    return this.getSortedMcpServers(serverOrder)
  }

  // Using server

  // Public methods for server management

  public async toggleServerDisabledRPC(serverName: string, disabled: boolean): Promise<McpServer[]> {
    try {
      const config = await this.readAndValidateMcpSettingsFile()
      if (!config) {
        throw new Error('Failed to read or validate MCP settings')
      }

      if (config.mcpServers[serverName]) {
        config.mcpServers[serverName].disabled = disabled

        const settingsPath = await this.getMcpSettingsFilePath()
        await fs.writeFile(settingsPath, JSON.stringify(config, null, 2))

        const connection = this.connections.find((conn) => conn.server.name === serverName)
        if (connection) {
          connection.server.disabled = disabled
        }

        const serverOrder = Object.keys(config.mcpServers || {})
        return this.getSortedMcpServers(serverOrder)
      }
      console.error(`Server "${serverName}" not found in MCP configuration`)
      throw new Error(`Server "${serverName}" not found in MCP configuration`)
    } catch (error) {
      console.error('Failed to update server disabled state:', error)
      if (error instanceof Error) {
        console.error('Error details:', error.message, error.stack)
      }
      if (this.postMessageToWebview) {
        await this.postMessageToWebview({
          type: 'notification',
          notification: {
            type: 'error',
            title: 'MCP Server Error',
            description: `Failed to update server state: ${error instanceof Error ? error.message : String(error)}`
          }
        })
      }
      throw error
    }
  }

  /**
   * Toggle server disabled state with optimized updates (only target server, no full reconciliation)
   * @param serverName The name of the server to toggle
   * @param disabled Whether to disable or enable the server
   */
  public async toggleServerDisabled(serverName: string, disabled: boolean): Promise<void> {
    const connection = this.connections.find((conn) => conn.server.name === serverName)

    if (!connection) {
      throw new Error(`Server "${serverName}" not found`)
    }

    const originalDisabled = connection.server.disabled

    try {
      connection.server.disabled = disabled

      this.skipNextFileWatcherChange = true

      await this.updateConfigFileDisabledState(serverName, disabled)

      if (disabled) {
        await this.disconnectServerOnly(serverName)
      } else {
        await this.connectServerOnly(serverName)
      }

      await this.notifyWebviewOfSingleServerChange(serverName)
    } catch (error) {
      // Rollback in-memory state on error
      connection.server.disabled = originalDisabled
      await this.notifyWebviewOfSingleServerChange(serverName)
      console.error(`Failed to toggle server ${serverName}:`, error)
      throw error
    }
  }

  /**
   * Helper method to update only the disabled flag in the config file
   * @param serverName The name of the server to update
   * @param disabled The new disabled state
   */
  private async updateConfigFileDisabledState(serverName: string, disabled: boolean): Promise<void> {
    const settingsPath = await this.getMcpSettingsFilePath()
    const content = await fs.readFile(settingsPath, 'utf-8')
    const config = JSON.parse(content)

    if (config.mcpServers && config.mcpServers[serverName]) {
      config.mcpServers[serverName].disabled = disabled
      await fs.writeFile(settingsPath, JSON.stringify(config, null, 2))
    } else {
      throw new Error(`Server "${serverName}" not found in configuration`)
    }
  }

  /**
   * Helper method to disconnect a single server without affecting others
   * @param serverName The name of the server to disconnect
   */
  private async disconnectServerOnly(serverName: string): Promise<void> {
    const connection = this.connections.find((conn) => conn.server.name === serverName)

    if (connection && connection.transport && connection.client) {
      try {
        await connection.transport.close()
        await connection.client.close()
        connection.server.status = 'disconnected'
        connection.server.tools = []
        connection.server.resources = []
        connection.server.resourceTemplates = []
      } catch (error) {
        console.error(`Failed to disconnect ${serverName}:`, error)
        throw error
      }
    }
  }

  /**
   * Helper method to connect a single server without full reconciliation
   * @param serverName The name of the server to connect
   */
  private async connectServerOnly(serverName: string): Promise<void> {
    const connection = this.connections.find((conn) => conn.server.name === serverName)

    if (!connection) {
      throw new Error(`Connection not found for ${serverName}`)
    }

    const oldConfig = JSON.parse(connection.server.config)

    const rawConfig = {
      ...oldConfig,
      disabled: connection.server.disabled
    }

    // Remove old connection
    await this.deleteConnection(serverName)

    // Create new connection
    await this.connectToServer(serverName, rawConfig, 'internal')
  }

  /**
   * Helper method to send granular updates for a single server
   * @param serverName The name of the server to send updates for
   */
  private async notifyWebviewOfSingleServerChange(serverName: string): Promise<void> {
    const connection = this.connections.find((conn) => conn.server.name === serverName)

    if (connection && this.postMessageToWebview) {
      await this.postMessageToWebview({
        type: 'mcpServerUpdate',
        mcpServer: connection.server
      })
    }
  }

  async readResource(serverName: string, uri: string): Promise<McpResourceResponse> {
    const connection = this.connections.find((conn) => conn.server.name === serverName)
    if (!connection) {
      throw new Error(`No connection found for server: ${serverName}`)
    }
    if (connection.server.disabled) {
      throw new Error(`Server "${serverName}" is disabled`)
    }

    return await connection.client.request(
      {
        method: 'resources/read',
        params: {
          uri
        }
      },
      ReadResourceResultSchema
    )
  }

  async callTool(
    serverName: string,
    toolName: string,
    toolArguments: Record<string, unknown> | undefined,
    _ulid: string
  ): Promise<McpToolCallResponse> {
    const connection = this.connections.find((conn) => conn.server.name === serverName)
    if (!connection) {
      throw new Error(`No connection found for server: ${serverName}. Please make sure to use MCP servers available under 'Connected MCP Servers'.`)
    }

    if (connection.server.disabled) {
      throw new Error(`Server "${serverName}" is disabled and cannot be used`)
    }

    let timeout = secondsToMs(DEFAULT_MCP_TIMEOUT_SECONDS) // sdk expects ms

    try {
      const config = JSON.parse(connection.server.config)
      const parsedConfig = ServerConfigSchema.parse(config)
      timeout = secondsToMs(parsedConfig.timeout)
    } catch (error) {
      console.error(`Failed to parse timeout configuration for server ${serverName}: ${error}`)
    }

    // this.telemetryService.captureMcpToolCall(ulid, serverName, toolName, 'started', undefined, toolArguments ? Object.keys(toolArguments) : undefined)

    const result = await connection.client.request(
      {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArguments
        }
      },
      CallToolResultSchema,
      {
        timeout
      }
    )

    // this.telemetryService.captureMcpToolCall(
    //   ulid,
    //   serverName,
    //   toolName,
    //   'success',
    //   undefined,
    //   toolArguments ? Object.keys(toolArguments) : undefined
    // )

    return {
      ...result,
      content: (result.content ?? []) as McpToolCallResponse['content']
    }
  }

  /**
   * RPC variant of toggleToolAutoApprove that returns the updated servers instead of notifying the webview
   * @param serverName The name of the MCP server
   * @param toolNames Array of tool names to toggle auto-approve for
   * @param shouldAllow Whether to enable or disable auto-approve
   * @returns Array of updated MCP servers
   */
  async toggleToolAutoApproveRPC(serverName: string, toolNames: string[], shouldAllow: boolean): Promise<McpServer[]> {
    try {
      const settingsPath = await this.getMcpSettingsFilePath()
      const content = await fs.readFile(settingsPath, 'utf-8')
      const config = JSON.parse(content)

      // Initialize autoApprove if it doesn't exist
      if (!config.mcpServers[serverName].autoApprove) {
        config.mcpServers[serverName].autoApprove = []
      }

      const autoApprove = config.mcpServers[serverName].autoApprove
      for (const toolName of toolNames) {
        const toolIndex = autoApprove.indexOf(toolName)

        if (shouldAllow && toolIndex === -1) {
          // Add tool to autoApprove list
          autoApprove.push(toolName)
        } else if (!shouldAllow && toolIndex !== -1) {
          // Remove tool from autoApprove list
          autoApprove.splice(toolIndex, 1)
        }
      }

      await fs.writeFile(settingsPath, JSON.stringify(config, null, 2))

      // Update the tools list to reflect the change
      const connection = this.connections.find((conn) => conn.server.name === serverName)
      if (connection && connection.server.tools) {
        // Update the autoApprove property of each tool in the in-memory server object
        connection.server.tools = connection.server.tools.map((tool) => ({
          ...tool,
          autoApprove: autoApprove.includes(tool.name)
        }))
      }

      // Return sorted servers without notifying webview
      const serverOrder = Object.keys(config.mcpServers || {})
      return this.getSortedMcpServers(serverOrder)
    } catch (error) {
      console.error('Failed to update autoApprove settings:', error)
      throw error // Re-throw to ensure the error is properly handled
    }
  }

  async toggleToolAutoApprove(serverName: string, toolNames: string[], shouldAllow: boolean): Promise<void> {
    try {
      const settingsPath = await this.getMcpSettingsFilePath()
      const content = await fs.readFile(settingsPath, 'utf-8')
      const config = JSON.parse(content)

      // Initialize autoApprove if it doesn't exist
      if (!config.mcpServers[serverName].autoApprove) {
        config.mcpServers[serverName].autoApprove = []
      }

      const autoApprove = config.mcpServers[serverName].autoApprove
      for (const toolName of toolNames) {
        const toolIndex = autoApprove.indexOf(toolName)

        if (shouldAllow && toolIndex === -1) {
          // Add tool to autoApprove list
          autoApprove.push(toolName)
        } else if (!shouldAllow && toolIndex !== -1) {
          // Remove tool from autoApprove list
          autoApprove.splice(toolIndex, 1)
        }
      }

      await fs.writeFile(settingsPath, JSON.stringify(config, null, 2))

      // Update the tools list to reflect the change
      const connection = this.connections.find((conn) => conn.server.name === serverName)
      if (connection && connection.server.tools) {
        // Update the autoApprove property of each tool in the in-memory server object
        connection.server.tools = connection.server.tools.map((tool) => ({
          ...tool,
          autoApprove: autoApprove.includes(tool.name)
        }))
        await this.notifyWebviewOfServerChanges()
      }
    } catch (error) {
      console.error('Failed to update autoApprove settings:', error)
      if (this.postMessageToWebview) {
        await this.postMessageToWebview({
          type: 'notification',
          notification: {
            type: 'error',
            title: 'MCP Settings Error',
            description: 'Failed to update autoApprove settings'
          }
        })
      }
      throw error // Re-throw to ensure the error is properly handled
    }
  }

  public async addRemoteServer(serverName: string, serverUrl: string): Promise<McpServer[]> {
    try {
      const settings = await this.readAndValidateMcpSettingsFile()
      if (!settings) {
        throw new Error('Failed to read MCP settings')
      }

      if (settings.mcpServers[serverName]) {
        throw new Error(`An MCP server with the name "${serverName}" already exists`)
      }

      const urlValidation = z.string().url().safeParse(serverUrl)
      if (!urlValidation.success) {
        throw new Error(`Invalid server URL: ${serverUrl}. Please provide a valid URL.`)
      }

      const serverConfig = {
        url: serverUrl,
        disabled: false,
        autoApprove: []
      }

      const parsedConfig = ServerConfigSchema.parse(serverConfig)

      settings.mcpServers[serverName] = parsedConfig
      const settingsPath = await this.getMcpSettingsFilePath()

      // We don't write the zod-transformed version to the file.
      // The above parse() call adds the transportType field to the server config
      // It would be fine if this was written, but we don't want to clutter up the file with internal details

      // ToDo: We could benefit from input / output types reflecting the non-transformed / transformed versions
      await fs.writeFile(settingsPath, JSON.stringify({ mcpServers: { ...settings.mcpServers, [serverName]: serverConfig } }, null, 2))

      await this.updateServerConnectionsRPC(settings.mcpServers)

      const serverOrder = Object.keys(settings.mcpServers || {})
      return this.getSortedMcpServers(serverOrder)
    } catch (error) {
      console.error('Failed to add remote MCP server:', error)
      throw error
    }
  }

  /**
   * RPC variant of deleteServer that returns the updated server list directly
   * @param serverName The name of the server to delete
   * @returns Array of remaining MCP servers
   */
  public async deleteServerRPC(serverName: string): Promise<McpServer[]> {
    try {
      const settingsPath = await this.getMcpSettingsFilePath()
      const content = await fs.readFile(settingsPath, 'utf-8')
      const config = JSON.parse(content)
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        config.mcpServers = {}
      }

      if (config.mcpServers[serverName]) {
        delete config.mcpServers[serverName]
        const updatedConfig = {
          mcpServers: config.mcpServers
        }
        await fs.writeFile(settingsPath, JSON.stringify(updatedConfig, null, 2))
        await this.updateServerConnectionsRPC(config.mcpServers)

        // Get the servers in their correct order from settings
        const serverOrder = Object.keys(config.mcpServers || {})
        return this.getSortedMcpServers(serverOrder)
      } else {
        throw new Error(`${serverName} not found in MCP configuration`)
      }
    } catch (error) {
      console.error(`Failed to delete MCP server: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  public async updateServerTimeoutRPC(serverName: string, timeout: number): Promise<McpServer[]> {
    try {
      // Validate timeout against schema
      const setConfigResult = BaseConfigSchema.shape.timeout.safeParse(timeout)
      if (!setConfigResult.success) {
        throw new Error(`Invalid timeout value: ${timeout}. Must be at minimum ${MIN_MCP_TIMEOUT_SECONDS} seconds.`)
      }

      const settingsPath = await this.getMcpSettingsFilePath()
      const content = await fs.readFile(settingsPath, 'utf-8')
      const config = JSON.parse(content)

      if (!config.mcpServers?.[serverName]) {
        throw new Error(`Server "${serverName}" not found in settings`)
      }

      config.mcpServers[serverName] = {
        ...config.mcpServers[serverName],
        timeout
      }

      await fs.writeFile(settingsPath, JSON.stringify(config, null, 2))

      await this.updateServerConnectionsRPC(config.mcpServers)

      const serverOrder = Object.keys(config.mcpServers || {})
      return this.getSortedMcpServers(serverOrder)
    } catch (error) {
      console.error('Failed to update server timeout:', error)
      if (error instanceof Error) {
        console.error('Error details:', error.message, error.stack)
      }
      if (this.postMessageToWebview) {
        await this.postMessageToWebview({
          type: 'notification',
          notification: {
            type: 'error',
            title: 'MCP Settings Error',
            description: `Failed to update server timeout: ${error instanceof Error ? error.message : String(error)}`
          }
        })
      }
      throw error
    }
  }

  /**
   * Get and clear pending notifications
   * @returns Array of pending notifications
   */
  getPendingNotifications(): Array<{
    serverName: string
    level: string
    message: string
    timestamp: number
  }> {
    const notifications = [...this.pendingNotifications]
    this.pendingNotifications = []
    return notifications
  }

  /**
   * Set the notification callback for real-time notifications
   * @param callback Function to call when notifications arrive
   */
  setNotificationCallback(callback: (serverName: string, level: string, message: string) => void): void {
    this.notificationCallback = callback
    //console.log("[MCP Debug] Notification callback set")
  }

  /**
   * Clear the notification callback
   */
  clearNotificationCallback(): void {
    this.notificationCallback = undefined
    //console.log("[MCP Debug] Notification callback cleared")
  }

  async dispose(): Promise<void> {
    this.removeAllFileWatchers()
    for (const connection of this.connections) {
      try {
        await this.deleteConnection(connection.server.name)
      } catch (error) {
        console.error(`Failed to close connection for ${connection.server.name}:`, error)
      }
    }
    this.connections = []
    if (this.settingsWatcher) {
      await this.settingsWatcher.close()
    }
  }
}
