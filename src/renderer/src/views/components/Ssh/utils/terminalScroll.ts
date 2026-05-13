type TerminalScrollBuffer = {
  buffer?: {
    active?: {
      baseY?: number
      viewportY?: number
    }
  }
}

export const shouldAutoScrollAfterTerminalWrite = (terminal: TerminalScrollBuffer | null | undefined): boolean => {
  const buffer = terminal?.buffer?.active
  if (!buffer) return true

  const { baseY, viewportY } = buffer
  if (typeof baseY !== 'number' || typeof viewportY !== 'number') return true

  return viewportY >= baseY
}

export const shouldAutoScrollAfterTerminalStateUpdate = ({
  isUserCall,
  shouldAutoScrollAfterWrite
}: {
  isUserCall: boolean
  shouldAutoScrollAfterWrite: boolean
}): boolean => !isUserCall && shouldAutoScrollAfterWrite
