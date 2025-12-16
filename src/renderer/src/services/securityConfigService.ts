export class SecurityConfigService {
  private configPath: string | null = null

  /**
   * Get config file path
   */
  async getConfigPath(): Promise<string> {
    if (!this.configPath) {
      this.configPath = await window.api.getSecurityConfigPath()
    }
    return this.configPath || ''
  }

  /**
   * Read config file raw content (for text editor)
   * Note: Security config file may contain JSON comments, need to handle when reading
   */
  async readConfigFile(): Promise<string> {
    try {
      const content = await window.api.readSecurityConfig()

      if (!content || content.trim() === '') {
        console.warn('Security config file is empty or does not exist')
        // Return default JSON structure
        return JSON.stringify(
          {
            security: {
              enableCommandSecurity: true,
              enableStrictMode: false,
              blacklistPatterns: [],
              whitelistPatterns: [],
              dangerousCommands: [],
              maxCommandLength: 10000,
              securityPolicy: {
                blockCritical: true,
                askForMedium: true,
                askForHigh: true,
                askForBlacklist: false
              }
            }
          },
          null,
          2
        )
      }

      // Remove comments so Monaco Editor can properly validate JSON
      const cleaned = this.removeComments(content)

      // If content is empty or invalid after removing comments, try returning original content
      if (!cleaned || cleaned.trim() === '') {
        console.warn('After removing comments, content is empty, returning original')
        return content
      }

      // Validate if it's valid JSON
      try {
        JSON.parse(cleaned)
        return cleaned
      } catch {
        // JSON is invalid, return original content (user may need to manually fix)
        console.warn('Cleaned content is not valid JSON, returning original')
        return content
      }
    } catch (error) {
      console.error('Failed to read security config:', error)
      throw error
    }
  }

  /**
   * Write config file
   */
  async writeConfigFile(content: string): Promise<void> {
    await window.api.writeSecurityConfig(content)
  }

  /**
   * File change listener (optional)
   */
  onFileChanged(callback: (newContent: string) => void): (() => void) | undefined {
    if (window.api?.onSecurityConfigFileChanged) {
      return window.api.onSecurityConfigFileChanged((newContent: string) => {
        // Callback after removing comments
        const cleanedContent = this.removeComments(newContent)
        callback(cleanedContent)
      })
    }
    return undefined
  }

  /**
   * Remove JSON comments
   * Supports line comments (//) and block comments
   * Reference SecurityConfigManager implementation
   */
  private removeComments(jsonString: string): string {
    if (!jsonString || !jsonString.trim()) {
      return jsonString
    }
    // Remove single-line comments // (preserve // in strings)
    let cleaned = jsonString.replace(/\/\/.*$/gm, '')

    // Remove multi-line comments /* */
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '')

    // Remove empty lines
    cleaned = cleaned.replace(/^\s*[\r\n]/gm, '')

    return cleaned.trim()
  }
}

export const securityConfigService = new SecurityConfigService()
