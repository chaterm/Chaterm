import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { getUserDataPath } from '../../../config/edition'
import { createLogger } from '../../../services/logging'

const logger = createLogger('offload')

/**
 * Default threshold for offloading tool output to file (in characters)
 * If output exceeds this threshold, it will be written to a file instead of stored inline
 */
const DEFAULT_OFFLOAD_THRESHOLD = 4096 // 4KB
const DEFAULT_OFFLOAD_LINE_THRESHOLD = 50

/**
 * Configuration for offload service
 */
export interface OffloadConfig {
  /** Threshold in characters to trigger offloading */
  threshold: number
  /** Threshold in lines to trigger offloading */
  lineThreshold: number
}

let offloadConfig: OffloadConfig = {
  threshold: DEFAULT_OFFLOAD_THRESHOLD,
  lineThreshold: DEFAULT_OFFLOAD_LINE_THRESHOLD
}

/**
 * Update offload configuration
 */
export function setOffloadConfig(config: Partial<OffloadConfig>): void {
  offloadConfig = { ...offloadConfig, ...config }
}

/**
 * Get current offload configuration
 */
export function getOffloadConfig(): OffloadConfig {
  return { ...offloadConfig }
}

/**
 * Get the offload directory for a specific task
 * Directory structure: {userData}/agent-tools/{taskId}/
 */
export function getOffloadDir(taskId: string): string {
  const userDataPath = getUserDataPath()
  return path.join(userDataPath, 'agent-tools', taskId)
}

/**
 * Ensure offload directory exists for a task
 */
async function ensureOffloadDir(taskId: string): Promise<string> {
  const offloadDir = getOffloadDir(taskId)
  try {
    await fs.mkdir(offloadDir, { recursive: true })
    return offloadDir
  } catch (error) {
    logger.error('[Offload] Failed to create offload directory', { taskId, error })
    throw error
  }
}

/**
 * Generate a unique filename for tool output using a random UUID.
 * Format: {uuid}.txt (e.g. 550e8400-e29b-41d4-a716-446655440000.txt)
 */
function generateOffloadFilename(): string {
  return `${crypto.randomUUID()}.txt`
}

/**
 * Result of writing tool output to offload file
 */
export interface WriteOffloadResult {
  /** Absolute path to the offload file */
  path: string
  /** Relative path within task offload directory */
  relativePath: string
  /** Size of written content in bytes */
  size: number
}

/**
 * Write tool output to offload file
 * @param taskId Task ID
 * @param toolDescription Description of the tool (e.g., "execute_command for 'ls -la'")
 * @param content Content to write
 * @returns Offload file paths and metadata
 */
export async function writeToolOutput(taskId: string, toolDescription: string, content: string): Promise<WriteOffloadResult> {
  try {
    const offloadDir = await ensureOffloadDir(taskId)
    const filename = generateOffloadFilename()
    const absolutePath = path.join(offloadDir, filename)

    await fs.writeFile(absolutePath, content, 'utf-8')
    const stats = await fs.stat(absolutePath)

    logger.info('[Offload] Wrote tool output to file', {
      taskId,
      filename,
      size: stats.size
    })

    return {
      path: absolutePath,
      relativePath: filename,
      size: stats.size
    }
  } catch (error) {
    logger.error('[Offload] Failed to write tool output', { taskId, toolDescription, error })
    throw error
  }
}

/**
 * Read content from offload file
 * @param taskId Task ID
 * @param pathOrRelativePath Absolute path or relative path within task offload directory
 * @returns File content
 */
export async function readOffloadedFile(taskId: string, pathOrRelativePath: string): Promise<string> {
  try {
    const offloadDir = getOffloadDir(taskId)
    const rawPath = path.isAbsolute(pathOrRelativePath) ? pathOrRelativePath : path.join(offloadDir, pathOrRelativePath)
    const absolutePath = path.resolve(rawPath)
    const baseDir = path.resolve(offloadDir)
    if (absolutePath !== baseDir && !absolutePath.startsWith(baseDir + path.sep)) {
      logger.error('[Offload] Path traversal denied', { taskId, pathOrRelativePath, absolutePath })
      throw new Error('Access denied: path is outside task offload directory')
    }

    const content = await fs.readFile(absolutePath, 'utf-8')

    logger.debug('[Offload] Read offloaded file', {
      taskId,
      path: absolutePath,
      size: content.length
    })

    return content
  } catch (error) {
    logger.error('[Offload] Failed to read offloaded file', {
      taskId,
      pathOrRelativePath,
      error
    })
    throw error
  }
}

/**
 * Check if content should be offloaded based on threshold
 * @param content Content to check
 * @returns true if content should be offloaded
 */
export function shouldOffload(content: string): boolean {
  if (content.length > offloadConfig.threshold) {
    return true
  }

  const lineCount = content.split(/\r\n|\r|\n/).length
  return lineCount > offloadConfig.lineThreshold
}

/**
 * Delete offload directory for a task
 * @param taskId Task ID
 */
export async function deleteOffloadDir(taskId: string): Promise<void> {
  try {
    const offloadDir = getOffloadDir(taskId)
    await fs.rm(offloadDir, { recursive: true, force: true })
    logger.info('[Offload] Deleted offload directory', { taskId })
  } catch (error) {
    logger.error('[Offload] Failed to delete offload directory', { taskId, error })
    throw error
  }
}

/**
 * List all files in task offload directory
 * @param taskId Task ID
 * @returns Array of filenames
 */
export async function listOffloadFiles(taskId: string): Promise<string[]> {
  try {
    const offloadDir = getOffloadDir(taskId)
    const files = await fs.readdir(offloadDir)
    return files
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    logger.error('[Offload] Failed to list offload files', { taskId, error })
    throw error
  }
}
