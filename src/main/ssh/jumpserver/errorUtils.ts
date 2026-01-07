export interface JumpServerErrorPayload {
  messageKey?: string
  messageParams?: Record<string, string | number>
}

export interface JumpServerErrorResponse extends JumpServerErrorPayload {
  status: 'error'
  message: string
}

export const buildErrorResponse = (error: unknown): JumpServerErrorResponse => {
  const err = error as { message?: string } & JumpServerErrorPayload
  return {
    status: 'error',
    message: err?.message || String(error),
    messageKey: err?.messageKey,
    messageParams: err?.messageParams
  }
}
