import { remoteSshExec } from '../../../ssh/agentHandle'

export interface AgentInteractionLog {
  taskId: string
  timestamp: number
  messageType: 'user' | 'assistant' | 'command' | 'command_output' | 'error'
  content: string
  ip?: string
  metadata?: Record<string, unknown>
}

export interface RemoteLogSession {
  taskId: string
  sessionId: string
  logFilePath: string
  startTime: number
}

/**
 * Service for logging Agent task interactions to remote servers
 * Stores logs in ~/.chaterm directory on the connected server
 */
export class RemoteLoggingService {
  private static instance: RemoteLoggingService
  private activeSessions: Map<string, RemoteLogSession> = new Map()

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): RemoteLoggingService {
    if (!RemoteLoggingService.instance) {
      RemoteLoggingService.instance = new RemoteLoggingService()
    }
    return RemoteLoggingService.instance
  }

  /**
   * Get username from remote server using whoami command
   */
  private async getRemoteUsername(sessionId: string): Promise<string> {
    try {
      const result = await remoteSshExec(sessionId, 'whoami')
      if (result.success && result.output) {
        return result.output.trim()
      }
    } catch (error) {
      console.warn('Failed to get remote username:', error)
    }
    return 'unknown'
  }

  /**
   * Initialize a new logging session for a task
   */
  async initializeSession(taskId: string, sessionId: string, hostIp: string, username?: string): Promise<boolean> {
    console.log(`[REMOTE LOGGING SERVICE] initializeSession called`)
    console.log(`[REMOTE LOGGING SERVICE] TaskID: ${taskId}, SessionID: ${sessionId}, HostIP: ${hostIp}`)

    try {
      // Get current timestamp for backup naming (local time)
      const now = new Date()

      // Format timestamp as YYYYMMDD_HHMMSS
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const hour = String(now.getHours()).padStart(2, '0')
      const minute = String(now.getMinutes()).padStart(2, '0')
      const second = String(now.getSeconds()).padStart(2, '0')
      const timestamp = `${year}${month}${day}_${hour}${minute}${second}`
      const logFileName = `agent-task-${taskId}-${timestamp}.log`
      console.log(`[REMOTE LOGGING SERVICE] Creating log file: ${logFileName}`)

      // Create .chaterm directory in user's home directory
      const createDirCommand = 'mkdir -p ~/.chaterm'
      console.log(`[REMOTE LOGGING SERVICE] Creating directory with command: ${createDirCommand}`)
      const dirResult = await remoteSshExec(sessionId, createDirCommand)
      console.log(`[REMOTE LOGGING SERVICE] Directory creation result:`, dirResult)

      if (!dirResult.success) {
        console.error('Failed to create .chaterm directory:', dirResult.error)
        return false
      }

      // Get username if not provided
      let actualUsername = username
      if (!actualUsername || actualUsername === 'unknown') {
        console.log(`[REMOTE LOGGING SERVICE] Getting username from remote server`)
        actualUsername = await this.getRemoteUsername(sessionId)
        console.log(`[REMOTE LOGGING SERVICE] Remote username: ${actualUsername}`)
      }

      // Get the full path to the log file
      const logFilePath = `~/.chaterm/${logFileName}`

      // Initialize log file with header
      const headerContent = this.createLogHeader(taskId, hostIp, actualUsername)
      const initCommand = `cat > ${logFilePath} << 'EOF'
${headerContent}
EOF`

      const initResult = await remoteSshExec(sessionId, initCommand)

      if (!initResult.success) {
        console.error('Failed to initialize log file:', initResult.error)
        return false
      }

      // Store session info
      const session: RemoteLogSession = {
        taskId,
        sessionId,
        logFilePath,
        startTime: Date.now()
      }

      this.activeSessions.set(taskId, session)

      console.log(`Remote logging session initialized for task ${taskId} at ${logFilePath}`)
      return true
    } catch (error) {
      console.error('Error initializing remote logging session:', error)
      return false
    }
  }

  /**
   * Log an agent interaction to the remote server
   */
  async logInteraction(log: AgentInteractionLog): Promise<boolean> {
    const session = this.activeSessions.get(log.taskId)
    if (!session) {
      console.warn(`No active logging session for task ${log.taskId}`)
      return false
    }

    try {
      const logEntry = this.formatLogEntry(log)

      // Append to log file using echo command to avoid issues with special characters
      const escapedContent = logEntry.replace(/'/g, "'\"'\"'")
      const appendCommand = `echo '${escapedContent}' >> ${session.logFilePath}`

      const result = await remoteSshExec(session.sessionId, appendCommand)

      if (!result.success) {
        console.error(`Failed to write log entry for task ${log.taskId}:`, result.error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error logging interaction:', error)
      return false
    }
  }

  /**
   * Log multiple interactions as a batch
   */
  async logBatch(logs: AgentInteractionLog[]): Promise<boolean> {
    if (logs.length === 0) return true

    const taskId = logs[0].taskId
    const session = this.activeSessions.get(taskId)
    if (!session) {
      console.warn(`No active logging session for task ${taskId}`)
      return false
    }

    try {
      const logEntries = logs.map((log) => this.formatLogEntry(log)).join('\n')

      // Use here document to write multiple lines efficiently
      const escapedContent = logEntries.replace(/'/g, "'\"'\"'")
      const batchCommand = `cat >> ${session.logFilePath} << 'EOF'
${escapedContent}
EOF`

      const result = await remoteSshExec(session.sessionId, batchCommand)

      if (!result.success) {
        console.error(`Failed to write batch log entries for task ${taskId}:`, result.error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error logging batch interactions:', error)
      return false
    }
  }

  /**
   * Finalize a logging session
   */
  async finalizeSession(taskId: string): Promise<boolean> {
    const session = this.activeSessions.get(taskId)
    if (!session) {
      return true // Already finalized or never started
    }

    try {
      const footer = this.createLogFooter(session.startTime)
      const footerCommand = `echo '${footer}' >> ${session.logFilePath}`

      const result = await remoteSshExec(session.sessionId, footerCommand)

      if (!result.success) {
        console.error(`Failed to write log footer for task ${taskId}:`, result.error)
      }

      this.activeSessions.delete(taskId)
      console.log(`Remote logging session finalized for task ${taskId}`)
      return result.success || false
    } catch (error) {
      console.error('Error finalizing logging session:', error)
      this.activeSessions.delete(taskId) // Clean up anyway
      return false
    }
  }

  /**
   * Get the log file path for a task
   */
  getLogFilePath(taskId: string): string | null {
    const session = this.activeSessions.get(taskId)
    return session ? session.logFilePath : null
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): RemoteLogSession[] {
    return Array.from(this.activeSessions.values())
  }

  /**
   * Check if a session is active for a task
   */
  isSessionActive(taskId: string): boolean {
    return this.activeSessions.has(taskId)
  }

  /**
   * Format timestamp as YYYY-MM-DD HH:MM:SS
   */
  private formatTimestamp(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    const second = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  }

  /**
   * Backup a file before modification
   */
  async backupFile(taskId: string, filePath: string, sessionId?: string): Promise<boolean> {
    console.log(`[REMOTE LOGGING SERVICE] backupFile called`)
    console.log(`[REMOTE LOGGING SERVICE] TaskID: ${taskId}, FilePath: ${filePath}, SessionID: ${sessionId}`)
    console.log(`[REMOTE LOGGING SERVICE] Active sessions:`, Array.from(this.activeSessions.keys()))

    const session = this.activeSessions.get(taskId)
    if (!session && !sessionId) {
      console.warn(`[REMOTE LOGGING SERVICE] No active logging session for task ${taskId}`)
      return false
    }

    const effectiveSessionId = sessionId || session?.sessionId
    console.log(`[REMOTE LOGGING SERVICE] Effective session ID: ${effectiveSessionId}`)
    if (!effectiveSessionId) {
      console.warn(`[REMOTE LOGGING SERVICE] No session ID available for file backup`)
      return false
    }

    try {
      // Get current timestamp for backup naming (local time)
      const now = new Date()

      // Format timestamp as YYYYMMDD_HHMMSS
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const hour = String(now.getHours()).padStart(2, '0')
      const minute = String(now.getMinutes()).padStart(2, '0')
      const second = String(now.getSeconds()).padStart(2, '0')
      const timestamp = `${year}${month}${day}_${hour}${minute}${second}`
      const fileName = filePath.split('/').pop() || 'unknown_file'
      const backupFileName = `${fileName}.backup-${timestamp}`

      // Create backup directory if it doesn't exist
      const backupDir = `$HOME/.chaterm/backups/${taskId}`
      const createBackupDirCommand = `mkdir -p ${backupDir}`

      const dirResult = await remoteSshExec(effectiveSessionId, createBackupDirCommand)
      if (!dirResult.success) {
        console.error('Failed to create backup directory:', dirResult.error)
        return false
      }

      // Get absolute path of the file first
      const getAbsPathCommand = `realpath "${filePath}" 2>/dev/null || readlink -f "${filePath}" 2>/dev/null || echo "${filePath}"`
      const absPathResult = await remoteSshExec(effectiveSessionId, getAbsPathCommand)
      const absoluteFilePath = absPathResult.success ? absPathResult.output?.trim() || filePath : filePath

      console.log(`[REMOTE LOGGING SERVICE] Original path: ${filePath}, Absolute path: ${absoluteFilePath}`)

      // Check if file or directory exists before backing up
      const checkFileCommand = `test -e "${absoluteFilePath}"`
      const checkResult = await remoteSshExec(effectiveSessionId, checkFileCommand)
      console.log(`[REMOTE LOGGING SERVICE] File existence check for ${absoluteFilePath}:`, checkResult)

      if (!checkResult.success) {
        console.log(`[REMOTE LOGGING SERVICE] File/directory ${absoluteFilePath} does not exist, skipping backup`)
        return true // Not an error if file doesn't exist
      }

      // Copy file or directory to backup location (use command substitution to expand $HOME)
      const backupFilePath = `\${HOME}/.chaterm/backups/${taskId}/${backupFileName}`

      // Check if it's a directory to use appropriate cp command
      const isDirectoryCommand = `test -d "${absoluteFilePath}"`
      const isDirResult = await remoteSshExec(effectiveSessionId, isDirectoryCommand)

      const backupCommand = isDirResult.success ? `cp -r "${absoluteFilePath}" "${backupFilePath}"` : `cp "${absoluteFilePath}" "${backupFilePath}"`

      console.log(`[REMOTE LOGGING SERVICE] Backup command: ${backupCommand}`)
      const backupResult = await remoteSshExec(effectiveSessionId, backupCommand)
      console.log(`[REMOTE LOGGING SERVICE] Backup result:`, backupResult)

      if (!backupResult.success) {
        console.error(`Failed to backup file ${filePath}:`, backupResult.error)
        return false
      }

      // Get absolute backup file path for logging
      const getAbsBackupPathCommand = `echo "${backupFilePath}"`
      const absBackupPathResult = await remoteSshExec(effectiveSessionId, getAbsBackupPathCommand)
      const absoluteBackupFilePath = absBackupPathResult.success ? absBackupPathResult.output?.trim() || backupFilePath : backupFilePath

      console.log(`Successfully backed up ${absoluteFilePath} to ${absoluteBackupFilePath}`)

      // Log the backup operation with absolute paths
      await this.logInteraction({
        taskId,
        timestamp: Date.now(),
        messageType: 'assistant',
        content: `[FILE BACKUP] Created backup of ${absoluteFilePath} as ${absoluteBackupFilePath}`,
        metadata: {
          originalFile: absoluteFilePath,
          backupFile: absoluteBackupFilePath,
          operation: 'file_backup'
        }
      })

      return true
    } catch (error) {
      console.error('Error during file backup:', error)
      return false
    }
  }

  /**
   * List all backup files for a task
   */
  async listBackups(taskId: string, sessionId?: string): Promise<string[]> {
    const session = sessionId ? this.activeSessions.get(taskId) : null
    if (!session && !sessionId) {
      console.warn(`No active logging session for task ${taskId}`)
      return []
    }

    const effectiveSessionId = sessionId || session?.sessionId
    if (!effectiveSessionId) {
      console.warn(`No session ID available for listing backups`)
      return []
    }

    try {
      const backupDir = `~/.chaterm/backups/${taskId}`
      const listCommand = `ls -la ${backupDir} 2>/dev/null | grep -v "^total" | grep -v "^d" | awk '{print $9}' | grep -v "^\\.$" | grep -v "^\\.\\.$"`

      const result = await remoteSshExec(effectiveSessionId, listCommand)

      if (!result.success) {
        console.log(`No backups found for task ${taskId}`)
        return []
      }

      return result.output?.split('\n').filter((line) => line.trim().length > 0) || []
    } catch (error) {
      console.error('Error listing backups:', error)
      return []
    }
  }

  private createLogHeader(taskId: string, hostIp: string, username?: string): string {
    const timestamp = this.formatTimestamp(new Date())

    return `# Chaterm Agent Task Interaction Log
# Task ID: ${taskId}
# Host: ${hostIp}
# User: ${username || 'unknown'}
# Start Time: ${timestamp}
# Format: [timestamp] [type] content
# =========================================

`
  }

  private createLogFooter(startTime: number): string {
    const endTime = this.formatTimestamp(new Date())

    const duration = Math.round((Date.now() - startTime) / 1000)
    return `
# =========================================
# Session End Time: ${endTime}
# Total Duration: ${duration} seconds
# =========================================`
  }

  private formatLogEntry(log: AgentInteractionLog): string {
    const timestamp = this.formatTimestamp(new Date(log.timestamp))

    const metadataStr = log.metadata ? ` | ${JSON.stringify(log.metadata)}` : ''
    const ipStr = log.ip ? ` [${log.ip}]` : ''

    // Escape content for shell safety
    const safeContent = log.content.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')

    return `[${timestamp}] [${log.messageType}]${ipStr} ${safeContent}${metadataStr}`
  }
}
