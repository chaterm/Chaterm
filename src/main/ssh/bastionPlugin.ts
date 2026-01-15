import type { IpcMainInvokeEvent } from 'electron'
import { capabilityRegistry, BastionErrorCode, buildBastionError } from './capabilityRegistry'

const bastionSessionTypes = new Map<string, string>()

export const registerBastionSessionType = (id: string, type: string) => {
  bastionSessionTypes.set(id, type)
}

export const getBastionSessionType = (id: string) => {
  return bastionSessionTypes.get(id)
}

export const deleteBastionSessionType = (id: string) => {
  bastionSessionTypes.delete(id)
}

export async function connectBastionByType(
  sshType: string | undefined,
  connectionInfo: any,
  event: IpcMainInvokeEvent
): Promise<any | null> {
  if (!sshType || sshType === 'ssh' || sshType === 'jumpserver') return null

  if (sshType === 'qizhi') {
    // Route to Qizhi bastion host connection via capability registry
    // Note: This specific branch is kept for backwards compatibility
    // New plugin-based bastions should use the generic routing below
    const qizhiDefinition = capabilityRegistry.getBastionDefinition('qizhi')
    if (!qizhiDefinition) {
      console.error(`[SSH] Bastion definition missing for 'qizhi'. Plugin may not be installed.`)
      return buildBastionError(
        BastionErrorCode.DEFINITION_MISSING,
        `Bastion plugin 'qizhi' is not properly installed. Please check plugin installation.`
      )
    }
    const qizhiCapability = capabilityRegistry.getBastion('qizhi')
    if (qizhiCapability) {
      try {
        const result = await qizhiCapability.connect(connectionInfo, event)
        if (result?.status === 'connected') {
          const sessionId = connectionInfo.id || result.sessionId
          if (sessionId) {
            registerBastionSessionType(sessionId, 'qizhi')
          }
        }
        return result
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return buildBastionError(BastionErrorCode.CONNECT_FAILED, errorMessage)
      }
    }
    return buildBastionError(BastionErrorCode.CAPABILITY_NOT_FOUND, 'Qizhi plugin not installed')
  }

  // Check if sshType matches a registered plugin-based bastion
  const bastionDefinition = capabilityRegistry.getBastionDefinition(sshType || '')
  const bastionCapability = capabilityRegistry.getBastion(sshType || '')

  if (!bastionDefinition) {
    console.error(`[SSH] Bastion definition missing for '${sshType}'. Plugin may not be installed.`)
    return buildBastionError(
      BastionErrorCode.DEFINITION_MISSING,
      `Bastion plugin '${sshType}' is not properly installed. Please check plugin installation.`
    )
  }

  if (bastionCapability) {
    // Route to plugin-based bastion connection via capability registry
    console.log(`[SSH] Routing to plugin-based bastion: ${sshType}`)
    try {
      const result = await bastionCapability.connect(connectionInfo, event)
      if (result?.status === 'connected') {
        const sessionId = connectionInfo.id || result.sessionId
        if (sessionId) {
          registerBastionSessionType(sessionId, sshType!)
          console.log(`[SSH] Registered bastion session type: ${sshType} for session: ${sessionId}`)
        }
      }
      return result
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return buildBastionError(BastionErrorCode.CONNECT_FAILED, errorMessage)
    }
  }

  // Definition exists but capability missing - plugin not properly installed
  console.error(`[SSH] Bastion definition found for '${sshType}' but capability is missing. Plugin may not be installed.`)
  return buildBastionError(
    BastionErrorCode.CAPABILITY_NOT_FOUND,
    `Bastion plugin '${sshType}' is not properly installed. Please check plugin installation.`
  )
}

export async function shellBastionSession(
  event: IpcMainInvokeEvent,
  id: string,
  terminalType?: string
): Promise<{ status: string; message?: string } | null> {
  const bastionType = getBastionSessionType(id)
  if (!bastionType) return null

  const capability = capabilityRegistry.getBastion(bastionType)
  if (!capability) {
    return { status: 'error', message: `${bastionType} capability not available` }
  }

  return capability.shell(event, { id, terminalType })
}

export async function resizeBastionSession(
  id: string,
  cols: number,
  rows: number
): Promise<{ status: string; message?: string } | null> {
  const bastionType = getBastionSessionType(id)
  if (!bastionType) return null

  const capability = capabilityRegistry.getBastion(bastionType)
  if (!capability) {
    return { status: 'error', message: `${bastionType} capability not available` }
  }

  try {
    await capability.resize({ id, rows, cols })
    return { status: 'success', message: `${bastionType} window size set to ${cols}x${rows}` }
  } catch (error: unknown) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

export function writeBastionSession(
  id: string,
  data: string,
  marker?: string,
  lineCommand?: string,
  isBinary?: boolean
): boolean {
  const bastionType = getBastionSessionType(id)
  if (!bastionType) return false

  const capability = capabilityRegistry.getBastion(bastionType)
  if (!capability) {
    console.warn('Attempting to write to non-existent bastion capability:', bastionType)
    return true
  }

  capability.write({ id, data, marker, lineCommand, isBinary })
  return true
}

export async function disconnectBastionSession(id: string): Promise<{ status: string; message?: string } | null> {
  const bastionType = getBastionSessionType(id)
  if (!bastionType) return null

  const capability = capabilityRegistry.getBastion(bastionType)
  if (!capability) {
    return { status: 'error', message: `${bastionType} capability not available` }
  }

  try {
    await capability.disconnect({ id })
    deleteBastionSessionType(id)
    return { status: 'success', message: `${bastionType} connection disconnected` }
  } catch (error: unknown) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
