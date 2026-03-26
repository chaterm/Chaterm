type ProbeConnectionInfo = {
  id?: string
  source?: string
  wakeupSource?: string
  disablePostConnectProbe?: boolean
}

export function shouldSkipPostConnectProbe(connectionInfo?: ProbeConnectionInfo | null): boolean {
  if (!connectionInfo) return false
  if (connectionInfo.disablePostConnectProbe === true) return true

  const source = String(connectionInfo.wakeupSource || connectionInfo.source || '').toLowerCase()
  if (source.startsWith('xshell')) return true

  const id = String(connectionInfo.id || '')
  if (id.startsWith('xshell-') || id.includes(':xshell-')) return true

  return false
}
