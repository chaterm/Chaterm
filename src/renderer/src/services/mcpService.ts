export interface McpSettings {
  mcpServers: Record<string, ServerConfig>
}

export interface ServerConfig {
  type: 'stdio' | 'sse' | 'streamableHttp'
  disabled?: boolean
  autoApprove?: string[]
  timeout?: number
  // stdio specific
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  // http specific
  url?: string
  headers?: Record<string, string>
}

export class McpConfigService {
  private configPath: string | null = null

  // Get configuration file path
  async getConfigPath(): Promise<string> {
    if (!this.configPath) {
      this.configPath = await window.api.getMcpConfigPath()
    }
    return this.configPath
  }

  // Read configuration file raw content (for text editor)
  async readConfigFile(): Promise<string> {
    return await window.api.readMcpConfig()
  }

  // Write configuration file (for text editor and programmatic operations)
  async writeConfigFile(content: string): Promise<void> {
    await window.api.writeMcpConfig(content)
  }

  // Read configuration object
  async readConfig(): Promise<McpSettings> {
    const content = await this.readConfigFile()
    return JSON.parse(content)
  }

  // Write configuration object
  async writeConfig(config: McpSettings): Promise<void> {
    const content = JSON.stringify(config, null, 2)
    await this.writeConfigFile(content)
  }

  // Add server
  async addServer(name: string, config: ServerConfig): Promise<void> {
    const settings = await this.readConfig()
    if (settings.mcpServers[name]) {
      throw new Error(`Server "${name}" already exists`)
    }
    settings.mcpServers[name] = config
    await this.writeConfig(settings)
  }

  // Update server
  async updateServer(name: string, config: ServerConfig): Promise<void> {
    const settings = await this.readConfig()
    if (!settings.mcpServers[name]) {
      throw new Error(`Server "${name}" not found`)
    }
    settings.mcpServers[name] = config
    await this.writeConfig(settings)
  }

  // Delete server
  async deleteServer(name: string): Promise<void> {
    const settings = await this.readConfig()
    delete settings.mcpServers[name]
    await this.writeConfig(settings)
  }

  // Toggle server enable/disable status
  async toggleServerDisabled(name: string, disabled: boolean): Promise<void> {
    await window.api.toggleMcpServer(name, disabled)
  }

  // Toggle tool auto-approve
  async toggleToolAutoApprove(serverName: string, toolNames: string[], enabled: boolean): Promise<void> {
    const settings = await this.readConfig()
    const server = settings.mcpServers[serverName]
    if (!server) {
      throw new Error(`Server "${serverName}" not found`)
    }

    if (!server.autoApprove) {
      server.autoApprove = []
    }

    if (enabled) {
      // Add tools to auto-approve list
      toolNames.forEach((name) => {
        if (!server.autoApprove!.includes(name)) {
          server.autoApprove!.push(name)
        }
      })
    } else {
      // Remove tools from auto-approve list
      server.autoApprove = server.autoApprove.filter((name) => !toolNames.includes(name))
    }

    await this.writeConfig(settings)
  }
}

export const mcpConfigService = new McpConfigService()
