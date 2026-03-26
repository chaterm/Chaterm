/**
 * K8S Agent Integration Module
 *
 * This module provides K8S tools for the AI Agent, allowing it to:
 * - Execute kubectl commands
 * - Get pods, nodes, services, etc.
 * - Get pod logs
 * - Describe resources
 *
 * It reuses the K8sManager connection which already has proxy support.
 */

import { K8sManager, K8sProxyConfig } from '../../../services/k8s'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import * as pty from 'node-pty'

const logger = createLogger('k8s-agent')

// Lazy load kubernetes client
let k8sModule: any = null

async function ensureK8sModule() {
  if (!k8sModule) {
    k8sModule = await import('@kubernetes/client-node')
  }
  return k8sModule
}

/**
 * K8S command execution result
 */
export interface K8sCommandResult {
  success: boolean
  output: string
  error?: string
  exitCode?: number
}

/**
 * K8S resource info
 */
export interface K8sResourceInfo {
  name: string
  namespace?: string
  status?: string
  age?: string
  ready?: string
  restarts?: number
  node?: string
  ip?: string
  [key: string]: any
}

/**
 * K8S Agent Manager
 * Provides K8S operations for the AI Agent
 */
export class K8sAgentManager {
  private static instance: K8sAgentManager | null = null
  private k8sManager: K8sManager
  private currentClusterId: string | null = null
  private currentContextName: string | null = null
  private kubeconfigPath: string | null = null
  private kubeconfigContent: string | null = null
  private kubeConfig: any = null

  private constructor() {
    this.k8sManager = K8sManager.getInstance()
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): K8sAgentManager {
    if (!K8sAgentManager.instance) {
      K8sAgentManager.instance = new K8sAgentManager()
    }
    return K8sAgentManager.instance
  }

  /**
   * Set current cluster for operations
   */
  public async setCurrentCluster(clusterId: string, contextName: string, kubeconfigPath?: string, kubeconfigContent?: string): Promise<void> {
    this.currentClusterId = clusterId
    this.currentContextName = contextName

    // Handle kubeconfig - prefer content, but read from path if only path is provided
    if (kubeconfigContent) {
      this.kubeconfigContent = kubeconfigContent
      // Also write to temp file for kubectl commands
      const tempDir = os.tmpdir()
      const tempPath = path.join(tempDir, `kubeconfig-agent-${clusterId}.yaml`)
      fs.writeFileSync(tempPath, kubeconfigContent, { encoding: 'utf-8' })
      this.kubeconfigPath = tempPath
    } else if (kubeconfigPath) {
      // Read content from file path
      if (fs.existsSync(kubeconfigPath)) {
        this.kubeconfigContent = fs.readFileSync(kubeconfigPath, { encoding: 'utf-8' })
        this.kubeconfigPath = kubeconfigPath
      } else {
        logger.error('[K8s Agent] Kubeconfig file not found', { path: kubeconfigPath })
        this.kubeconfigContent = null
        this.kubeconfigPath = null
      }
    } else {
      this.kubeconfigContent = null
      this.kubeconfigPath = null
    }

    // Initialize KubeConfig for API calls
    await this.initKubeConfig()

    logger.info('[K8s Agent] Current cluster set', {
      clusterId,
      contextName,
      hasKubeconfigPath: !!this.kubeconfigPath,
      hasKubeconfigContent: !!this.kubeconfigContent
    })
  }

  /**
   * Initialize KubeConfig instance for the current cluster
   */
  private async initKubeConfig(): Promise<void> {
    const k8s = await ensureK8sModule()
    this.kubeConfig = new k8s.KubeConfig()

    if (this.kubeconfigContent) {
      logger.info('[K8s Agent] Loading kubeconfig from content string')
      this.kubeConfig.loadFromString(this.kubeconfigContent)
    } else if (this.kubeconfigPath) {
      logger.info('[K8s Agent] Loading kubeconfig from file', { path: this.kubeconfigPath })
      this.kubeConfig.loadFromFile(this.kubeconfigPath)
    } else {
      logger.info('[K8s Agent] Loading kubeconfig from default location')
      this.kubeConfig.loadFromDefault()
    }

    // Log available contexts
    const contexts = this.kubeConfig.getContexts()
    logger.info('[K8s Agent] Available contexts', { contexts: contexts.map((c: any) => c.name) })

    if (this.currentContextName) {
      logger.info('[K8s Agent] Setting current context', { contextName: this.currentContextName })
      this.kubeConfig.setCurrentContext(this.currentContextName)
    }

    // Apply proxy if configured
    const proxyConfig = this.k8sManager.getProxyConfig()
    if (proxyConfig) {
      this.k8sManager.getConfigLoader().applyProxyToKubeConfig(this.kubeConfig, proxyConfig)
    }

    // Log current cluster info
    const currentContext = this.kubeConfig.getCurrentContext()
    const cluster = this.kubeConfig.getCurrentCluster()
    logger.info('[K8s Agent] KubeConfig initialized', {
      currentContext,
      clusterServer: cluster?.server
    })
  }

  /**
   * Get the KubeConfig for the current cluster
   */
  private async getKubeConfig(): Promise<any> {
    if (!this.kubeConfig) {
      await this.initKubeConfig()
    }
    return this.kubeConfig
  }

  /**
   * Set proxy configuration
   */
  public setProxyConfig(config: K8sProxyConfig | null): void {
    this.k8sManager.setProxyConfig(config)
  }

  /**
   * Get current cluster info
   */
  public getCurrentCluster(): { clusterId: string | null; contextName: string | null } {
    return {
      clusterId: this.currentClusterId,
      contextName: this.currentContextName
    }
  }

  /**
   * Execute kubectl command
   * This uses node-pty to run kubectl with the correct kubeconfig
   */
  public async executeKubectl(command: string, timeout: number = 30000): Promise<K8sCommandResult> {
    if (!this.currentContextName) {
      return {
        success: false,
        output: '',
        error: 'No cluster selected. Please select a cluster first.'
      }
    }

    return new Promise((resolve) => {
      const shell = this.getDefaultShell()
      const env: Record<string, string> = { ...process.env } as Record<string, string>

      // Set KUBECONFIG environment variable
      if (this.kubeconfigPath) {
        env.KUBECONFIG = this.kubeconfigPath
      }

      const pluginKubectlPath = process.env.CHATERM_KUBECTL_PATH
      const kubectlBinary = pluginKubectlPath && fs.existsSync(pluginKubectlPath) ? `"${pluginKubectlPath}"` : 'kubectl'
      const isPowerShell = /(?:^|[\\/])(powershell|pwsh)(?:\.exe)?$/i.test(shell)
      const shellKubectl = isPowerShell ? `& ${kubectlBinary}` : kubectlBinary

      // Build the full kubectl command.
      // PowerShell requires call operator (&) for quoted executable path.
      const trimmedCommand = command.trim()
      const fullCommand = /^kubectl\b/i.test(trimmedCommand)
        ? `${trimmedCommand.replace(/^kubectl\b/i, shellKubectl)} --context=${this.currentContextName}`
        : `${shellKubectl} ${trimmedCommand} --context=${this.currentContextName}`

      logger.info('[K8s Agent] Executing kubectl', { command: fullCommand })

      let output = ''
      let exitCode: number | undefined

      const shellArgs = isPowerShell ? ['-NoLogo', '-NoProfile', '-Command', fullCommand] : ['-c', fullCommand]
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 200,
        rows: 50,
        cwd: os.homedir(),
        env
      })

      const timeoutId = setTimeout(() => {
        ptyProcess.kill()
        resolve({
          success: false,
          output,
          error: 'Command timed out',
          exitCode: -1
        })
      }, timeout)

      ptyProcess.onData((data) => {
        output += data
      })

      ptyProcess.onExit((exitInfo) => {
        clearTimeout(timeoutId)
        exitCode = exitInfo.exitCode

        // Clean up output (remove ANSI codes)
        let cleanOutput = this.stripAnsiCodes(output)

        // On Windows, PowerShell PTY may emit OSC window title residue as a standalone line
        // (e.g. "\windows\System32\WindowsPowerShell\v1.0\powershell.exe").
        // Also strip inline residue appended to a real output line (e.g. "NAME:\windows\...\powershell.exe").
        const lines = cleanOutput.split('\n')
        const filtered = lines
          .filter((line, idx) => {
            if (idx > 2) return true
            const trimmed = line.trim()
            return !/^[A-Za-z]?[:\\\/][^\n]*\.exe\s*$/i.test(trimmed)
          })
          .map((line) => line.replace(/[A-Za-z]?[:\\\/][^\s]*\.exe\s*$/i, '').trimEnd())
        cleanOutput = filtered.join('\n').trimStart()

        resolve({
          success: exitCode === 0,
          output: cleanOutput,
          error: exitCode !== 0 ? `Command exited with code ${exitCode}` : undefined,
          exitCode
        })
      })
    })
  }

  /**
   * Get pods using K8S API client
   */
  public async getPods(namespace?: string): Promise<K8sCommandResult> {
    try {
      const k8s = await ensureK8sModule()
      const kc = await this.getKubeConfig()

      if (!kc) {
        return {
          success: false,
          output: '',
          error: 'KubeConfig not initialized. Please select a cluster first.'
        }
      }

      const coreApi = kc.makeApiClient(k8s.CoreV1Api)

      let pods: any
      if (namespace) {
        pods = await coreApi.listNamespacedPod({ namespace })
      } else {
        pods = await coreApi.listPodForAllNamespaces()
      }

      const output = this.formatPodsOutput(pods.items)

      return {
        success: true,
        output
      }
    } catch (error) {
      logger.error('[K8s Agent] Failed to get pods', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get nodes using K8S API client
   */
  public async getNodes(): Promise<K8sCommandResult> {
    try {
      const k8s = await ensureK8sModule()
      const kc = await this.getKubeConfig()

      if (!kc) {
        return {
          success: false,
          output: '',
          error: 'KubeConfig not initialized. Please select a cluster first.'
        }
      }

      const coreApi = kc.makeApiClient(k8s.CoreV1Api)
      const nodes = await coreApi.listNode()

      const output = this.formatNodesOutput(nodes.items)

      return {
        success: true,
        output
      }
    } catch (error) {
      logger.error('[K8s Agent] Failed to get nodes', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get namespaces using K8S API client
   */
  public async getNamespaces(): Promise<K8sCommandResult> {
    try {
      const k8s = await ensureK8sModule()
      const kc = await this.getKubeConfig()

      if (!kc) {
        return {
          success: false,
          output: '',
          error: 'KubeConfig not initialized. Please select a cluster first.'
        }
      }

      const coreApi = kc.makeApiClient(k8s.CoreV1Api)
      const namespaces = await coreApi.listNamespace()

      const output = this.formatNamespacesOutput(namespaces.items)

      return {
        success: true,
        output
      }
    } catch (error) {
      logger.error('[K8s Agent] Failed to get namespaces', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get services using K8S API client
   */
  public async getServices(namespace?: string): Promise<K8sCommandResult> {
    try {
      const k8s = await ensureK8sModule()
      const kc = await this.getKubeConfig()

      if (!kc) {
        return {
          success: false,
          output: '',
          error: 'KubeConfig not initialized. Please select a cluster first.'
        }
      }

      const coreApi = kc.makeApiClient(k8s.CoreV1Api)

      let services: any
      if (namespace) {
        services = await coreApi.listNamespacedService({ namespace })
      } else {
        services = await coreApi.listServiceForAllNamespaces()
      }

      const output = this.formatServicesOutput(services.items)

      return {
        success: true,
        output
      }
    } catch (error) {
      logger.error('[K8s Agent] Failed to get services', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get pod logs using K8S API client
   */
  public async getPodLogs(podName: string, namespace: string = 'default', container?: string, tailLines: number = 100): Promise<K8sCommandResult> {
    try {
      const k8s = await ensureK8sModule()
      const kc = await this.getKubeConfig()

      if (!kc) {
        return {
          success: false,
          output: '',
          error: 'KubeConfig not initialized. Please select a cluster first.'
        }
      }

      const coreApi = kc.makeApiClient(k8s.CoreV1Api)
      const logs = await coreApi.readNamespacedPodLog({
        name: podName,
        namespace,
        container,
        tailLines
      })

      return {
        success: true,
        output: typeof logs === 'string' ? logs : JSON.stringify(logs)
      }
    } catch (error) {
      logger.error('[K8s Agent] Failed to get pod logs', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Describe a resource using kubectl
   */
  public async describeResource(resourceType: string, resourceName: string, namespace?: string): Promise<K8sCommandResult> {
    let command = `describe ${resourceType} ${resourceName}`
    if (namespace) {
      command += ` -n ${namespace}`
    }
    return this.executeKubectl(command)
  }

  /**
   * Get deployments using K8S API client
   */
  public async getDeployments(namespace?: string): Promise<K8sCommandResult> {
    try {
      const k8s = await ensureK8sModule()
      const kc = await this.getKubeConfig()

      if (!kc) {
        return {
          success: false,
          output: '',
          error: 'KubeConfig not initialized. Please select a cluster first.'
        }
      }

      const appsApi = kc.makeApiClient(k8s.AppsV1Api)

      let deployments: any
      if (namespace) {
        deployments = await appsApi.listNamespacedDeployment({ namespace })
      } else {
        deployments = await appsApi.listDeploymentForAllNamespaces()
      }

      const output = this.formatDeploymentsOutput(deployments.items)

      return {
        success: true,
        output
      }
    } catch (error) {
      logger.error('[K8s Agent] Failed to get deployments', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Test cluster connection
   */
  public async testConnection(): Promise<K8sCommandResult> {
    if (!this.currentContextName) {
      return {
        success: false,
        output: '',
        error: 'No cluster selected'
      }
    }

    try {
      const k8s = await ensureK8sModule()
      const kc = await this.getKubeConfig()

      if (!kc) {
        return {
          success: false,
          output: '',
          error: 'KubeConfig not initialized'
        }
      }

      const coreApi = kc.makeApiClient(k8s.CoreV1Api)
      await coreApi.getAPIResources()

      return {
        success: true,
        output: 'Connection successful'
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // ==================== Helper Methods ====================

  private getDefaultShell(): string {
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

  private stripAnsiCodes(text: string): string {
    return (
      text
        // Remove OSC sequences (window title, etc.): ESC ] ... BEL or ESC ] ... ESC \
        .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
        // Remove orphaned OSC content (when ESC was already stripped): ]0;...BEL or ]9;...BEL
        .replace(/\][\d]+;[^\x07\n\r]*\x07?/g, '')
        // Standard CSI sequences
        .replace(/\x1B\[[0-9;]*[JKmsu]/g, '')
        .replace(/\x1B\[[?][0-9]*[hl]/g, '')
        .replace(/\x1B\[K/g, '')
        .replace(/\x1B\[[0-9]+[ABCD]/g, '')
        // Remove remaining ESC sequences
        .replace(/\x1B[^[\]]/g, '')
        .replace(/[\r]/g, '')
    )
  }

  private formatPodsOutput(pods: any[]): string {
    if (!pods || pods.length === 0) {
      return 'No pods found'
    }

    const lines = ['NAMESPACE\tNAME\tREADY\tSTATUS\tRESTARTS\tAGE']
    for (const pod of pods) {
      const namespace = pod.metadata?.namespace || 'default'
      const name = pod.metadata?.name || 'unknown'
      const phase = pod.status?.phase || 'Unknown'
      const containerStatuses = pod.status?.containerStatuses || []
      const readyCount = containerStatuses.filter((c: any) => c.ready).length
      const totalCount = containerStatuses.length || pod.spec?.containers?.length || 0
      const ready = `${readyCount}/${totalCount}`
      const restarts = containerStatuses.reduce((sum: number, c: any) => sum + (c.restartCount || 0), 0)
      const age = this.getAge(pod.metadata?.creationTimestamp)

      lines.push(`${namespace}\t${name}\t${ready}\t${phase}\t${restarts}\t${age}`)
    }

    return lines.join('\n')
  }

  private formatNodesOutput(nodes: any[]): string {
    if (!nodes || nodes.length === 0) {
      return 'No nodes found'
    }

    const lines = ['NAME\tSTATUS\tROLES\tAGE\tVERSION']
    for (const node of nodes) {
      const name = node.metadata?.name || 'unknown'
      const conditions = node.status?.conditions || []
      const readyCondition = conditions.find((c: any) => c.type === 'Ready')
      const status = readyCondition?.status === 'True' ? 'Ready' : 'NotReady'
      const labels = node.metadata?.labels || {}
      const roles =
        Object.keys(labels)
          .filter((k) => k.startsWith('node-role.kubernetes.io/'))
          .map((k) => k.replace('node-role.kubernetes.io/', ''))
          .join(',') || '<none>'
      const age = this.getAge(node.metadata?.creationTimestamp)
      const version = node.status?.nodeInfo?.kubeletVersion || 'unknown'

      lines.push(`${name}\t${status}\t${roles}\t${age}\t${version}`)
    }

    return lines.join('\n')
  }

  private formatNamespacesOutput(namespaces: any[]): string {
    if (!namespaces || namespaces.length === 0) {
      return 'No namespaces found'
    }

    const lines = ['NAME\tSTATUS\tAGE']
    for (const ns of namespaces) {
      const name = ns.metadata?.name || 'unknown'
      const status = ns.status?.phase || 'Active'
      const age = this.getAge(ns.metadata?.creationTimestamp)

      lines.push(`${name}\t${status}\t${age}`)
    }

    return lines.join('\n')
  }

  private formatServicesOutput(services: any[]): string {
    if (!services || services.length === 0) {
      return 'No services found'
    }

    const lines = ['NAMESPACE\tNAME\tTYPE\tCLUSTER-IP\tEXTERNAL-IP\tPORT(S)\tAGE']
    for (const svc of services) {
      const namespace = svc.metadata?.namespace || 'default'
      const name = svc.metadata?.name || 'unknown'
      const type = svc.spec?.type || 'ClusterIP'
      const clusterIP = svc.spec?.clusterIP || '<none>'
      const externalIPs = svc.status?.loadBalancer?.ingress?.map((i: any) => i.ip || i.hostname).join(',') || '<none>'
      const ports = svc.spec?.ports?.map((p: any) => `${p.port}/${p.protocol}`).join(',') || '<none>'
      const age = this.getAge(svc.metadata?.creationTimestamp)

      lines.push(`${namespace}\t${name}\t${type}\t${clusterIP}\t${externalIPs}\t${ports}\t${age}`)
    }

    return lines.join('\n')
  }

  private formatDeploymentsOutput(deployments: any[]): string {
    if (!deployments || deployments.length === 0) {
      return 'No deployments found'
    }

    const lines = ['NAMESPACE\tNAME\tREADY\tUP-TO-DATE\tAVAILABLE\tAGE']
    for (const deploy of deployments) {
      const namespace = deploy.metadata?.namespace || 'default'
      const name = deploy.metadata?.name || 'unknown'
      const readyReplicas = deploy.status?.readyReplicas || 0
      const replicas = deploy.spec?.replicas || 0
      const ready = `${readyReplicas}/${replicas}`
      const upToDate = deploy.status?.updatedReplicas || 0
      const available = deploy.status?.availableReplicas || 0
      const age = this.getAge(deploy.metadata?.creationTimestamp)

      lines.push(`${namespace}\t${name}\t${ready}\t${upToDate}\t${available}\t${age}`)
    }

    return lines.join('\n')
  }

  private getAge(timestamp: string | undefined): string {
    if (!timestamp) return 'unknown'

    const created = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - created.getTime()

    const seconds = Math.floor(diffMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d`
    if (hours > 0) return `${hours}h`
    if (minutes > 0) return `${minutes}m`
    return `${seconds}s`
  }

  /**
   * Cleanup temporary files
   */
  public cleanup(): void {
    if (this.kubeconfigPath && this.kubeconfigPath.includes(os.tmpdir())) {
      try {
        fs.unlinkSync(this.kubeconfigPath)
      } catch {
        // Ignore cleanup errors
      }
    }
    this.kubeconfigPath = null
    this.kubeconfigContent = null
    this.currentClusterId = null
    this.currentContextName = null
    this.kubeConfig = null
  }
}

// Export singleton getter
export function getK8sAgentManager(): K8sAgentManager {
  return K8sAgentManager.getInstance()
}
