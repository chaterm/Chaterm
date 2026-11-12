import { defineStore } from 'pinia'
import { isEnterpriseDeployEnabled } from '@/utils/edition'

const logger = createRendererLogger('store.update')

const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const STATUS_ERROR = -1
const STATUS_DOWNLOADED = 4
const DISMISSED_VERSION_KEY = 'update-card-dismissed-version'

type UpdatePhase = 'idle' | 'downloading' | 'ready'

let recheckTimer: ReturnType<typeof setInterval> | undefined
let listenerRegistered = false

export const useUpdateStore = defineStore('update', {
  state: () => ({
    phase: 'idle' as UpdatePhase,
    version: '',
    cardVisible: false,
    dismissedVersion: localStorage.getItem(DISMISSED_VERSION_KEY)
  }),
  actions: {
    start(): void {
      if (isEnterpriseDeployEnabled() || listenerRegistered) return
      listenerRegistered = true

      window.api.autoUpdate((params: { status?: number; version?: string }) => {
        if (params?.status === STATUS_DOWNLOADED) {
          this.phase = 'ready'
          this.version = params.version || this.version
          this.cardVisible = this.version !== this.dismissedVersion
        } else if (params?.status === STATUS_ERROR && this.phase === 'downloading') {
          this.phase = 'idle'
        }
      })

      void this.check()
      recheckTimer = setInterval(() => void this.check(), RECHECK_INTERVAL_MS)
    },
    async check(): Promise<void> {
      if (this.phase !== 'idle') return

      try {
        const result = await window.api.checkUpdate()
        if (!result?.isUpdateAvailable) {
          logger.info('No update available')
          return
        }
        this.phase = 'downloading'
        this.version = result.updateInfo?.version || ''
        logger.info('Update available, starting download', { version: this.version })
        await window.api.download()
      } catch (error) {
        this.phase = 'idle'
        logger.error('Failed to check or download update', { error: error })
      }
    },
    install(): void {
      if (isEnterpriseDeployEnabled() || this.phase !== 'ready') return
      void window.api.quitAndInstall()
    },
    dismissCard(): void {
      this.cardVisible = false
      this.dismissedVersion = this.version
      localStorage.setItem(DISMISSED_VERSION_KEY, this.version)
    },
    stop(): void {
      if (recheckTimer) clearInterval(recheckTimer)
      recheckTimer = undefined
      listenerRegistered = false
    }
  }
})
