import { test, expect } from '@playwright/test'
import { ElectronHelper } from '../helpers/electron-helper'

test.describe('AI Complete Workflow E2E Tests', () => {
  let electronHelper: ElectronHelper

  /**
   * Get i18n placeholder text for AI modes
   * @param mode - The AI mode ('Chat', 'Command', or 'Agent')
   * @returns The translated placeholder text
   */
  const getPlaceholderText = async (mode: 'Chat' | 'Command' | 'Agent'): Promise<string> => {
    const i18nKeys = {
      Chat: 'ai.chatMessage',
      Command: 'ai.cmdMessage',
      Agent: 'ai.agentMessage'
    }

    const placeholder = await electronHelper.window?.evaluate((key: string) => {
      // Try multiple ways to access Vue i18n instance
      // Method 1: Access through Vue app instance from DOM element
      const appElement = document.querySelector('#app')
      if (appElement) {
        const vueApp = (appElement as any).__vue_app__ || (appElement as any).__vueParentComponent?.appContext?.app
        if (vueApp && vueApp.config && vueApp.config.globalProperties && vueApp.config.globalProperties.$t) {
          return vueApp.config.globalProperties.$t(key)
        }
      }

      // Method 2: Access through window global properties
      const win = window as any
      if (win.__VUE_APP__ && win.__VUE_APP__.config && win.__VUE_APP__.config.globalProperties) {
        return win.__VUE_APP__.config.globalProperties.$t(key)
      }

      // Method 3: Try to access i18n instance directly
      if (win.$i18n && win.$i18n.global && win.$i18n.global.t) {
        return win.$i18n.global.t(key)
      }

      // Method 4: Try to find i18n from Vue internal structure
      const vueInstances = document.querySelectorAll('[data-v-]')
      for (const el of Array.from(vueInstances)) {
        const instance = (el as any).__vueParentComponent || (el as any).__vue__
        if (instance && instance.appContext && instance.appContext.config) {
          const app = instance.appContext.app
          if (app && app.config && app.config.globalProperties && app.config.globalProperties.$t) {
            return app.config.globalProperties.$t(key)
          }
        }
      }

      return null
    }, i18nKeys[mode])

    if (!placeholder) {
      throw new Error(`Failed to get i18n placeholder text for ${mode} mode. Key: ${i18nKeys[mode]}`)
    }

    return placeholder
  }

  /**
   * Handle multiple execution buttons until task completion
   * @param executeTimeout - Timeout for waiting execute button or completion (default: 30000ms)
   * @param finalCheckTimeout - Timeout for final completion check (default: 5000ms)
   */
  const handleTaskExecution = async (executeTimeout: number = 30000, finalCheckTimeout: number = 5000) => {
    let taskCompleted = false
    while (!taskCompleted) {
      try {
        const executeButton = electronHelper.window?.getByTestId('execute-button')
        const completionElement = electronHelper.window?.getByTestId('new-task-button')

        const result = await Promise.race([
          executeButton?.waitFor({ timeout: executeTimeout }).then(() => 'execute'),
          completionElement?.waitFor({ timeout: executeTimeout }).then(() => 'complete')
        ]).catch(() => 'timeout')

        if (result === 'complete') {
          taskCompleted = true
        } else if (result === 'execute') {
          await executeButton?.click()
          await new Promise((resolve) => setTimeout(resolve, 2000))
        } else {
          const isResponseLoadingActive = await electronHelper.window?.evaluate(() => {
            const processingElement = document.querySelector('.processing-text')
            return processingElement !== null
          })

          if (isResponseLoadingActive) {
            continue
          } else {
            throw new Error('Timeout: Neither execute button nor task completion found within expected time')
          }
        }
      } catch (error) {
        try {
          await electronHelper.window?.getByTestId('new-task-button').waitFor({ timeout: finalCheckTimeout })
          taskCompleted = true
        } catch (completionError) {
          throw new Error('Task execution failed: Neither execute button nor completion message found')
        }
      }
    }
  }

  /**
   * Select AI model from the model dropdown
   * @param modelName - The name of the model to select (e.g., 'Qwen-Plus', 'Qwen-Turbo', 'Deepseek-V3.1', 'Qwen-Plus-Thinking', 'Deepseek-R1-Thinking')
   * @param timeout - Optional timeout in milliseconds (default: 10000)
   */
  const selectAiModel = async (modelName: string, timeout: number = 10000) => {
    try {
      await electronHelper.window?.locator('.input-controls').first().waitFor({ timeout: 5000 })

      // Use .ant-select-selector instead of .ant-select-selection-item because when show-search is enabled,
      // the search input intercepts clicks on the selection item
      const modelSelector = electronHelper.window?.locator('.input-controls .ant-select:nth-child(2) .ant-select-selector').first()

      await modelSelector?.waitFor({ timeout })
      await modelSelector?.click()

      await electronHelper.window?.waitForTimeout(500)

      const isThinkingModel = modelName.endsWith('-Thinking')
      // Display name is the text shown in dropdown (without -Thinking suffix)
      const displayName = isThinkingModel ? modelName.replace(/-Thinking$/, '') : modelName

      const allOptions = electronHelper.window?.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      let modelSelected = false

      if (allOptions) {
        const count = await allOptions.count()
        for (let i = 0; i < count; i++) {
          const option = allOptions.nth(i)

          const modelLabelLocator = option.locator('.model-label')
          const hasModelLabel = (await modelLabelLocator.count()) > 0

          if (!hasModelLabel) {
            continue
          }

          // Use timeout to avoid hanging if element is not ready
          const labelText = await modelLabelLocator.textContent({ timeout: 2000 }).catch(() => null)
          const cleanedLabel = labelText?.trim() || ''

          if (!cleanedLabel) {
            continue
          }

          if (cleanedLabel === displayName) {
            const hasThinkingIcon = (await option.locator('.thinking-icon').count()) > 0

            // Match: if we want Thinking model, it must have icon; if we want non-Thinking, it must not have icon
            if ((isThinkingModel && hasThinkingIcon) || (!isThinkingModel && !hasThinkingIcon)) {
              await option.click()
              console.log(`Successfully selected model: ${modelName} (${isThinkingModel ? 'with' : 'without'} Thinking icon)`)
              modelSelected = true
              break
            }
          }
        }
      }

      if (!modelSelected) {
        const modelOption = electronHelper.window
          ?.locator('.ant-select-dropdown .ant-select-item-option')
          .filter({
            hasText: displayName
          })
          .first()

        const modelSpan = electronHelper.window
          ?.locator('.ant-select-dropdown span.model-label')
          .filter({
            hasText: displayName
          })
          .first()

        const modelText = electronHelper.window?.locator('.ant-select-dropdown').getByText(displayName, { exact: true })

        if (modelOption && (await modelOption.isVisible({ timeout: 2000 }))) {
          if (isThinkingModel) {
            const hasIcon = (await modelOption.locator('.thinking-icon').count()) > 0
            if (hasIcon) {
              await modelOption.click()
              console.log(`Successfully selected model: ${modelName} via option selector (with Thinking icon)`)
              modelSelected = true
            }
          } else {
            const hasIcon = (await modelOption.locator('.thinking-icon').count()) > 0
            if (!hasIcon) {
              await modelOption.click()
              console.log(`Successfully selected model: ${modelName} via option selector`)
              modelSelected = true
            }
          }
        } else if (modelSpan && (await modelSpan.isVisible({ timeout: 2000 }))) {
          if (isThinkingModel) {
            const parentOption = modelSpan.locator('..')
            const hasIcon = (await parentOption.locator('.thinking-icon').count()) > 0
            if (hasIcon) {
              await modelSpan.click()
              console.log(`Successfully selected model: ${modelName} via span selector (with Thinking icon)`)
              modelSelected = true
            }
          } else {
            const parentOption = modelSpan.locator('..')
            const hasIcon = (await parentOption.locator('.thinking-icon').count()) > 0
            if (!hasIcon) {
              await modelSpan.click()
              console.log(`Successfully selected model: ${modelName} via span selector`)
              modelSelected = true
            }
          }
        } else if (modelText && (await modelText.isVisible({ timeout: 2000 }))) {
          if (isThinkingModel) {
            const parentOption = modelText.locator('..')
            const hasIcon = (await parentOption.locator('.thinking-icon').count()) > 0
            if (hasIcon) {
              await modelText.click()
              console.log(`Successfully selected model: ${modelName} via text selector (with Thinking icon)`)
              modelSelected = true
            }
          } else {
            const parentOption = modelText.locator('..')
            const hasIcon = (await parentOption.locator('.thinking-icon').count()) > 0
            if (!hasIcon) {
              await modelText.click()
              console.log(`Successfully selected model: ${modelName} via text selector`)
              modelSelected = true
            }
          }
        }
      }

      if (!modelSelected) {
        throw new Error(`Could not find model option: ${modelName} in dropdown`)
      }

      await electronHelper.window?.waitForTimeout(1000)

      const selectedValue = await modelSelector?.textContent()
      if (selectedValue?.includes(displayName)) {
        console.log(`Model selection verified: ${modelName}`)
      } else {
        console.warn(`Model selection may not have been successful. Expected: ${modelName}, Current: ${selectedValue}`)
      }
    } catch (error) {
      console.error(`Failed to select AI model "${modelName}":`, error)
      throw error
    }
  }

  /**
   * Get available AI models from the dropdown
   * @returns Array of available model names
   */
  const getAvailableAiModels = async (): Promise<string[]> => {
    try {
      await electronHelper.window?.locator('.input-controls').first().waitFor({ timeout: 5000 })

      const modelSelector = electronHelper.window?.locator('.input-controls .ant-select:nth-child(2) .ant-select-selector').first()
      await modelSelector?.waitFor({ timeout: 5000 })
      await modelSelector?.click()

      const dropdown = electronHelper.window?.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
      await dropdown?.waitFor({ timeout: 5000 })
      await electronHelper.window?.waitForTimeout(500)

      // Scroll to load all options (Ant Design may use virtual scrolling)
      const dropdownContainer = electronHelper.window?.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .rc-virtual-list-holder')

      if (dropdownContainer && (await dropdownContainer.count()) > 0) {
        const container = dropdownContainer.first()
        let previousCount = 0
        let currentCount = 0
        let scrollAttempts = 0
        const maxScrollAttempts = 10

        do {
          previousCount = currentCount
          await container.evaluate((el) => {
            el.scrollTop = el.scrollHeight
          })
          await electronHelper.window?.waitForTimeout(300)

          // The .count() method may return undefined; default to 0 if so, to avoid type error
          currentCount = (await electronHelper.window?.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item').count()) ?? 0
          scrollAttempts++

          if (currentCount === previousCount) {
            break
          }
        } while (scrollAttempts < maxScrollAttempts && currentCount > previousCount)

        await container.evaluate((el) => {
          el.scrollTop = 0
        })
        await electronHelper.window?.waitForTimeout(300)
      } else {
        const simpleDropdown = electronHelper.window?.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
        if (simpleDropdown && (await simpleDropdown.count()) > 0) {
          await simpleDropdown.first().evaluate((el) => {
            const scrollContainer = el.querySelector('.rc-virtual-list-holder') || el
            scrollContainer.scrollTop = scrollContainer.scrollHeight
          })
          await electronHelper.window?.waitForTimeout(500)
          await simpleDropdown.first().evaluate((el) => {
            const scrollContainer = el.querySelector('.rc-virtual-list-holder') || el
            scrollContainer.scrollTop = 0
          })
          await electronHelper.window?.waitForTimeout(300)
        }
      }

      await electronHelper.window?.waitForTimeout(500)

      // This ensures we distinguish between models with and without -Thinking suffix
      const modelOptionsSet = new Set<string>()

      const optionElements = electronHelper.window?.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')

      if (optionElements) {
        const count = await optionElements.count()
        for (let i = 0; i < count; i++) {
          const option = optionElements.nth(i)

          const hasThinkingIcon = (await option.locator('.thinking-icon').count()) > 0

          const modelLabelLocator = option.locator('.model-label')
          const hasModelLabel = (await modelLabelLocator.count()) > 0

          if (!hasModelLabel) {
            continue
          }

          // Use timeout to avoid hanging if element is not ready
          const labelText = await modelLabelLocator.textContent({ timeout: 2000 }).catch(() => null)

          if (labelText) {
            const cleaned = labelText.trim()
            // If has thinking icon, add -Thinking suffix to distinguish from non-Thinking version
            const modelName = hasThinkingIcon ? cleaned + '-Thinking' : cleaned
            if (modelName) {
              modelOptionsSet.add(modelName)
            }
          }
        }
      }

      await electronHelper.window?.keyboard.press('Escape')
      await electronHelper.window?.waitForTimeout(300)

      const modelOptions = Array.from(modelOptionsSet)
      console.log(`Found ${modelOptions.length} available AI models:`, modelOptions)
      return modelOptions
    } catch (error) {
      console.error('Failed to get available AI models:', error)
      try {
        await electronHelper.window?.keyboard.press('Escape')
      } catch {
        // Ignore errors when closing
      }
      return []
    }
  }

  /**
   * Wait for mode switch to complete and verify UI state
   * @param expectedMode - The expected mode after switch
   */
  const waitForModeSwitch = async (expectedMode: 'Chat' | 'Command' | 'Agent', timeout: number = 10000) => {
    try {
      await electronHelper.window?.waitForFunction(
        (mode) => {
          const selector = document.querySelector('.input-controls .ant-select:first-child .ant-select-selection-item')
          return selector?.textContent === mode
        },
        expectedMode,
        { timeout }
      )

      await electronHelper.window?.waitForTimeout(1000)

      console.log(`Mode switch to ${expectedMode} completed successfully`)
    } catch (error) {
      console.error(`Failed to wait for mode switch to ${expectedMode}:`, error)
      throw error
    }
  }

  /**
   * Verify the current mode state and UI consistency
   * @param expectedMode - The expected current mode
   */
  const verifyModeState = async (expectedMode: 'Chat' | 'Command' | 'Agent') => {
    try {
      // Use .first() to avoid strict mode violation when multiple .input-controls exist
      const modeSelector = electronHelper.window?.locator('.input-controls .ant-select:first-child .ant-select-selection-item').first()
      const currentModeText = await modeSelector?.textContent()

      if (currentModeText !== expectedMode) {
        throw new Error(`Mode verification failed. Expected: ${expectedMode}, Actual: ${currentModeText}`)
      }

      const placeholderText = await getPlaceholderText(expectedMode)

      const inputBox = electronHelper.window?.getByRole('textbox', { name: placeholderText })
      await inputBox?.waitFor({ timeout: 5000 })

      console.log(`Mode state verification passed for ${expectedMode} mode`)
    } catch (error) {
      console.error(`Mode state verification failed for ${expectedMode}:`, error)
      throw error
    }
  }

  /**
   * Switch to specified AI mode and create new chat - Enhanced version
   * @param mode - The target mode
   * @param retries - Number of retry attempts (default: 2)
   */
  const switchToModeAndCreateNewChat = async (mode: 'Chat' | 'Command' | 'Agent', retries: number = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Use .first() to avoid strict mode violation when multiple .input-controls exist
        const currentModeSelector = electronHelper.window?.locator('.input-controls .ant-select:first-child .ant-select-selection-item').first()
        const currentMode = await currentModeSelector?.textContent()

        if (currentMode === mode) {
          console.log(`Already in ${mode} mode, verifying state`)
          await verifyModeState(mode)
          return
        }

        console.log(`Switching from ${currentMode} to ${mode} mode (attempt ${attempt + 1}/${retries + 1})`)

        // Use .first() to avoid strict mode violation when multiple .input-controls exist
        const modeDropdown = electronHelper.window?.locator('.input-controls .ant-select:first-child').first()
        await modeDropdown?.click()

        await electronHelper.window?.waitForTimeout(500)

        const modeOption = electronHelper.window?.locator('.ant-select-dropdown .ant-select-item-option').filter({ hasText: mode }).first()
        await modeOption?.waitFor({ timeout: 5000 })
        await modeOption?.click()

        await waitForModeSwitch(mode)
        await verifyModeState(mode)

        console.log(`Successfully switched to ${mode} mode`)
        return
      } catch (error) {
        console.warn(`Mode switch attempt ${attempt + 1} failed:`, error)

        if (attempt === retries) {
          console.error(`All ${retries + 1} attempts to switch to ${mode} mode failed`)
          throw error
        }

        await electronHelper.window?.waitForTimeout(2000)
      }
    }
  }

  /**
   * Open AI dialog by using keyboard shortcut or clicking the right sidebar toggle button
   */
  const openAiDialog = async () => {
    try {
      const terminalInput = electronHelper.window?.getByRole('textbox', { name: 'Terminal input' })
      if (terminalInput) {
        await terminalInput?.click()
        await electronHelper.window?.waitForTimeout(500)
      }

      // This will toggle AI sidebar if terminal has focus and no text is selected
      await electronHelper.window?.keyboard.press('ControlOrMeta+l')
      await electronHelper.window?.waitForTimeout(1000)

      // Use .first() to avoid strict mode violation when multiple .input-controls exist
      const inputControls = electronHelper.window?.locator('.input-controls')
      const isOpen = await inputControls?.isVisible({ timeout: 2000 }).catch(() => false)

      if (!isOpen) {
        console.log('Keyboard shortcut did not open AI dialog, trying button click')
        const rightSidebarButton = electronHelper.window?.locator('.toggle-right-btn').nth(1)
        await rightSidebarButton?.waitFor({ timeout: 10000 })
        await rightSidebarButton?.click()
        await electronHelper.window?.waitForTimeout(1000)
      }

      // Use .first() to select the first visible element and avoid strict mode violation
      await electronHelper.window?.locator('.input-controls').first().waitFor({ timeout: 10000 })
      console.log('AI dialog opened successfully')
      await electronHelper.window?.waitForTimeout(1000)
    } catch (error) {
      console.error('Failed to open AI dialog:', error)
      throw error
    }
  }

  const selectTestHost = async () => {
    await electronHelper.window?.waitForSelector('.dark-tree', { timeout: 0 })

    console.log('Waiting for host named "test" to be available. If no hosts exist, please add a host manually...')

    // Based on Workspace component analysis:
    // Host entries have laptop-outlined icon with class "computer-icon"
    // Click event is bound to the span text element after the icon
    // The structure is: .title-with-icon > .computer-icon + span
    const testHostText = electronHelper.window?.locator('.dark-tree .title-with-icon .computer-icon + span').filter({ hasText: 'test' }).first()

    // timeout: 0 means no timeout
    await testHostText?.waitFor({ timeout: 0 })

    await testHostText?.click()
    console.log('Successfully clicked on host named "test"')
    await electronHelper.window?.waitForTimeout(1000)

    await openAiDialog()
  }

  /**
   * Setup mode for testing
   * @param mode - AI mode to setup ('Chat', 'Command', or 'Agent')
   * @param model - AI model to select (default models per mode)
   */
  const setupMode = async (mode: 'Chat' | 'Command' | 'Agent', model?: string) => {
    const defaultModels = {
      Chat: 'Deepseek-R1-Thinking',
      Command: 'Qwen-Plus',
      Agent: 'Qwen-Plus'
    }

    await selectTestHost()
    await switchToModeAndCreateNewChat(mode)
    await selectAiModel(model || defaultModels[mode])
  }

  /**
   * Execute input in any AI mode (Chat, Command, or Agent)
   * @param mode - The AI mode to execute in ('Chat', 'Command', or 'Agent')
   * @param input - The command or task to execute
   */
  const executeTask = async (mode: 'Chat' | 'Command' | 'Agent', input: string) => {
    const placeholderText = await getPlaceholderText(mode)

    const inputBox = electronHelper.window?.getByRole('textbox', {
      name: placeholderText
    })

    await inputBox?.click()
    await inputBox?.fill(input)
    await inputBox?.press('Enter')
    await handleTaskExecution()
  }

  /**
   * Run a complete test for any AI mode
   * @param mode - The AI mode to test ('Chat', 'Command', or 'Agent')
   * @param input - The command or task to execute
   * @param timeout - Test timeout in milliseconds (default: 300000)
   * @param model - AI model to use (uses default if not specified)
   */
  const runTest = async (mode: 'Chat' | 'Command' | 'Agent', input: string, timeout: number = 300000, model?: string) => {
    test.setTimeout(timeout)
    await setupMode(mode, model)
    await executeTask(mode, input)
  }

  /**
   * Run a complete Chat mode test
   * @param input - The command or task to execute
   * @param timeout - Test timeout in milliseconds (default: 300000)
   * @param model - AI model to use (default: 'Deepseek-R1-Thinking')
   */
  const runChatTest = async (input: string, timeout: number = 300000, model: string = 'Deepseek-R1-Thinking') => {
    await runTest('Chat', input, timeout, model)
  }

  /**
   * Run a complete Command mode test
   * @param input - The command or task to execute
   * @param timeout - Test timeout in milliseconds (default: 300000)
   * @param model - AI model to use (default: 'Qwen-Plus')
   */
  const runCommandTest = async (input: string, timeout: number = 300000, model: string = 'Qwen-Plus') => {
    await runTest('Command', input, timeout, model)
  }

  /**
   * Run a complete Agent mode test (backward compatibility)
   * @param input - The command or task to execute
   * @param timeout - Test timeout in milliseconds (default: 300000)
   * @param model - AI model to use (default: 'Qwen-Plus')
   */
  const runAgentTest = async (input: string, timeout: number = 300000, model: string = 'Qwen-Plus') => {
    await runTest('Agent', input, timeout, model)
  }

  test.beforeEach(async () => {
    electronHelper = new ElectronHelper()
    await electronHelper.launch()
    await electronHelper.waitForAppReady()
  })

  test.afterEach(async () => {
    await electronHelper.close()
  })

  test.describe('Chat Mode Tests', () => {
    // test('Check system status', async () => {
    //   await runChatTest('Check system status')
    // })
    test('Explain Linux command functionality', async () => {
      await runChatTest('Please explain the functionality and usage of these Linux commands: ls -la, grep -r "error" /var/log/, ps aux | grep nginx')
    })
    // test('Analyze system architecture design', async () => {
    //   await runChatTest('I need to design a high-concurrency Web application architecture, including load balancing, database cluster, cache layer, please provide detailed technology selection and architecture recommendations')
    // })
  })

  test.describe('Command Mode Tests', () => {
    test('System resource monitoring', async () => {
      await runCommandTest('Monitor system resource usage, including CPU, memory, disk space, and network connections')
    })

    // test('Check system service status', async () => {
    //   await runCommandTest('Check the running status of critical services in the system, such as SSH, network management, firewall, etc.')
    // })

    // test('Find and search operations', async () => {
    //   await runCommandTest('Find all .log files in the system, count their sizes, and find the 5 largest log files', 300000)
    // })
  })

  test.describe('Agent Mode Tests', () => {
    // test('Intelligent system diagnosis', async () => {
    //   await runAgentTest('Perform a comprehensive diagnosis of the system, check system health status, identify potential issues and provide solutions', 600000)
    // })

    // test('Execute top command', async () => {
    //   await runAgentTest('Execute the top command, do not add parameters', 300000)
    // })

    test('Install MySQL', async () => {
      await runAgentTest(
        'Check if MySQL is installed in the system. If it is installed, uninstall MySQL first, then reinstall MySQL. If it is not installed, please install MySQL',
        600000
      )
    })
  })

  /**
   * Wait for MCP server to be connected
   * @param serverName - The name of the MCP server to wait for
   * @param timeout - Maximum time to wait in milliseconds (default: 60000)
   */
  const waitForMcpServerConnected = async (serverName: string, timeout: number = 60000) => {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      try {
        const servers = await electronHelper.window?.evaluate(async () => {
          const win = window as any
          if (win.api && win.api.getMcpServers) {
            return await win.api.getMcpServers()
          }
          return []
        })

        if (servers) {
          const server = servers.find((s: any) => s.name === serverName)
          if (server && server.status === 'connected') {
            console.log(`MCP server "${serverName}" is connected`)
            return true
          }
          if (server && server.error) {
            throw new Error(`MCP server "${serverName}" connection failed: ${server.error}`)
          }
        }
      } catch (error) {
        console.warn('Error checking MCP server status:', error)
      }

      await electronHelper.window?.waitForTimeout(2000)
    }

    throw new Error(`Timeout waiting for MCP server "${serverName}" to connect (${timeout}ms)`)
  }

  test.describe('MCP Function Tests', () => {
    test('AWS MCP - Find S3 bucket command best practices', async () => {
      test.setTimeout(600000)

      await selectTestHost()

      await electronHelper.window?.evaluate(async () => {
        const win = window as any
        const currentConfig = await win.api.readMcpConfig()
        const config = JSON.parse(currentConfig)

        config.mcpServers['awslabs.aws-documentation-mcp-server'] = {
          command: 'uvx ',
          args: ['awslabs.aws-documentation-mcp-server@latest'],
          env: {
            FASTMCP_LOG_LEVEL: 'ERROR',
            AWS_DOCUMENTATION_PARTITION: 'aws'
          },
          disabled: false
        }

        await win.api.writeMcpConfig(JSON.stringify(config, null, 2))
      })

      console.log('AWS MCP configuration added, waiting for server to connect...')

      await waitForMcpServerConnected('awslabs.aws-documentation-mcp-server', 60000)

      await switchToModeAndCreateNewChat('Agent')
      await selectAiModel('Qwen-Plus')

      await executeTask('Agent', 'Use AWS MCP to find S3 bucket command best practices')
    })
  })

  test.describe.skip('AI Mode Switching Robustness Tests', () => {
    test('Basic mode switching functionality test', async () => {
      test.setTimeout(180000)
      await selectTestHost()

      const modes: Array<'Chat' | 'Command' | 'Agent'> = ['Chat', 'Command', 'Agent']

      console.log('Starting basic mode switching test')

      for (const mode of modes) {
        console.log(`Testing switch to ${mode} mode`)
        await switchToModeAndCreateNewChat(mode)
        await verifyModeState(mode)
        console.log(`${mode} mode switch and verification completed`)

        await electronHelper.window?.waitForTimeout(1000)
      }

      console.log('Basic mode switching test completed successfully')
    })

    test('Cyclic mode switching test', async () => {
      test.setTimeout(240000)
      await selectTestHost()

      const modes: Array<'Chat' | 'Command' | 'Agent'> = ['Chat', 'Command', 'Agent']
      const cycles = 2

      console.log(`Starting cyclic mode switching test for ${cycles} cycles`)

      for (let cycle = 0; cycle < cycles; cycle++) {
        console.log(`Starting cycle ${cycle + 1}/${cycles}`)

        for (let i = 0; i < modes.length; i++) {
          const currentMode = modes[i]
          const nextMode = modes[(i + 1) % modes.length]

          console.log(`Cycle ${cycle + 1}: Switching from ${currentMode} to ${nextMode}`)

          await switchToModeAndCreateNewChat(currentMode)
          await verifyModeState(currentMode)

          await electronHelper.window?.waitForTimeout(500)

          await switchToModeAndCreateNewChat(nextMode)
          await verifyModeState(nextMode)

          console.log(`Cycle ${cycle + 1}: Successfully switched from ${currentMode} to ${nextMode}`)
        }

        console.log(`Cycle ${cycle + 1} completed`)
      }

      console.log('Cyclic mode switching test completed successfully')
    })

    test('Rapid consecutive mode switching test', async () => {
      test.setTimeout(180000)
      await selectTestHost()

      const switchSequence = ['Chat', 'Agent', 'Command', 'Chat', 'Agent', 'Command'] as const

      console.log('Starting rapid mode switching test')

      for (let i = 0; i < switchSequence.length; i++) {
        const targetMode = switchSequence[i]
        console.log(`Rapid switch ${i + 1}/${switchSequence.length}: Switching to ${targetMode}`)

        await switchToModeAndCreateNewChat(targetMode)
        await verifyModeState(targetMode)

        await electronHelper.window?.waitForTimeout(300)
      }

      console.log('Rapid mode switching test completed successfully')
    })

    test('UI consistency verification test after mode switching', async () => {
      test.setTimeout(180000)
      await selectTestHost()

      const modes: Array<'Chat' | 'Command' | 'Agent'> = ['Chat', 'Command', 'Agent']

      console.log('Starting UI consistency verification test')

      for (const mode of modes) {
        console.log(`Testing UI consistency for ${mode} mode`)

        await switchToModeAndCreateNewChat(mode)
        await verifyModeState(mode)

        const placeholderText = await getPlaceholderText(mode)

        const inputBox = electronHelper.window?.getByRole('textbox', { name: placeholderText })
        await inputBox?.click()
        await inputBox?.fill(`Test input for ${mode} mode`)
        await inputBox?.clear()

        // Use the same selector as selectAiModel function for consistency
        const modelSelector = electronHelper.window?.locator('.input-controls .ant-select:nth-child(2) .ant-select-selection-item').first()
        await modelSelector?.waitFor({ timeout: 10000 })

        console.log(`UI consistency verified for ${mode} mode`)

        await electronHelper.window?.waitForTimeout(1000)
      }

      console.log('UI consistency verification test completed successfully')
    })

    test('Same mode repeated switching test', async () => {
      test.setTimeout(120000)
      await selectTestHost()

      const testMode = 'Chat'
      const attempts = 5

      console.log(`Starting same mode repeated switch test for ${testMode} mode (${attempts} attempts)`)

      await switchToModeAndCreateNewChat('Command')
      await verifyModeState('Command')

      for (let i = 0; i < attempts; i++) {
        console.log(`Same mode switch attempt ${i + 1}/${attempts}`)

        await switchToModeAndCreateNewChat(testMode)
        await verifyModeState(testMode)

        await electronHelper.window?.waitForTimeout(500)
      }

      console.log('Same mode repeated switch test completed successfully')
    })

    test('Mode switching error recovery test', async () => {
      test.setTimeout(180000)
      await selectTestHost()

      console.log('Starting mode switch error recovery test')

      const modes: Array<'Chat' | 'Command' | 'Agent'> = ['Chat', 'Command', 'Agent']

      for (const mode of modes) {
        console.log(`Testing error recovery for ${mode} mode`)

        try {
          await switchToModeAndCreateNewChat(mode, 3)
          await verifyModeState(mode)

          const inputSelector = electronHelper.window?.locator('input[type="text"], textarea')
          if (inputSelector && (await inputSelector.count()) > 0) {
            const firstInput = inputSelector.first()
            await firstInput?.click()
            await firstInput?.fill('Test recovery input')
            await firstInput?.clear()
          }

          console.log(`Error recovery test passed for ${mode} mode`)
        } catch (error) {
          console.error(`Error recovery test failed for ${mode} mode:`, error)
        }

        await electronHelper.window?.waitForTimeout(1000)
      }

      console.log('Mode switch error recovery test completed')
    })
  })

  test.describe.skip('AI Model Selection Tests', () => {
    test('Get available AI model list', async () => {
      test.setTimeout(60000)
      await selectTestHost()

      const models = await getAvailableAiModels()
      console.log('Available AI models:', models)

      expect(models.length).toBeGreaterThan(0)
    })

    test('Select Qwen-Plus model', async () => {
      test.setTimeout(60000)
      await selectTestHost()

      await selectAiModel('Qwen-Plus')

      await electronHelper.window?.waitForTimeout(1000)
    })

    test('Select Qwen-Turbo model', async () => {
      test.setTimeout(60000)
      await selectTestHost()

      await selectAiModel('Qwen-Turbo')

      await electronHelper.window?.waitForTimeout(1000)
    })

    test('Select Deepseek-V3.1 model', async () => {
      test.setTimeout(60000)
      await selectTestHost()

      await selectAiModel('Deepseek-V3.1')

      await electronHelper.window?.waitForTimeout(1000)
    })

    test('Select Deepseek-R1 Thinking model', async () => {
      test.setTimeout(60000)
      await selectTestHost()

      await selectAiModel('Deepseek-R1-Thinking')

      await electronHelper.window?.waitForTimeout(1000)
    })

    test('Test combination usage of different models', async () => {
      test.setTimeout(120000)
      await selectTestHost()

      const modelsToTest = ['Qwen-Plus', 'Qwen-Turbo', 'Deepseek-V3.1']

      for (const modelName of modelsToTest) {
        console.log(`Testing model: ${modelName}`)
        await selectAiModel(modelName)
        await electronHelper.window?.waitForTimeout(2000)
      }

      console.log('All model selections completed successfully')
    })
  })
})
