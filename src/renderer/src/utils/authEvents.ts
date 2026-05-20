const logger = createRendererLogger('authEvents')

export const TOKEN_EXPIRED_EVENT = 'auth:token-expired'

export function notifyTokenExpired(): void {
  if (typeof window === 'undefined') return
  logger.warn('HTTP 401 received, notifying app auth handler')
  window.dispatchEvent(new Event(TOKEN_EXPIRED_EVENT))
}
