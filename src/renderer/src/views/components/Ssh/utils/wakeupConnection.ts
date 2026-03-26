type ConnectDataLike = {
  uuid?: string
  wakeupSource?: string
  source?: string
  skipAssetLookup?: boolean
}

export function shouldSkipAssetLookup(connectData?: ConnectDataLike | null): boolean {
  if (!connectData) return false
  if (connectData.skipAssetLookup === true) return true

  const wakeupSource = String(connectData.wakeupSource || connectData.source || '').toLowerCase()
  if (wakeupSource.startsWith('xshell')) return true

  const uuid = String(connectData.uuid || '')
  if (uuid.startsWith('xshell-')) return true

  return false
}
