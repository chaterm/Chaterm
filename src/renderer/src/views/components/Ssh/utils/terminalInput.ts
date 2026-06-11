export const NATIVE_PASTE_SUPPRESS_MS = 150

export const shouldSuppressCtrlVAfterNativePaste = (lastNativePasteAt: number, now = Date.now()): boolean => {
  return lastNativePasteAt > 0 && now - lastNativePasteAt < NATIVE_PASTE_SUPPRESS_MS
}

export const resolveAliasExpansion = (
  command: string,
  aliasStatus: number | undefined,
  getAliasCommand: (name: string) => string | null
): string | null => {
  if (aliasStatus !== 1 || !command) {
    return null
  }

  const replacement = getAliasCommand(command)
  if (!replacement || replacement === command) {
    return null
  }

  return replacement
}
