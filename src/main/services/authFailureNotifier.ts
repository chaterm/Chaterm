import { BrowserWindow } from 'electron'

const logger = createLogger('auth')

const IPC_CHANNEL = 'auth:token-expired'

/**
 * Singleton that broadcasts auth failures to all renderer windows.
 * Deduplicates: only the first call per session fires; reset() re-arms it
 * (e.g. after a successful re-login).
 */
class AuthFailureNotifier {
  private static _instance: AuthFailureNotifier | null = null
  private fired = false

  static getInstance(): AuthFailureNotifier {
    if (!AuthFailureNotifier._instance) {
      AuthFailureNotifier._instance = new AuthFailureNotifier()
    }
    return AuthFailureNotifier._instance
  }

  /** Notify all renderer windows once. Subsequent calls are no-ops until reset(). */
  notify(): void {
    if (this.fired) return
    this.fired = true
    logger.warn('Auth failure: broadcasting token-expired to all windows')
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNEL)
      }
    }
  }

  /** Re-arm after a successful re-login so the next failure can fire again. */
  reset(): void {
    this.fired = false
  }
}

export const authFailureNotifier = AuthFailureNotifier.getInstance()
