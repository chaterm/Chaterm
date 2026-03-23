// Copyright (c) 2025-present, chaterm.ai  All rights reserved.
// Stages user-picked files for agent read_file: allowed paths stay as-is; others copy into task offload.

import path from 'path'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import { ipcMain } from 'electron'
import { getOffloadDir } from '../../agent/core/offload'
import { getKnowledgeBaseRoot } from '../knowledgebase'
import { createLogger } from '../logging'

const logger = createLogger('stageChatAttachment')

/** Match AiTab upload limit in renderer */
export const MAX_CHAT_ATTACHMENT_BYTES = 1024 * 1024

export type StageChatAttachmentResult = { mode: 'as_is'; refPath: string } | { mode: 'offload'; refPath: string }

function isInsideDir(resolvedFile: string, resolvedDir: string): boolean {
  const normFile = path.resolve(resolvedFile)
  const normDir = path.resolve(resolvedDir)
  if (normFile === normDir) return true
  return normFile.startsWith(normDir + path.sep)
}

/** Align with Task.handleReadFileToolUse heuristic for KB paths */
function isInKnowledgeBaseSegment(resolvedPath: string): boolean {
  return resolvedPath.includes(`${path.sep}knowledgebase${path.sep}`)
}

function isAllowedWithoutCopy(taskId: string, srcResolved: string): boolean {
  const workspace = process.cwd()
  const offloadDir = getOffloadDir(taskId)
  const kbRoot = getKnowledgeBaseRoot()

  if (isInsideDir(srcResolved, workspace)) return true
  if (isInsideDir(srcResolved, offloadDir)) return true
  if (isInsideDir(srcResolved, kbRoot)) return true
  if (isInKnowledgeBaseSegment(srcResolved)) return true
  return false
}

/**
 * Copy file into task offload when outside allowed read roots; otherwise return absolute path for chip.
 */
export async function stageChatAttachment(taskId: string, srcAbsPath: string): Promise<StageChatAttachmentResult> {
  const trimmed = (srcAbsPath || '').trim()
  if (!taskId?.trim()) {
    throw new Error('taskId is required')
  }
  if (!trimmed) {
    throw new Error('srcAbsPath is required')
  }

  const srcResolved = path.resolve(trimmed)
  let stat
  try {
    stat = await fs.stat(srcResolved)
  } catch {
    throw new Error('Source file does not exist or is not accessible')
  }
  if (!stat.isFile()) {
    throw new Error('Source path is not a file')
  }
  if (stat.size > MAX_CHAT_ATTACHMENT_BYTES) {
    throw new Error(`File exceeds maximum size (${MAX_CHAT_ATTACHMENT_BYTES} bytes)`)
  }

  if (isAllowedWithoutCopy(taskId, srcResolved)) {
    return { mode: 'as_is', refPath: srcResolved }
  }

  const offloadDir = path.resolve(getOffloadDir(taskId))
  const uploadDir = path.join(offloadDir, 'user-uploads')
  await fs.mkdir(uploadDir, { recursive: true })

  const base = path.basename(srcResolved) || 'file'
  const destName = `${randomUUID()}-${base}`
  const destAbs = path.join(uploadDir, destName)
  const resolvedDest = path.resolve(destAbs)

  if (resolvedDest !== uploadDir && !resolvedDest.startsWith(uploadDir + path.sep)) {
    logger.error('[stageChatAttachment] Refusing unsafe destination', { resolvedDest, uploadDir })
    throw new Error('Invalid destination path')
  }

  await fs.copyFile(srcResolved, resolvedDest)

  const refPath = `offload/user-uploads/${destName}`
  logger.info('[stageChatAttachment] Copied to offload', { taskId, refPath })
  return { mode: 'offload', refPath }
}

export function registerStageChatAttachmentHandlers(): void {
  ipcMain.handle(
    'agent:stage-chat-attachment',
    async (_evt, payload: { taskId?: string; srcAbsPath?: string }): Promise<StageChatAttachmentResult> => {
      const taskId = payload?.taskId ?? ''
      const srcAbsPath = payload?.srcAbsPath ?? ''
      return await stageChatAttachment(taskId, srcAbsPath)
    }
  )
}
