interface ConnectionCancellationApi {
  cancelKeyboardInteractive(id: string): void
  disconnect(params: { id: string }): Promise<{ status?: string } | undefined>
}

interface CancelConnectionOnUnmountOptions {
  api: ConnectionCancellationApi
  id: string
  isConnected: boolean
  isConnecting: boolean
  onDisconnectResult?: (result: { status?: string } | undefined) => void
  onDisconnectError?: (error: unknown) => void
}

export function createConnectionCancellationGuard(): { cancel: () => void; isCancelled: () => boolean } {
  let cancelled = false

  return {
    cancel: () => {
      cancelled = true
    },
    isCancelled: () => cancelled
  }
}

export function cancelConnectionOnUnmount({
  api,
  id,
  isConnected,
  isConnecting,
  onDisconnectResult,
  onDisconnectError
}: CancelConnectionOnUnmountOptions): void {
  if (!id || (!isConnected && !isConnecting)) {
    return
  }

  void api
    .disconnect({ id })
    .then((result) => onDisconnectResult?.(result))
    .catch((error: unknown) => {
      onDisconnectError?.(error)
    })
    .finally(() => {
      api.cancelKeyboardInteractive(id)
    })
}
