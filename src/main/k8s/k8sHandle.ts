import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { K8sManager, K8sProxyConfig } from '../services/k8s'
import { ChatermDatabaseService } from '../storage/db/chaterm.service'
import { registerK8sAgentHandlers } from '../agent/integrations/k8s/ipc-handlers'
const logger = createLogger('k8s')

/**
 * K8S Terminal Session
 */
interface K8sTerminalSession {
  id: string
  clusterId: string
  pty: pty.IPty
  isAlive: boolean
  namespace: string
  kubeconfigPath?: string
}

/**
 * K8S Terminal configuration
 */
interface K8sTerminalConfig {
  id: string
  clusterId: string
  namespace?: string
  kubeconfigPath?: string
  kubeconfigContent?: string
  contextName?: string
  cols?: number
  rows?: number
}

// Map to store active terminal sessions
const terminalSessions: Map<string, K8sTerminalSession> = new Map()

/**
 * Send data to renderer process
 */
const sendToRenderer = (channel: string, data: unknown) => {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach((window) => {
    window.webContents.send(channel, data)
  })
}

/**
 * Get default shell for kubectl
 */
const getDefaultShell = (): string => {
  const platform = os.platform()
  switch (platform) {
    case 'win32':
      return process.env.SHELL || 'powershell.exe'
    case 'darwin':
      return process.env.SHELL || '/bin/zsh'
    case 'linux':
    default:
      return process.env.SHELL || '/bin/bash'
  }
}

/**
 * Create a K8S terminal session
 */
const createK8sTerminal = async (config: K8sTerminalConfig): Promise<K8sTerminalSession> => {
  const shell = getDefaultShell()
  const cwd = os.homedir()
  const env: Record<string, string> = { ...process.env } as Record<string, string>

  // Set up kubeconfig environment
  if (config.kubeconfigPath) {
    env.KUBECONFIG = config.kubeconfigPath
  } else if (config.kubeconfigContent) {
    // Write content to a temp file
    const tempDir = os.tmpdir()
    const tempKubeconfigPath = path.join(tempDir, `kubeconfig-${config.id}.yaml`)
    fs.writeFileSync(tempKubeconfigPath, config.kubeconfigContent, { encoding: 'utf-8' })
    env.KUBECONFIG = tempKubeconfigPath
  }

  logger.info('Creating K8S terminal', {
    event: 'terminal.k8s.connect.start',
    terminalId: config.id,
    clusterId: config.clusterId,
    namespace: config.namespace
  })

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: config.cols || 80,
    rows: config.rows || 24,
    cwd,
    env
  })

  const terminal: K8sTerminalSession = {
    id: config.id,
    clusterId: config.clusterId,
    pty: ptyProcess,
    isAlive: true,
    namespace: config.namespace || 'default',
    kubeconfigPath: env.KUBECONFIG
  }

  ptyProcess.onData((data) => {
    sendToRenderer(`k8s:terminal:data:${config.id}`, data)
  })

  ptyProcess.onExit((exitCode) => {
    logger.debug('K8S terminal exited', { event: 'terminal.k8s.exit', terminalId: config.id, exitCode: exitCode?.exitCode })
    terminal.isAlive = false
    sendToRenderer(`k8s:terminal:exit:${config.id}`, exitCode)
    terminalSessions.delete(config.id)

    // Clean up temp kubeconfig file only if it was written to tmpdir
    if (terminal.kubeconfigPath && terminal.kubeconfigPath.includes(os.tmpdir())) {
      try {
        fs.unlinkSync(terminal.kubeconfigPath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  terminalSessions.set(config.id, terminal)
  logger.info('K8S terminal created', {
    event: 'terminal.k8s.connect.success',
    terminalId: config.id,
    clusterId: config.clusterId
  })

  return terminal
}

/**
 * Close a K8S terminal session
 */
const closeK8sTerminal = (terminalId: string): { success: boolean; error?: string } => {
  const terminal = terminalSessions.get(terminalId)
  if (terminal) {
    try {
      terminal.pty.kill()
      terminal.isAlive = false
      terminalSessions.delete(terminalId)

      // Clean up temp kubeconfig file
      if (terminal.kubeconfigPath && terminal.kubeconfigPath.includes(os.tmpdir())) {
        try {
          fs.unlinkSync(terminal.kubeconfigPath)
        } catch {
          // Ignore cleanup errors
        }
      }

      logger.info('K8S terminal closed', { event: 'terminal.k8s.disconnect.success', terminalId })
      return { success: true }
    } catch (error) {
      logger.error('Failed to close K8S terminal', {
        event: 'terminal.k8s.disconnect.error',
        terminalId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  logger.warn('Attempted to close non-existent K8S terminal', {
    event: 'terminal.k8s.disconnect.notfound',
    terminalId
  })
  return { success: false, error: 'Terminal not found' }
}

/**
 * Register all K8s related IPC handlers
 */
export function registerK8sHandlers(): void {
  const k8sManager = K8sManager.getInstance()

  /**
   * Get all available K8s contexts
   * Channel: k8s:get-contexts
   */
  ipcMain.handle('k8s:get-contexts', async () => {
    try {
      logger.info('[K8s IPC] Received request to get contexts')
      const contexts = await k8sManager.getContexts()
      logger.info('[K8s IPC] Returning contexts', { value: contexts })
      return {
        success: true,
        data: contexts,
        currentContext: k8sManager.getCurrentContext()
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to get contexts', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Get detailed information about a specific context
   * Channel: k8s:get-context-detail
   */
  ipcMain.handle('k8s:get-context-detail', async (_event, contextName: string) => {
    try {
      logger.info('[K8s IPC] Getting context detail for', { value: contextName })
      const detail = k8sManager.getContextDetail(contextName)
      return {
        success: true,
        data: detail
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to get context detail', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Switch to a different context
   * Channel: k8s:switch-context
   */
  ipcMain.handle('k8s:switch-context', async (_event, contextName: string) => {
    try {
      logger.info('[K8s IPC] Switching to context', { value: contextName })
      const success = await k8sManager.switchContext(contextName)
      return {
        success,
        currentContext: k8sManager.getCurrentContext()
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to switch context', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Reload K8s configurations
   * Channel: k8s:reload-config
   */
  ipcMain.handle('k8s:reload-config', async () => {
    try {
      logger.info('[K8s IPC] Reloading configurations')
      const result = await k8sManager.reload()
      return {
        success: result.success,
        data: result.contexts,
        currentContext: result.currentContext,
        error: result.error
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to reload config', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Validate a context connection
   * Channel: k8s:validate-context
   */
  ipcMain.handle('k8s:validate-context', async (_event, contextName: string) => {
    try {
      logger.info('[K8s IPC] Validating context', { value: contextName })
      const isValid = await k8sManager.validateContext(contextName)
      return {
        success: true,
        isValid
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to validate context', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Initialize K8s Manager
   * Channel: k8s:initialize
   */
  ipcMain.handle('k8s:initialize', async () => {
    try {
      logger.info('[K8s IPC] Initializing K8s Manager')
      const result = await k8sManager.initialize()
      return {
        success: result.success,
        data: result.contexts,
        currentContext: result.currentContext,
        error: result.error
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to initialize', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Set proxy configuration for K8S API server connections
   * Channel: k8s:set-proxy
   */
  ipcMain.handle('k8s:set-proxy', (_event, proxyConfig: K8sProxyConfig | null) => {
    try {
      logger.info('[K8s IPC] Setting proxy configuration', { hasProxy: !!proxyConfig })
      k8sManager.setProxyConfig(proxyConfig)
      return { success: true }
    } catch (error) {
      logger.error('[K8s IPC] Failed to set proxy configuration', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Get current proxy configuration
   * Channel: k8s:get-proxy
   */
  ipcMain.handle('k8s:get-proxy', () => {
    try {
      const proxyConfig = k8sManager.getProxyConfig()
      return { success: true, data: proxyConfig }
    } catch (error) {
      logger.error('[K8s IPC] Failed to get proxy configuration', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Start watching resources
   * Channel: k8s:start-watch
   */
  ipcMain.handle('k8s:start-watch', async (_event, contextName: string, resourceType: string, options?: any) => {
    try {
      logger.info(`[K8s IPC] Starting watch for ${resourceType} in ${contextName}`)

      const resourceTypes: Array<'Pod' | 'Node'> = []
      if (resourceType === 'Pod' || resourceType === 'Node') {
        resourceTypes.push(resourceType)
      } else {
        throw new Error(`Unsupported resource type: ${resourceType}`)
      }

      await k8sManager.startWatching(contextName, resourceTypes, options)

      return {
        success: true
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to start watch', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Stop watching resources
   * Channel: k8s:stop-watch
   */
  ipcMain.handle('k8s:stop-watch', async (_event, contextName: string, resourceType: string) => {
    try {
      logger.info(`[K8s IPC] Stopping watch for ${resourceType} in ${contextName}`)

      await k8sManager.stopWatching(contextName)

      const deltaPusher = k8sManager.getDeltaPusher()
      deltaPusher.removeCalculator(contextName, resourceType)

      return {
        success: true
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to stop watch', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // ==================== Cluster Management Handlers ====================

  /**
   * List saved K8S clusters from database
   * Channel: k8s:cluster:list
   */
  ipcMain.handle('k8s:cluster:list', async () => {
    try {
      logger.info('[K8s IPC] Listing saved clusters')
      const dbService = await ChatermDatabaseService.getInstance()
      const clusters = dbService.listK8sClusters()
      return {
        success: true,
        data: clusters
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to list clusters', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Get a K8S cluster by ID
   * Channel: k8s:cluster:get
   */
  ipcMain.handle('k8s:cluster:get', async (_event, id: string) => {
    try {
      logger.info('[K8s IPC] Getting cluster', { id })
      const dbService = await ChatermDatabaseService.getInstance()
      const cluster = dbService.getK8sCluster(id)
      return {
        success: true,
        data: cluster
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to get cluster', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Add a new K8S cluster
   * Channel: k8s:cluster:add
   */
  ipcMain.handle(
    'k8s:cluster:add',
    async (
      _event,
      params: {
        name: string
        kubeconfigPath?: string
        kubeconfigContent?: string
        contextName: string
        serverUrl: string
        authType?: string
        autoConnect?: boolean
        defaultNamespace?: string
      }
    ) => {
      try {
        logger.info('[K8s IPC] Adding cluster', { name: params.name, contextName: params.contextName })
        const dbService = await ChatermDatabaseService.getInstance()
        const result = dbService.addK8sCluster(params)
        return result
      } catch (error) {
        logger.error('[K8s IPC] Failed to add cluster', { error: error })
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )

  /**
   * Update a K8S cluster
   * Channel: k8s:cluster:update
   */
  ipcMain.handle(
    'k8s:cluster:update',
    async (
      _event,
      id: string,
      params: {
        name?: string
        kubeconfigPath?: string
        kubeconfigContent?: string
        contextName?: string
        serverUrl?: string
        authType?: string
        isActive?: boolean
        connectionStatus?: string
        autoConnect?: boolean
        defaultNamespace?: string
      }
    ) => {
      try {
        logger.info('[K8s IPC] Updating cluster', { id })
        const dbService = await ChatermDatabaseService.getInstance()
        const result = dbService.updateK8sCluster(id, params)
        return result
      } catch (error) {
        logger.error('[K8s IPC] Failed to update cluster', { error: error })
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )

  /**
   * Remove a K8S cluster
   * Channel: k8s:cluster:remove
   */
  ipcMain.handle('k8s:cluster:remove', async (_event, id: string) => {
    try {
      logger.info('[K8s IPC] Removing cluster', { id })
      const dbService = await ChatermDatabaseService.getInstance()

      // Remove all terminal sessions for this cluster first
      dbService.removeAllK8sTerminalSessions(id)

      const result = dbService.removeK8sCluster(id)
      return result
    } catch (error) {
      logger.error('[K8s IPC] Failed to remove cluster', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Test cluster connection
   * Channel: k8s:cluster:test
   */
  ipcMain.handle('k8s:cluster:test', async (_event, params: { kubeconfigPath?: string; kubeconfigContent?: string; contextName: string }) => {
    try {
      logger.info('[K8s IPC] Testing cluster connection', { contextName: params.contextName })

      // Dynamically import @kubernetes/client-node
      const k8s = await import('@kubernetes/client-node')
      const kc = new k8s.KubeConfig()

      // Load kubeconfig from provided path or content
      if (params.kubeconfigContent) {
        // Load from content string
        kc.loadFromString(params.kubeconfigContent)
      } else if (params.kubeconfigPath) {
        // Load from file path
        if (!fs.existsSync(params.kubeconfigPath)) {
          return {
            success: false,
            isValid: false,
            error: `Kubeconfig file not found: ${params.kubeconfigPath}`
          }
        }
        kc.loadFromFile(params.kubeconfigPath)
      } else {
        // Fallback to default kubeconfig
        kc.loadFromDefault()
      }

      // Apply proxy configuration if set
      const proxyConfig = k8sManager.getProxyConfig()
      if (proxyConfig) {
        k8sManager.getConfigLoader().applyProxyToKubeConfig(kc, proxyConfig)
      }

      // Set the context to test
      kc.setCurrentContext(params.contextName)

      // Create API client and test connection
      const k8sApi = kc.makeApiClient(k8s.CoreV1Api)
      await k8sApi.getAPIResources()

      return {
        success: true,
        isValid: true
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to test cluster connection', { error: error })
      return {
        success: false,
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Import clusters from kubeconfig file
   * Channel: k8s:cluster:import-kubeconfig
   */
  ipcMain.handle('k8s:cluster:import-kubeconfig', async (_event, kubeconfigPath: string) => {
    try {
      logger.info('[K8s IPC] Importing from kubeconfig', { path: kubeconfigPath })

      // Check file exists
      if (!fs.existsSync(kubeconfigPath)) {
        return {
          success: false,
          error: `Kubeconfig file not found: ${kubeconfigPath}`
        }
      }

      // Read kubeconfig file
      const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf-8')

      // Parse kubeconfig to extract contexts
      const k8s = await import('@kubernetes/client-node')
      const kc = new k8s.KubeConfig()
      kc.loadFromFile(kubeconfigPath)

      // Extract contexts from the imported file
      const rawContexts = kc.getContexts()
      const clusters = kc.getClusters()
      const currentContext = kc.getCurrentContext()

      const contexts = rawContexts.map((context) => {
        const cluster = clusters.find((c) => c.name === context.cluster)
        return {
          name: context.name,
          cluster: context.cluster,
          namespace: context.namespace || 'default',
          server: cluster?.server || 'unknown',
          isActive: context.name === currentContext
        }
      })

      return {
        success: true,
        data: {
          contexts,
          kubeconfigPath,
          kubeconfigContent
        }
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to import kubeconfig', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Connect to a cluster (update status)
   * Channel: k8s:cluster:connect
   */
  ipcMain.handle('k8s:cluster:connect', async (_event, id: string) => {
    try {
      logger.info('[K8s IPC] Connecting to cluster', { id })
      const dbService = await ChatermDatabaseService.getInstance()

      // Get cluster info
      const cluster = dbService.getK8sCluster(id)
      if (!cluster) {
        return { success: false, error: 'Cluster not found' }
      }

      // Validate connection using cluster's own kubeconfig
      let isValid = false
      try {
        const k8s = await import('@kubernetes/client-node')
        const kc = new k8s.KubeConfig()

        // Load from cluster's kubeconfig
        if (cluster.kubeconfig_content) {
          kc.loadFromString(cluster.kubeconfig_content)
        } else if (cluster.kubeconfig_path) {
          if (!fs.existsSync(cluster.kubeconfig_path)) {
            dbService.updateK8sClusterStatus(id, 'error')
            return { success: false, error: `Kubeconfig file not found: ${cluster.kubeconfig_path}` }
          }
          kc.loadFromFile(cluster.kubeconfig_path)
        } else {
          kc.loadFromDefault()
        }

        // Apply proxy configuration if set
        const proxyConfig = k8sManager.getProxyConfig()
        if (proxyConfig) {
          k8sManager.getConfigLoader().applyProxyToKubeConfig(kc, proxyConfig)
        }

        kc.setCurrentContext(cluster.context_name)
        const k8sApi = kc.makeApiClient(k8s.CoreV1Api)
        await k8sApi.getAPIResources()
        isValid = true
      } catch (error) {
        logger.error('[K8s IPC] Connection validation failed', { error: error })
        isValid = false
      }

      if (isValid) {
        // Update status to connected
        dbService.updateK8sClusterStatus(id, 'connected')
        dbService.setActiveK8sCluster(id)
        return { success: true, status: 'connected' }
      } else {
        dbService.updateK8sClusterStatus(id, 'error')
        return { success: false, error: 'Failed to connect to cluster' }
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to connect to cluster', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Disconnect from a cluster (update status)
   * Channel: k8s:cluster:disconnect
   */
  ipcMain.handle('k8s:cluster:disconnect', async (_event, id: string) => {
    try {
      logger.info('[K8s IPC] Disconnecting from cluster', { id })
      const dbService = await ChatermDatabaseService.getInstance()

      // Update status to disconnected
      dbService.updateK8sClusterStatus(id, 'disconnected')

      return { success: true, status: 'disconnected' }
    } catch (error) {
      logger.error('[K8s IPC] Failed to disconnect from cluster', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // ==================== Terminal Session Handlers ====================

  /**
   * Create a K8S terminal session
   * Channel: k8s:terminal:create
   */
  ipcMain.handle('k8s:terminal:create', async (_event, config: K8sTerminalConfig) => {
    try {
      logger.info('[K8s IPC] Creating terminal session', { clusterId: config.clusterId })

      // Get cluster info from database
      const dbService = await ChatermDatabaseService.getInstance()
      const cluster = dbService.getK8sCluster(config.clusterId)

      if (!cluster) {
        return { success: false, error: 'Cluster not found' }
      }

      // Create terminal with cluster's kubeconfig
      const terminalConfig: K8sTerminalConfig = {
        ...config,
        kubeconfigPath: cluster.kubeconfig_path || undefined,
        kubeconfigContent: cluster.kubeconfig_content || undefined,
        contextName: cluster.context_name,
        namespace: config.namespace || cluster.default_namespace
      }

      await createK8sTerminal(terminalConfig)

      // Save terminal session to database
      dbService.addK8sTerminalSession({
        clusterId: config.clusterId,
        name: config.id,
        namespace: terminalConfig.namespace
      })

      return { success: true, id: config.id }
    } catch (error) {
      logger.error('[K8s IPC] Failed to create terminal session', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Write data to K8S terminal
   * Channel: k8s:terminal:write
   */
  ipcMain.handle('k8s:terminal:write', (_event, terminalId: string, data: string) => {
    try {
      const terminal = terminalSessions.get(terminalId)
      if (terminal && terminal.isAlive) {
        if (data.endsWith('\n')) {
          const command = data.slice(0, -1)
          terminal.pty.write(command)
          if (os.platform() === 'win32') {
            terminal.pty.write('\r')
          } else {
            terminal.pty.write('\n')
          }
        } else {
          terminal.pty.write(data)
        }
        return { success: true }
      }
      return { success: false, error: 'Terminal not found or not alive' }
    } catch (error) {
      logger.error('[K8s IPC] Failed to write to terminal', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Resize K8S terminal
   * Channel: k8s:terminal:resize
   */
  ipcMain.handle('k8s:terminal:resize', (_event, terminalId: string, cols: number, rows: number) => {
    try {
      const terminal = terminalSessions.get(terminalId)
      if (terminal && terminal.isAlive) {
        terminal.pty.resize(cols, rows)
        return { success: true }
      }
      return { success: false, error: 'Terminal not found or not alive' }
    } catch (error) {
      logger.error('[K8s IPC] Failed to resize terminal', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Close K8S terminal session
   * Channel: k8s:terminal:close
   */
  ipcMain.handle('k8s:terminal:close', async (_event, terminalId: string) => {
    try {
      const result = closeK8sTerminal(terminalId)

      // Remove from database
      if (result.success) {
        const dbService = await ChatermDatabaseService.getInstance()
        dbService.removeK8sTerminalSession(terminalId)
      }

      return result
    } catch (error) {
      logger.error('[K8s IPC] Failed to close terminal', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * List terminal sessions for a cluster
   * Channel: k8s:terminal:list
   */
  ipcMain.handle('k8s:terminal:list', async (_event, clusterId: string) => {
    try {
      const dbService = await ChatermDatabaseService.getInstance()
      const sessions = dbService.listK8sTerminalSessions(clusterId)
      return {
        success: true,
        data: sessions
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to list terminal sessions', { error: error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Register K8s Agent IPC handlers
  registerK8sAgentHandlers()

  logger.info('[K8s IPC] All K8s IPC handlers registered')
}
