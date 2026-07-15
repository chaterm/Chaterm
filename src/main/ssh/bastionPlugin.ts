import type { IpcMainInvokeEvent } from 'electron'
import { capabilityRegistry, BastionErrorCode, buildBastionError } from './capabilityRegistry'
const bastionLogger = createLogger('ssh')

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

export async function connectBastionByType(sshType: string | undefined, connectionInfo: any, event: IpcMainInvokeEvent): Promise<any | null> {
  if (!sshType || sshType === 'ssh' || sshType === 'jumpserver') return null

  // Check if sshType matches a registered plugin-based bastion
  const bastionDefinition = capabilityRegistry.getBastionDefinition(sshType || '')
  const bastionCapability = capabilityRegistry.getBastion(sshType || '')

  if (!bastionDefinition) {
    bastionLogger.error('Bastion definition missing for type', { event: 'ssh.bastion.missing', sshType })
    return buildBastionError(
      BastionErrorCode.DEFINITION_MISSING,
      `Bastion plugin '${sshType}' is not properly installed. Please check plugin installation.`
    )
  }

  if (bastionCapability) {
    // Route to plugin-based bastion connection via capability registry
    bastionLogger.info('Routing to plugin-based bastion', { event: 'ssh.bastion.connect', sshType })
    const requestedSessionId = typeof connectionInfo?.id === 'string' ? connectionInfo.id : ''
    if (requestedSessionId) {
      registerBastionSessionType(requestedSessionId, sshType)
      bastionLogger.info('Registered pending bastion session', {
        event: 'ssh.bastion.session.pending',
        sshType,
        sessionId: requestedSessionId
      })
    }
    try {
      const result = await bastionCapability.connect(connectionInfo, event)
      if (result?.status === 'connected') {
        if (requestedSessionId && getBastionSessionType(requestedSessionId) !== sshType) {
          bastionLogger.warn('Bastion connection completed after cancellation', {
            event: 'ssh.bastion.connect.cancelled_late',
            sshType,
            sessionId: requestedSessionId
          })
          await bastionCapability.disconnect({ id: requestedSessionId })
          return buildBastionError(BastionErrorCode.CONNECT_FAILED, 'Bastion connection cancelled')
        }
        const sessionId = connectionInfo.id || result.sessionId
        if (sessionId) {
          registerBastionSessionType(sessionId, sshType!)
          bastionLogger.debug('Registered bastion session type', { event: 'ssh.bastion.session', sshType, sessionId })
        }
      } else if (result?.status !== 'mfa_required' && requestedSessionId && getBastionSessionType(requestedSessionId) === sshType) {
        deleteBastionSessionType(requestedSessionId)
        bastionLogger.info('Removed pending bastion session after connect result', {
          event: 'ssh.bastion.session.pending.cleared',
          sshType,
          sessionId: requestedSessionId,
          status: typeof result?.status === 'string' ? result.status : 'unknown'
        })
      }
      return result
    } catch (error: unknown) {
      if (requestedSessionId && getBastionSessionType(requestedSessionId) === sshType) {
        deleteBastionSessionType(requestedSessionId)
      }
      bastionLogger.warn('Bastion connection failed', {
        event: 'ssh.bastion.connect.failed',
        sshType,
        sessionId: requestedSessionId || undefined,
        errorName: error instanceof Error ? error.name : typeof error
      })
      const errorMessage = error instanceof Error ? error.message : String(error)
      return buildBastionError(BastionErrorCode.CONNECT_FAILED, errorMessage)
    }
  }

  // Definition exists but capability missing - plugin not properly installed
  bastionLogger.error('Bastion capability missing for type', { event: 'ssh.bastion.capability.missing', sshType })
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

export async function resizeBastionSession(id: string, cols: number, rows: number): Promise<{ status: string; message?: string } | null> {
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

export function writeBastionSession(id: string, data: string, marker?: string, lineCommand?: string, isBinary?: boolean): boolean {
  const bastionType = getBastionSessionType(id)
  if (!bastionType) return false

  const capability = capabilityRegistry.getBastion(bastionType)
  if (!capability) {
    bastionLogger.warn('Attempting to write to non-existent bastion capability', { event: 'ssh.bastion.write.notfound', bastionType })
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
    bastionLogger.warn('Bastion disconnect capability unavailable', {
      event: 'ssh.bastion.disconnect.capability_missing',
      sshType: bastionType,
      sessionId: id
    })
    return { status: 'error', message: `${bastionType} capability not available` }
  }

  bastionLogger.info('Bastion disconnect started', {
    event: 'ssh.bastion.disconnect.start',
    sshType: bastionType,
    sessionId: id
  })
  deleteBastionSessionType(id)
  try {
    await capability.disconnect({ id })
    bastionLogger.info('Bastion disconnect completed', {
      event: 'ssh.bastion.disconnect.success',
      sshType: bastionType,
      sessionId: id
    })
    return { status: 'success', message: `${bastionType} connection disconnected` }
  } catch (error: unknown) {
    bastionLogger.warn('Bastion disconnect failed', {
      event: 'ssh.bastion.disconnect.failed',
      sshType: bastionType,
      sessionId: id,
      errorName: error instanceof Error ? error.name : typeof error
    })
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
