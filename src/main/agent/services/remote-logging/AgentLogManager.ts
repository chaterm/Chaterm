import { RemoteLoggingService, AgentInteractionLog } from './RemoteLoggingService'
import { ChatermMessage } from '../../shared/ExtensionMessage'
import { Host } from '../../shared/WebviewMessage'
import { sshConnections } from '../../../ssh/sshHandle'

/**
 * Manager for Agent logging functionality
 * Coordinates between the Task class and RemoteLoggingService
 */
export class AgentLogManager {
  private remoteLoggingService: RemoteLoggingService
  private pendingLogs: Map<string, AgentInteractionLog[]> = new Map()
  private batchFlushInterval: NodeJS.Timeout | null = null
  private readonly BATCH_FLUSH_DELAY = 2000 // 2 seconds

  constructor() {
    this.remoteLoggingService = RemoteLoggingService.getInstance()
    this.startBatchFlushTimer()
  }

  /**
   * Initialize logging for a new task
   */
  async initializeTaskLogging(taskId: string, hosts: Host[], sessionId?: string, username?: string): Promise<boolean> {
    console.log(`[AGENT LOG MANAGER] Initializing task logging for ${taskId}`)

    // For now, log to the first connected host
    // TODO: Consider logging to multiple hosts if needed
    const primaryHost = hosts.find((host) => host.host) || hosts[0]

    if (!primaryHost?.host) {
      console.warn('[AGENT LOG MANAGER] No valid host found for logging initialization')
      return false
    }

    console.log(`[AGENT LOG MANAGER] Primary host: ${primaryHost.host}`)

    // Try to find an active SSH connection for this host
    let effectiveSessionId = sessionId
    if (!effectiveSessionId) {
      // Look for an existing SSH connection to this host
      for (const [connId, conn] of sshConnections.entries()) {
        // Check if this connection matches our host
        // This is a simple check - in practice might need more sophisticated matching
        if (connId.includes(primaryHost.host) || (conn as { config?: { host?: string } })?.config?.host === primaryHost.host) {
          effectiveSessionId = connId
          console.log(`[AGENT LOG MANAGER] Found matching connection: ${connId}`)
          break
        }
      }

      // If no existing connection found, create a placeholder
      if (!effectiveSessionId) {
        effectiveSessionId = `task_${taskId}_${primaryHost.host}_${Date.now()}`
        console.warn(
          `[AGENT LOG MANAGER] No active SSH connection found for host ${primaryHost.host}, using placeholder session ID: ${effectiveSessionId}`
        )
      }
    }

    console.log(`[AGENT LOG MANAGER] Using session ID: ${effectiveSessionId}`)
    const success = await this.remoteLoggingService.initializeSession(taskId, effectiveSessionId, primaryHost.host, username)
    console.log(`[AGENT LOG MANAGER] initializeSession result: ${success}`)

    if (success) {
      // Initialize pending logs queue for this task
      this.pendingLogs.set(taskId, [])

      // Log task initialization
      await this.logTaskEvent(taskId, 'Task initialized', {
        hosts: hosts.map((h) => h.host),
        primaryHost: primaryHost.host,
        sessionId: effectiveSessionId
      })
    }

    return success
  }

  /**
   * Log a user message
   */
  async logUserMessage(taskId: string, message: string, ip?: string): Promise<void> {
    await this.addLogEntry({
      taskId,
      timestamp: Date.now(),
      messageType: 'user',
      content: message,
      ip
    })
  }

  /**
   * Log an assistant response
   */
  async logAssistantResponse(taskId: string, response: string, ip?: string): Promise<void> {
    await this.addLogEntry({
      taskId,
      timestamp: Date.now(),
      messageType: 'assistant',
      content: response,
      ip
    })
  }

  /**
   * Log a command execution
   */
  async logCommand(taskId: string, command: string, ip?: string, metadata?: { requiresApproval?: boolean; interactive?: boolean }): Promise<void> {
    await this.addLogEntry({
      taskId,
      timestamp: Date.now(),
      messageType: 'command',
      content: command,
      ip,
      metadata
    })
  }

  /**
   * Log command output
   */
  async logCommandOutput(taskId: string, output: string, ip?: string, metadata?: { exitCode?: number; duration?: number }): Promise<void> {
    await this.addLogEntry({
      taskId,
      timestamp: Date.now(),
      messageType: 'command_output',
      content: output,
      ip,
      metadata
    })
  }

  /**
   * Log an error
   */
  async logError(taskId: string, error: string | Error, ip?: string, metadata?: Record<string, unknown>): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error
    const errorStack = error instanceof Error ? error.stack : undefined

    await this.addLogEntry({
      taskId,
      timestamp: Date.now(),
      messageType: 'error',
      content: errorMessage,
      ip,
      metadata: {
        ...metadata,
        stack: errorStack
      }
    })
  }

  /**
   * Log a Chaterm message (from ExtensionMessage)
   */
  async logChatermMessage(taskId: string, message: ChatermMessage, ip?: string): Promise<void> {
    let content = ''
    let messageType: AgentInteractionLog['messageType'] = 'assistant'

    if (message.ask) {
      messageType = 'user'
      content = `Ask: ${message.ask}`
      if (message.text) {
        content += ` - ${message.text}`
      }
    } else if (message.say) {
      messageType = 'assistant'
      content = `Say: ${message.say}`
      if (message.text) {
        content += ` - ${message.text}`
      }
    } else if (message.text) {
      content = message.text
    }

    await this.addLogEntry({
      taskId,
      timestamp: message.ts,
      messageType,
      content,
      ip,
      metadata: {
        type: message.type,
        ask: message.ask,
        say: message.say,
        reasoning: message.reasoning,
        images: message.images?.length || 0
      }
    })
  }

  /**
   * Log a general task event
   */
  async logTaskEvent(taskId: string, event: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.addLogEntry({
      taskId,
      timestamp: Date.now(),
      messageType: 'assistant',
      content: `[TASK EVENT] ${event}`,
      metadata
    })
  }

  /**
   * Finalize logging for a task
   */
  async finalizeTaskLogging(taskId: string): Promise<boolean> {
    // Flush any pending logs first
    await this.flushPendingLogs(taskId)

    // Log task completion
    await this.logTaskEvent(taskId, 'Task completed')

    // Finalize the remote session
    const success = await this.remoteLoggingService.finalizeSession(taskId)

    // Clean up pending logs
    this.pendingLogs.delete(taskId)

    return success
  }

  /**
   * Get the log file path for a task
   */
  getLogFilePath(taskId: string): string | null {
    return this.remoteLoggingService.getLogFilePath(taskId)
  }

  /**
   * Check if logging is active for a task
   */
  isLoggingActive(taskId: string): boolean {
    return this.remoteLoggingService.isSessionActive(taskId)
  }

  /**
   * Check if task logging is initialized
   */
  isTaskInitialized(taskId: string): boolean {
    return this.remoteLoggingService.isSessionActive(taskId)
  }

  /**
   * Force flush pending logs for a task
   */
  async flushPendingLogs(taskId: string): Promise<void> {
    const pendingLogs = this.pendingLogs.get(taskId)
    if (!pendingLogs || pendingLogs.length === 0) {
      return
    }

    try {
      await this.remoteLoggingService.logBatch([...pendingLogs])
      pendingLogs.length = 0 // Clear the array
    } catch (error) {
      console.error(`Failed to flush pending logs for task ${taskId}:`, error)
    }
  }

  /**
   * Backup a file before modification
   */
  async backupFile(taskId: string, filePath: string): Promise<boolean> {
    console.log(`[AGENT LOG MANAGER] backupFile called for: ${filePath}`)
    try {
      const success = await this.remoteLoggingService.backupFile(taskId, filePath)
      console.log(`[AGENT LOG MANAGER] remoteLoggingService.backupFile result: ${success}`)
      if (success) {
        await this.logTaskEvent(taskId, `File backup created for ${filePath}`, {
          operation: 'file_backup',
          filePath
        })
      }
      return success
    } catch (error) {
      console.error(`Failed to backup file ${filePath} for task ${taskId}:`, error)
      return false
    }
  }

  /**
   * Check if a command involves file modification and backup if needed
   */
  async handleFileModificationCommand(taskId: string, command: string, ip?: string): Promise<void> {
    console.log(`[AGENT LOG MANAGER] handleFileModificationCommand called with: ${command}`)
    console.log(`[AGENT LOG MANAGER] TaskID: ${taskId}, IP: ${ip}`)
    const fileModificationPatterns = [
      // Text editor patterns
      /vi\s+([^\s]+)/, // vi filename
      /nano\s+([^\s]+)/, // nano filename
      /emacs\s+([^\s]+)/, // emacs filename
      /gedit\s+([^\s]+)/, // gedit filename

      // Output redirection patterns
      />\s*([^\s]+)/, // > filename
      />>\s*([^\s]+)/, // >> filename
      /cat\s+[^>]*>\s*([^\s]+)/, // cat something > filename
      /echo\s+[^>]*>\s*([^\s]+)/, // echo something > filename

      // In-place editing patterns
      /sed\s+.*-i[^>]*\s+([^\s]+)/, // sed -i ... filename
      /awk\s+.*>\s*([^\s]+)/, // awk ... > filename

      // Text manipulation with output
      /sort\s+[^>]*>\s*([^\s]+)/, // sort ... > filename
      /uniq\s+[^>]*>\s*([^\s]+)/, // uniq ... > filename
      /grep\s+[^>]*>\s*([^\s]+)/, // grep ... > filename

      // File copy/move that could overwrite
      /cp\s+[^\s]+\s+([^\s]+)/, // cp source dest
      /mv\s+[^\s]+\s+([^\s]+)/ // mv source dest
    ]

    const fileDeletionPatterns = [
      // rm with various options
      /rm\s+(?:-[rfivh]*\s+)*([^\s-][^\s]*)/, // rm filename, rm -f filename, rm -rf filename
      /rmdir\s+([^\s]+)/, // rmdir dirname
      /unlink\s+([^\s]+)/, // unlink filename

      // rm with explicit options followed by file
      /rm\s+-[rfivh]+\s+([^\s]+)/, // rm -rf filename, rm -f filename

      // Alternative rm patterns
      /\brm\s+.*?([^\s]+)$/ // rm at end of command with filename
    ]

    for (const pattern of fileModificationPatterns) {
      const match = command.match(pattern)
      if (match && match[1]) {
        const filePath = match[1].trim()

        // Skip if it's a special device or pipe
        if (filePath.startsWith('/dev/') || filePath === '/dev/null' || filePath.includes('|')) {
          continue
        }

        // Skip relative paths that look like options (starting with -)
        if (filePath.startsWith('-')) {
          continue
        }

        console.log(`Detected file modification command for: ${filePath}`)

        // Get absolute path for logging
        let absoluteFilePath = filePath
        if (!filePath.startsWith('/')) {
          // If it's a relative path, it will be resolved by the backup function
          absoluteFilePath = filePath
        }

        // Create backup before modification
        await this.backupFile(taskId, filePath)

        // Log the file modification attempt
        await this.logTaskEvent(taskId, `File modification detected: ${command}`, {
          operation: 'file_modification',
          targetFile: absoluteFilePath,
          command: command.substring(0, 100), // Truncate long commands
          ip
        })

        break // Only backup the first detected file to avoid multiple backups from one command
      }
    }

    // Check for file deletion commands
    console.log(`[AGENT LOG MANAGER] Checking file deletion patterns for: ${command}`)
    for (const pattern of fileDeletionPatterns) {
      console.log(`[AGENT LOG MANAGER] Testing pattern: ${pattern}`)
      const match = command.match(pattern)
      if (match && match[1]) {
        const filePath = match[1].trim()
        console.log(`[AGENT LOG MANAGER] Pattern matched! File path: ${filePath}`)

        // Skip if it's a special device or pipe
        if (filePath.startsWith('/dev/') || filePath === '/dev/null' || filePath.includes('|')) {
          console.log(`[AGENT LOG MANAGER] Skipping special device/pipe: ${filePath}`)
          continue
        }

        // Skip relative paths that look like options (starting with -)
        if (filePath.startsWith('-')) {
          console.log(`[AGENT LOG MANAGER] Skipping option-like path: ${filePath}`)
          continue
        }

        // Skip system directories and wildcards to avoid excessive backups
        if (
          filePath.includes('*') ||
          filePath.includes('?') ||
          filePath.startsWith('/bin/') ||
          filePath.startsWith('/usr/') ||
          filePath.startsWith('/etc/') ||
          filePath.startsWith('/var/')
        ) {
          console.log(`[AGENT LOG MANAGER] Skipping system directory/wildcard: ${filePath}`)
          continue
        }

        console.log(`[AGENT LOG MANAGER] Detected file deletion command for: ${filePath}`)

        // Get absolute path for logging
        let absoluteFilePath = filePath
        if (!filePath.startsWith('/')) {
          // If it's a relative path, it will be resolved by the backup function
          absoluteFilePath = filePath
        }

        // Create backup before deletion
        console.log(`[AGENT LOG MANAGER] Creating backup for: ${filePath}`)
        await this.backupFile(taskId, filePath)

        // Log the file deletion attempt
        await this.logTaskEvent(taskId, `File deletion detected: ${command}`, {
          operation: 'file_deletion',
          targetFile: absoluteFilePath,
          command: command.substring(0, 100), // Truncate long commands
          ip
        })

        break // Only backup the first detected file to avoid multiple backups from one command
      }
    }
  }

  /**
   * List backup files for a task
   */
  async listBackups(taskId: string): Promise<string[]> {
    try {
      return await this.remoteLoggingService.listBackups(taskId)
    } catch (error) {
      console.error(`Failed to list backups for task ${taskId}:`, error)
      return []
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.batchFlushInterval) {
      clearInterval(this.batchFlushInterval)
      this.batchFlushInterval = null
    }
  }

  private async addLogEntry(log: AgentInteractionLog): Promise<void> {
    // Add to pending logs queue
    const pendingLogs = this.pendingLogs.get(log.taskId)
    if (pendingLogs) {
      pendingLogs.push(log)

      // If queue gets too large, flush immediately
      if (pendingLogs.length >= 10) {
        await this.flushPendingLogs(log.taskId)
      }
    } else {
      // No session active, try to log directly
      try {
        await this.remoteLoggingService.logInteraction(log)
      } catch (error) {
        console.error('Failed to log interaction:', error)
      }
    }
  }

  private startBatchFlushTimer(): void {
    this.batchFlushInterval = setInterval(async () => {
      for (const taskId of this.pendingLogs.keys()) {
        await this.flushPendingLogs(taskId)
      }
    }, this.BATCH_FLUSH_DELAY)
  }
}
