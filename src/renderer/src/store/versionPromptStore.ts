import { defineStore } from 'pinia'

const logger = createRendererLogger('store.versionPrompt')

export interface VersionPromptInfo {
  shouldShow: boolean
  version: string
  releaseDate?: string
  highlights: string[]
  releaseNotesUrl?: string
  isFirstInstall: boolean
}

export const useVersionPromptStore = defineStore('versionPrompt', {
  state: () => ({
    prompt: null as VersionPromptInfo | null,
    modalVisible: false,
    loading: false
  }),
  getters: {
    previewHighlights: (state): string[] => state.prompt?.highlights?.slice(0, 3) || []
  },
  actions: {
    async loadPrompt(): Promise<void> {
      this.loading = true
      try {
        const result = await window.api.getVersionPrompt()

        if (result?.shouldShow) {
          this.prompt = {
            ...result,
            highlights: result.highlights || []
          }
          this.modalVisible = true
        } else {
          this.clearPrompt()
        }
      } catch (error) {
        logger.error('Failed to load prompt', { error: error })
        this.clearPrompt()
      } finally {
        this.loading = false
      }
    },
    async acknowledge(): Promise<void> {
      if (!this.prompt) return
      try {
        await window.api.dismissVersionPrompt()
      } catch (error) {
        logger.error('Failed to acknowledge prompt', { error: error })
      } finally {
        this.clearPrompt()
      }
    },
    clearPrompt(): void {
      this.modalVisible = false
      this.prompt = null
    },
    openModal(): void {
      if (this.prompt) {
        this.modalVisible = true
      }
    }
  }
})
