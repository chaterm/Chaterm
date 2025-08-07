import { _electron as electron, ElectronApplication, Page } from 'playwright'
import path from 'path'

/**
 * Electron test helper class
 */
export class ElectronHelper {
  public app: ElectronApplication | null = null
  public window: Page | null = null

  /**
   * Launch the Electron application
   */
  async launch(): Promise<void> {
    // Ensure the path is correct
    const appPath = path.join(__dirname, '../../out/main/index.js')
    console.log('Launching Electron app from:', appPath)

    // Check if the file exists
    const fs = require('fs')
    if (!fs.existsSync(appPath)) {
      throw new Error(`Electron app not found at: ${appPath}`)
    }

    this.app = await electron.launch({
      args: [appPath],
      // Extra options for development environment if needed
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_IS_DEV: '0'
      },
      recordVideo: {
        dir: './tests/videos',
        size: {
          width: 3840,
          height: 2076
        }
      }
    })

    // Get the first window
    this.window = await this.app.firstWindow()

    // Wait for the application to finish loading
    await this.window.waitForLoadState('domcontentloaded')

    // Set a larger timeout if needed
    // this.window.setDefaultTimeout(30000)
  }

  /**
   * Close the application
   */
  async close(): Promise<void> {
    if (this.app) {
      await this.app.close()
      this.app = null
      this.window = null
    }
  }

  /**
   * Take a screenshot and save it
   */
  async screenshot(name: string): Promise<void> {
    if (this.window) {
      await this.window.screenshot({
        path: `tests/screenshots/${name}.png`,
        fullPage: true
      })
    }
  }

  /**
   * Wait for an element to be visible
   */
  async waitForElement(selector: string, timeout: number = 10000): Promise<void> {
    if (this.window) {
      await this.window.waitForSelector(selector, { timeout })
    }
  }

  /**
   * Click an element
   */
  async click(selector: string): Promise<void> {
    if (this.window) {
      await this.window.click(selector)
    }
  }

  /**
   * Fill text into an input
   */
  async fill(selector: string, text: string): Promise<void> {
    if (this.window) {
      await this.window.fill(selector, text)
    }
  }

  /**
   * Press a key
   */
  async press(key: string): Promise<void> {
    if (this.window) {
      await this.window.keyboard.press(key)
    }
  }

  /**
   * Wait for text to appear
   */
  async waitForText(text: string, timeout: number = 10000): Promise<void> {
    if (this.window) {
      await this.window.waitForFunction((searchText) => document.body.textContent?.includes(searchText), text, { timeout })
    }
  }

  /**
   * Get text content from an element
   */
  async getText(selector: string): Promise<string> {
    if (this.window) {
      return (await this.window.textContent(selector)) || ''
    }
    return ''
  }

  /**
   * Check if an element is visible
   */
  async isElementVisible(selector: string): Promise<boolean> {
    if (this.window) {
      try {
        return await this.window.isVisible(selector)
      } catch {
        return false
      }
    }
    return false
  }

  /**
   * Simulate creating an SSH connection
   */
  async createSSHConnection(config: { name: string; host: string; port?: number; username: string; password?: string }): Promise<void> {
    if (!this.window) return

    // Click the new connection button (adjust selector as needed)
    await this.click('[data-testid="new-connection-btn"]')

    // Fill in connection information
    await this.fill('[data-testid="connection-name-input"]', config.name)
    await this.fill('[data-testid="host-input"]', config.host)

    if (config.port) {
      await this.fill('[data-testid="port-input"]', config.port.toString())
    }

    await this.fill('[data-testid="username-input"]', config.username)

    if (config.password) {
      await this.fill('[data-testid="password-input"]', config.password)
    }

    // Click the connect button
    await this.click('[data-testid="connect-btn"]')
  }

  /**
   * Execute a command in the terminal
   */
  async executeCommand(command: string): Promise<void> {
    if (!this.window) return

    // Click the terminal area to ensure focus
    await this.click('[data-testid="terminal-container"]')

    // Type the command
    await this.window.keyboard.type(command)

    // Press Enter to execute
    await this.press('Enter')
  }

  /**
   * Send an AI message
   */
  async sendAIMessage(message: string): Promise<void> {
    if (!this.window) return

    // Switch to the AI chat tab (if needed)
    await this.click('[data-testid="ai-chat-tab"]')

    // Fill in the message input box
    await this.fill('[data-testid="ai-message-input"]', message)

    // Click the send button or press Enter
    try {
      await this.click('[data-testid="send-message-btn"]')
    } catch {
      // If there is no send button, try pressing Enter
      await this.window.keyboard.press('Enter')
    }
  }

  /**
   * Wait for AI response
   */
  async waitForAIResponse(timeout: number = 15000): Promise<string> {
    if (!this.window) return ''

    try {
      // Wait for new content to appear in the AI response area
      await this.window.waitForFunction(
        () => {
          const responses = document.querySelectorAll('[data-testid="ai-message"]')
          return responses.length > 0
        },
        { timeout }
      )

      // Get the latest AI response
      const responses = await this.window.$$('[data-testid="ai-message"]')
      if (responses.length > 0) {
        const lastResponse = responses[responses.length - 1]
        return (await lastResponse.textContent()) || ''
      }
    } catch (error) {
      console.warn('Timeout waiting for AI response:', error)
    }

    return ''
  }

  /**
   * Get terminal output
   */
  async getTerminalOutput(): Promise<string> {
    if (!this.window) return ''

    try {
      return await this.getText('[data-testid="terminal-output"]')
    } catch {
      // If the specific selector does not exist, try a generic selector
      return await this.getText('.terminal-output, .xterm-screen, .terminal-container')
    }
  }

  /**
   * Check if the application has finished loading
   */
  async waitForAppReady(): Promise<void> {
    if (!this.window) return

    // Wait for the main UI element to appear
    await this.waitForElement('[data-testid="main-container"], .app-container, #app', 20000)

    // Give the app some extra time to fully initialize
    await this.window.waitForTimeout(2000)
  }
}
