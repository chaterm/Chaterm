

const logger = createRendererLogger('service.keywordHighlightConfig')

export class KeywordHighlightConfigService {
  private configPath: string | null = null

  /**
   * Get config file path
   */
  async getConfigPath(): Promise<string> {
    if (!this.configPath) {
      this.configPath = await window.api.getKeywordHighlightConfigPath()
    }
    return this.configPath || ''
  }

  /**
   * Read config file raw content (for text editor)
   */
  async readConfigFile(): Promise<string> {
    try {
      const content = await window.api.readKeywordHighlightConfig()

      if (!content || content.trim() === '') {
        logger.warn('Keyword highlight config file is empty or does not exist')
        // Return default JSON structure from keyword-highlight.json
        return JSON.stringify(
          {
            'keyword-highlight': {
              enabled: true,
              applyTo: {
                output: true,
                input: false
              },
              rules: []
            }
          },
          null,
          2
        )
      }

      // Validate if it's valid JSON
      try {
        JSON.parse(content)
        return content
      } catch {
        // JSON is invalid, return original content (user may need to manually fix)
        logger.warn('Content is not valid JSON, returning original')
        return content
      }
    } catch (error) {
      logger.error('Failed to read keyword highlight config', { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  /**
   * Write config file
   */
  async writeConfigFile(content: string): Promise<void> {
    await window.api.writeKeywordHighlightConfig(content)
  }

  /**
   * File change listener (optional)
   */
  onFileChanged(callback: (newContent: string) => void): (() => void) | undefined {
    if (window.api?.onKeywordHighlightConfigFileChanged) {
      return window.api.onKeywordHighlightConfigFileChanged(callback)
    }
    return undefined
  }
}

export const keywordHighlightConfigService = new KeywordHighlightConfigService()
