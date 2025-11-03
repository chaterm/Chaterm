export class SecurityConfigService {
  private configPath: string | null = null

  /**
   * 获取配置文件路径
   */
  async getConfigPath(): Promise<string> {
    if (!this.configPath) {
      this.configPath = await window.api.getSecurityConfigPath()
    }
    return this.configPath || ''
  }

  /**
   * 读取配置文件原始内容（用于文本编辑器）
   * 注意：安全配置文件可能包含 JSON 注释，需要在读取时处理
   */
  async readConfigFile(): Promise<string> {
    try {
      const content = await window.api.readSecurityConfig()

      if (!content || content.trim() === '') {
        console.warn('Security config file is empty or does not exist')
        // 返回默认的 JSON 结构
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

      // 移除注释以便 Monaco Editor 能够正确验证 JSON
      const cleaned = this.removeComments(content)

      // 如果移除注释后内容为空或无效，尝试返回原始内容
      if (!cleaned || cleaned.trim() === '') {
        console.warn('After removing comments, content is empty, returning original')
        return content
      }

      // 验证是否为有效 JSON
      try {
        JSON.parse(cleaned)
        return cleaned
      } catch {
        // JSON 无效，返回原始内容（可能用户需要手动修复）
        console.warn('Cleaned content is not valid JSON, returning original')
        return content
      }
    } catch (error) {
      console.error('Failed to read security config:', error)
      throw error
    }
  }

  /**
   * 写入配置文件
   */
  async writeConfigFile(content: string): Promise<void> {
    await window.api.writeSecurityConfig(content)
  }

  /**
   * 文件变更监听器（可选）
   */
  onFileChanged(callback: (newContent: string) => void): (() => void) | undefined {
    if (window.api?.onSecurityConfigFileChanged) {
      return window.api.onSecurityConfigFileChanged((newContent: string) => {
        // 移除注释后回调
        const cleanedContent = this.removeComments(newContent)
        callback(cleanedContent)
      })
    }
    return undefined
  }

  /**
   * 移除 JSON 注释
   * 支持行注释 (//) 和块注释
   * 参考 SecurityConfigManager 的实现方式
   */
  private removeComments(jsonString: string): string {
    if (!jsonString || !jsonString.trim()) {
      return jsonString
    }
    // 移除单行注释 //（保留字符串中的 //）
    let cleaned = jsonString.replace(/\/\/.*$/gm, '')

    // 移除多行注释 /* */
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '')

    // 移除空行
    cleaned = cleaned.replace(/^\s*[\r\n]/gm, '')

    return cleaned.trim()
  }
}

export const securityConfigService = new SecurityConfigService()
