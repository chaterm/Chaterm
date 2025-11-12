import { test, expect } from '@playwright/test'
import { ElectronHelper } from '../helpers/electron-helper'

test.describe('AI完整工作流程E2E测试', () => {
  let electronHelper: ElectronHelper

  /**
   * Handle multiple execution buttons until task completion
   * @param executeTimeout - Timeout for waiting execute button or completion (default: 30000ms)
   * @param finalCheckTimeout - Timeout for final completion check (default: 5000ms)
   */
  const handleTaskExecution = async (executeTimeout: number = 30000, finalCheckTimeout: number = 5000) => {
    let taskCompleted = false
    while (!taskCompleted) {
      try {
        // Wait for either execute button or completion message to appear
        const executeButton = electronHelper.window?.getByRole('button', { name: 'play-circle 执行' })
        const completionElement = electronHelper.window?.getByText('开始新任务')

        // Race between execute button and completion message
        const result = await Promise.race([
          executeButton?.waitFor({ timeout: executeTimeout }).then(() => 'execute'),
          completionElement?.waitFor({ timeout: executeTimeout }).then(() => 'complete')
        ]).catch(() => 'timeout')

        if (result === 'complete') {
          // Task completed successfully
          taskCompleted = true
        } else if (result === 'execute') {
          // Execute button found and responseLoading is false, click it
          await executeButton?.click()
          await new Promise((resolve) => setTimeout(resolve, 2000))
        } else {
          const isResponseLoadingActive = await electronHelper.window?.evaluate(() => {
            const processingElement = document.querySelector('.processing-text')
            return processingElement !== null
          })

          if (isResponseLoadingActive) {
            // Processing is ongoing, continue waiting
            continue
          } else {
            throw new Error('Timeout: Neither execute button nor task completion found within expected time')
          }
        }
      } catch (error) {
        // Final attempt to check for completion
        try {
          await electronHelper.window?.getByText('开始新任务').waitFor({ timeout: finalCheckTimeout })
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
      // Wait for the input-controls container to be visible first
      await electronHelper.window?.locator('.input-controls').waitFor({ timeout: 5000 })

      // Wait for and click the AI model selector dropdown (second select in input-controls)
      const modelSelector = electronHelper.window?.locator('.input-controls .ant-select:nth-child(2) .ant-select-selection-item')

      await modelSelector?.waitFor({ timeout })
      await modelSelector?.click()

      // Wait for dropdown options to appear
      await electronHelper.window?.waitForTimeout(500)

      // Check if model name has -Thinking suffix
      const isThinkingModel = modelName.endsWith('-Thinking')
      // Display name is the text shown in dropdown (without -Thinking suffix)
      const displayName = isThinkingModel ? modelName.replace(/-Thinking$/, '') : modelName

      // Get all option elements and find the matching one
      const allOptions = electronHelper.window?.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      let modelSelected = false

      if (allOptions) {
        const count = await allOptions.count()
        for (let i = 0; i < count; i++) {
          const option = allOptions.nth(i)

          // Check if .model-label exists before trying to get text content
          const modelLabelLocator = option.locator('.model-label')
          const hasModelLabel = (await modelLabelLocator.count()) > 0

          if (!hasModelLabel) {
            // Skip this option if it doesn't have a model-label
            continue
          }

          // Get the label text (which has -Thinking suffix removed in display)
          // Use timeout to avoid hanging if element is not ready
          const labelText = await modelLabelLocator.textContent({ timeout: 2000 }).catch(() => null)
          const cleanedLabel = labelText?.trim() || ''

          // Skip if label is empty
          if (!cleanedLabel) {
            continue
          }

          // Check if the label matches the display name
          if (cleanedLabel === displayName) {
            // Check if this option has a thinking icon
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

      // Fallback: try the old approach if the new one didn't work
      if (!modelSelected) {
        // Try different ways to locate and click the model option
        // First try: look for ant-select-option with display name
        const modelOption = electronHelper.window
          ?.locator('.ant-select-dropdown .ant-select-item-option')
          .filter({
            hasText: displayName
          })
          .first()

        // Second try: look for span with the display name in dropdown
        const modelSpan = electronHelper.window
          ?.locator('.ant-select-dropdown span.model-label')
          .filter({
            hasText: displayName
          })
          .first()

        // Third try: look for text content directly in dropdown
        const modelText = electronHelper.window?.locator('.ant-select-dropdown').getByText(displayName, { exact: true })

        if (modelOption && (await modelOption.isVisible({ timeout: 2000 }))) {
          // If we need Thinking model, verify it has the icon
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
          // If we need Thinking model, verify it has the icon
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
          // If we need Thinking model, verify it has the icon
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

      // Wait for dropdown to close
      await electronHelper.window?.waitForTimeout(1000)

      // Verify the selection was successful by checking the selected value
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
      // Wait for the input-controls container to be visible first
      await electronHelper.window?.locator('.input-controls').waitFor({ timeout: 5000 })

      // Open the dropdown by clicking the model selector
      const modelSelector = electronHelper.window?.locator('.input-controls .ant-select:nth-child(2) .ant-select-selector')
      await modelSelector?.waitFor({ timeout: 5000 })
      await modelSelector?.click()

      // Wait for dropdown to appear
      const dropdown = electronHelper.window?.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
      await dropdown?.waitFor({ timeout: 5000 })
      await electronHelper.window?.waitForTimeout(500)

      // Scroll to load all options (Ant Design may use virtual scrolling)
      // Get the dropdown container element
      const dropdownContainer = electronHelper.window?.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .rc-virtual-list-holder')

      if (dropdownContainer && (await dropdownContainer.count()) > 0) {
        // If virtual list exists, scroll to bottom to load all items
        const container = dropdownContainer.first()
        let previousCount = 0
        let currentCount = 0
        let scrollAttempts = 0
        const maxScrollAttempts = 10

        // Keep scrolling until no new items are loaded
        do {
          previousCount = currentCount
          // Scroll to bottom
          await container.evaluate((el) => {
            el.scrollTop = el.scrollHeight
          })
          await electronHelper.window?.waitForTimeout(300)

          // Count current visible items
          currentCount = await electronHelper.window?.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item').count()
          scrollAttempts++

          // If count didn't change, all items are loaded
          if (currentCount === previousCount) {
            break
          }
        } while (scrollAttempts < maxScrollAttempts && currentCount > previousCount)

        // Scroll back to top to ensure we can see all items
        await container.evaluate((el) => {
          el.scrollTop = 0
        })
        await electronHelper.window?.waitForTimeout(300)
      } else {
        // Fallback: try scrolling the dropdown itself
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

      // Wait a bit more for all items to be rendered
      await electronHelper.window?.waitForTimeout(500)

      // Get all model options by checking each option element
      // This ensures we distinguish between models with and without -Thinking suffix
      const modelOptionsSet = new Set<string>()

      // Get all option elements
      const optionElements = electronHelper.window?.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')

      if (optionElements) {
        const count = await optionElements.count()
        for (let i = 0; i < count; i++) {
          const option = optionElements.nth(i)

          // Check if this option has a thinking icon
          const hasThinkingIcon = (await option.locator('.thinking-icon').count()) > 0

          // Check if .model-label exists before trying to get text content
          const modelLabelLocator = option.locator('.model-label')
          const hasModelLabel = (await modelLabelLocator.count()) > 0

          if (!hasModelLabel) {
            // Skip this option if it doesn't have a model-label
            continue
          }

          // Get the label text (which has -Thinking suffix removed in display)
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

      // Close the dropdown
      await electronHelper.window?.keyboard.press('Escape')
      await electronHelper.window?.waitForTimeout(300)

      const modelOptions = Array.from(modelOptionsSet)
      console.log(`Found ${modelOptions.length} available AI models:`, modelOptions)
      return modelOptions
    } catch (error) {
      console.error('Failed to get available AI models:', error)
      // Try to close dropdown if it's still open
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
      // Wait for the mode selector to show the expected mode
      await electronHelper.window?.waitForFunction(
        (mode) => {
          const selector = document.querySelector('.input-controls .ant-select:first-child .ant-select-selection-item')
          return selector?.textContent === mode
        },
        expectedMode,
        { timeout }
      )

      // Additional wait for UI to stabilize
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
      // Verify mode selector shows correct mode
      const modeSelector = electronHelper.window?.locator('.input-controls .ant-select:first-child .ant-select-selection-item')
      const currentModeText = await modeSelector?.textContent()

      if (currentModeText !== expectedMode) {
        throw new Error(`Mode verification failed. Expected: ${expectedMode}, Actual: ${currentModeText}`)
      }

      // Verify input placeholder text matches the mode
      const expectedPlaceholders = {
        Chat: '与AI对话，学习，头脑风暴（无法操作服务器）',
        Command: '需要到当前活跃终端执行命令，请先在终端窗口中连接目标主机',
        Agent: '到任意主机执行命令查询，排查错误和任务处理等任何事情'
      }

      const inputBox = electronHelper.window?.getByRole('textbox', { name: expectedPlaceholders[expectedMode] })
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
        // Check current active mode by looking at the selected value in the dropdown
        const currentModeSelector = electronHelper.window?.locator('.input-controls .ant-select:first-child .ant-select-selection-item')
        const currentMode = await currentModeSelector?.textContent()

        // If current mode matches target mode, verify state and return
        if (currentMode === mode) {
          console.log(`Already in ${mode} mode, verifying state`)
          await verifyModeState(mode)
          return
        }

        console.log(`Switching from ${currentMode} to ${mode} mode (attempt ${attempt + 1}/${retries + 1})`)

        // Click on the mode dropdown to open options
        const modeDropdown = electronHelper.window?.locator('.input-controls .ant-select:first-child')
        await modeDropdown?.click()

        // Wait for dropdown options to appear
        await electronHelper.window?.waitForTimeout(500)

        // Click on the target mode - use more specific selector to avoid strict mode violation
        const modeOption = electronHelper.window?.locator('.ant-select-dropdown .ant-select-item-option').filter({ hasText: mode }).first()
        await modeOption?.waitFor({ timeout: 5000 })
        await modeOption?.click()

        // Wait for mode switch to complete
        await waitForModeSwitch(mode)

        // Verify the mode state
        await verifyModeState(mode)

        console.log(`Successfully switched to ${mode} mode`)
        return
      } catch (error) {
        console.warn(`Mode switch attempt ${attempt + 1} failed:`, error)

        if (attempt === retries) {
          console.error(`All ${retries + 1} attempts to switch to ${mode} mode failed`)
          throw error
        }

        // Wait before retry
        await electronHelper.window?.waitForTimeout(2000)
      }
    }
  }

  /**
   * Open AI dialog by using keyboard shortcut or clicking the right sidebar toggle button
   */
  const openAiDialog = async () => {
    try {
      // First, try to focus the terminal input to ensure keyboard shortcut works
      const terminalInput = electronHelper.window?.getByRole('textbox', { name: 'Terminal input' })
      if (terminalInput) {
        await terminalInput?.click()
        await electronHelper.window?.waitForTimeout(500)
      }

      // Try using keyboard shortcut ControlOrMeta+l (sendOrToggleAi)
      // This will toggle AI sidebar if terminal has focus and no text is selected
      await electronHelper.window?.keyboard.press('ControlOrMeta+l')
      await electronHelper.window?.waitForTimeout(1000)

      // Check if AI dialog is already open
      const inputControls = electronHelper.window?.locator('.input-controls')
      const isOpen = await inputControls?.isVisible({ timeout: 2000 }).catch(() => false)

      if (!isOpen) {
        // If shortcut didn't work, fallback to clicking the button
        console.log('Keyboard shortcut did not open AI dialog, trying button click')
        const rightSidebarButton = electronHelper.window?.locator('.toggle-right-btn').nth(1)
        await rightSidebarButton?.waitFor({ timeout: 10000 })
        await rightSidebarButton?.click()
        await electronHelper.window?.waitForTimeout(1000)
      }

      // Wait for AI dialog to open by checking for input-controls container
      await electronHelper.window?.locator('.input-controls').waitFor({ timeout: 10000 })
      console.log('AI dialog opened successfully')
      await electronHelper.window?.waitForTimeout(1000) // Wait for UI to stabilize
    } catch (error) {
      console.error('Failed to open AI dialog:', error)
      throw error
    }
  }

  const selectTestHost = async () => {
    // Wait for host list container to load
    await electronHelper.window?.waitForSelector('.dark-tree', { timeout: 0 })

    console.log('Waiting for host named "test" to be available. If no hosts exist, please add a host manually...')

    // Based on Workspace component analysis:
    // 1. Host entries are in second-level nodes (isSecondLevel check)
    // 2. They have laptop-outlined icon with class "computer-icon"
    // 3. Click event is bound to the span text element after the icon
    // 4. The structure is: .title-with-icon > .computer-icon + span

    // Find host with name "test" instead of first host
    const testHostText = electronHelper.window?.locator('.dark-tree .title-with-icon .computer-icon + span').filter({ hasText: 'test' }).first()

    // Wait for the host named "test" to appear (will wait indefinitely until user adds a host)
    await testHostText?.waitFor({ timeout: 0 }) // timeout: 0 means no timeout

    // Click on the host named "test"
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
    // Default models for each mode
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
    // Define placeholder texts for each mode
    const placeholders = {
      Chat: '与AI对话，学习，头脑风暴（无法操作服务器）',
      Command: '需要到当前活跃终端执行命令，请先在终端窗口中连接目标主机',
      Agent: '到任意主机执行命令查询，排查错误和任务处理等任何事情'
    }

    const inputBox = electronHelper.window?.getByRole('textbox', {
      name: placeholders[mode]
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

  test.describe('测试Chat模式', () => {
    // test('查看系统状态', async () => {
    //   await runChatTest('查看系统状态')
    // })
    test('解释Linux命令功能', async () => {
      await runChatTest('请解释这几个Linux命令的功能和用法：ls -la, grep -r "error" /var/log/, ps aux | grep nginx')
    })
    // test('分析系统架构设计', async () => {
    //   await runChatTest('我需要设计一个高并发的Web应用架构，包含负载均衡、数据库集群、缓存层，请给出详细的技术选型和架构建议')
    // })
  })

  test.describe('测试 Command 模式', () => {
    test('系统资源监控', async () => {
      await runCommandTest('监控系统资源使用情况，包括CPU、内存、磁盘空间、网络连接数')
    })

    // test('检查系统服务状态', async () => {
    //   await runCommandTest('检查系统中关键服务的运行状态，如SSH、网络管理、防火墙等')
    // })

    // test('查找和搜索操作', async () => {
    //   await runCommandTest('在系统中查找所有.log文件，统计它们的大小，找出最大的5个日志文件', 300000)
    // })
  })

  test.describe('测试 Agent 模式', () => {
    // test('智能系统诊断', async () => {
    //   await runAgentTest('对系统进行全面诊断，检查系统健康状态，识别潜在问题并提供解决建议', 600000)
    // })

    // test('执行top命令', async () => {
    //   await runAgentTest('执行top命令，不要添加参数', 300000)
    // })

    test('安装MySQL', async () => {
      await runAgentTest('检查系统中是否安装MySQL，如果安装了，先将MySQL卸载掉，然后重新安装MySQL，如果没安装，请安装MySQL', 600000)
    })
  })

  test.describe.skip('AI模式切换健壮性测试', () => {
    test('基本模式切换功能测试', async () => {
      test.setTimeout(180000) // 3 minutes
      await selectTestHost()
      // await electronHelper.window?.getByRole('textbox', { name: 'Terminal input' }).press('ControlOrMeta+l')
      await openAiDialog()

      const modes: Array<'Chat' | 'Command' | 'Agent'> = ['Chat', 'Command', 'Agent']

      console.log('Starting basic mode switching test')

      // Test switching to each mode and verify state
      for (const mode of modes) {
        console.log(`Testing switch to ${mode} mode`)
        await switchToModeAndCreateNewChat(mode)
        await verifyModeState(mode)
        console.log(`${mode} mode switch and verification completed`)

        // Wait between mode switches
        await electronHelper.window?.waitForTimeout(1000)
      }

      console.log('Basic mode switching test completed successfully')
    })

    test('循环模式切换测试', async () => {
      test.setTimeout(240000) // 4 minutes
      await selectTestHost()
      await openAiDialog()

      const modes: Array<'Chat' | 'Command' | 'Agent'> = ['Chat', 'Command', 'Agent']
      const cycles = 2 // Test 2 complete cycles

      console.log(`Starting cyclic mode switching test for ${cycles} cycles`)

      for (let cycle = 0; cycle < cycles; cycle++) {
        console.log(`Starting cycle ${cycle + 1}/${cycles}`)

        for (let i = 0; i < modes.length; i++) {
          const currentMode = modes[i]
          const nextMode = modes[(i + 1) % modes.length]

          console.log(`Cycle ${cycle + 1}: Switching from ${currentMode} to ${nextMode}`)

          // Switch to current mode first
          await switchToModeAndCreateNewChat(currentMode)
          await verifyModeState(currentMode)

          // Wait a bit
          await electronHelper.window?.waitForTimeout(500)

          // Switch to next mode
          await switchToModeAndCreateNewChat(nextMode)
          await verifyModeState(nextMode)

          console.log(`Cycle ${cycle + 1}: Successfully switched from ${currentMode} to ${nextMode}`)
        }

        console.log(`Cycle ${cycle + 1} completed`)
      }

      console.log('Cyclic mode switching test completed successfully')
    })

    test('快速连续模式切换测试', async () => {
      test.setTimeout(180000) // 3 minutes
      await selectTestHost()
      await openAiDialog()

      const switchSequence = ['Chat', 'Agent', 'Command', 'Chat', 'Agent', 'Command'] as const

      console.log('Starting rapid mode switching test')

      for (let i = 0; i < switchSequence.length; i++) {
        const targetMode = switchSequence[i]
        console.log(`Rapid switch ${i + 1}/${switchSequence.length}: Switching to ${targetMode}`)

        await switchToModeAndCreateNewChat(targetMode)
        await verifyModeState(targetMode)

        // Shorter wait for rapid switching
        await electronHelper.window?.waitForTimeout(300)
      }

      console.log('Rapid mode switching test completed successfully')
    })

    test('模式切换后UI一致性验证测试', async () => {
      test.setTimeout(180000) // 3 minutes
      await selectTestHost()
      await openAiDialog()

      const modes: Array<'Chat' | 'Command' | 'Agent'> = ['Chat', 'Command', 'Agent']

      console.log('Starting UI consistency verification test')

      for (const mode of modes) {
        console.log(`Testing UI consistency for ${mode} mode`)

        await switchToModeAndCreateNewChat(mode)
        await verifyModeState(mode)

        // Additional UI consistency checks
        const expectedPlaceholders = {
          Chat: '与AI对话，学习，头脑风暴（无法操作服务器）',
          Command: '需要到当前活跃终端执行命令，请先在终端窗口中连接目标主机',
          Agent: '到任意主机执行命令查询，排查错误和任务处理等任何事情'
        }

        // Verify input box is interactive
        const inputBox = electronHelper.window?.getByRole('textbox', { name: expectedPlaceholders[mode] })
        await inputBox?.click()
        await inputBox?.fill(`Test input for ${mode} mode`)
        await inputBox?.clear()

        // Verify AI model selector is still functional
        // Use the same selector as selectAiModel function for consistency
        const modelSelector = electronHelper.window?.locator('.input-controls .ant-select:nth-child(2) .ant-select-selection-item')
        await modelSelector?.waitFor({ timeout: 10000 })

        console.log(`UI consistency verified for ${mode} mode`)

        // Wait between mode tests
        await electronHelper.window?.waitForTimeout(1000)
      }

      console.log('UI consistency verification test completed successfully')
    })

    test('同模式重复切换测试', async () => {
      test.setTimeout(120000) // 2 minutes
      await selectTestHost()
      await openAiDialog()

      const testMode = 'Chat'
      const attempts = 5

      console.log(`Starting same mode repeated switch test for ${testMode} mode (${attempts} attempts)`)

      // First switch to a different mode
      await switchToModeAndCreateNewChat('Command')
      await verifyModeState('Command')

      // Now repeatedly switch to the same target mode
      for (let i = 0; i < attempts; i++) {
        console.log(`Same mode switch attempt ${i + 1}/${attempts}`)

        await switchToModeAndCreateNewChat(testMode)
        await verifyModeState(testMode)

        await electronHelper.window?.waitForTimeout(500)
      }

      console.log('Same mode repeated switch test completed successfully')
    })

    test('模式切换错误恢复测试', async () => {
      test.setTimeout(180000) // 3 minutes
      await selectTestHost()
      await openAiDialog()

      console.log('Starting mode switch error recovery test')

      // Test recovery from potential UI state issues
      const modes: Array<'Chat' | 'Command' | 'Agent'> = ['Chat', 'Command', 'Agent']

      for (const mode of modes) {
        console.log(`Testing error recovery for ${mode} mode`)

        try {
          // Attempt mode switch with increased retry count
          await switchToModeAndCreateNewChat(mode, 3)
          await verifyModeState(mode)

          // Simulate some interaction that might cause issues
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
          // Continue with other modes even if one fails
        }

        await electronHelper.window?.waitForTimeout(1000)
      }

      console.log('Mode switch error recovery test completed')
    })
  })

  test.describe.skip('AI模型选择测试', () => {
    test('获取可用AI模型列表', async () => {
      test.setTimeout(60000) // 1 minute
      await selectTestHost()

      // Get available models
      const models = await getAvailableAiModels()
      console.log('Available AI models:', models)

      expect(models.length).toBeGreaterThan(0)
    })

    test('选择Qwen-Plus模型', async () => {
      test.setTimeout(60000) // 1 minute
      await selectTestHost()

      // Select Qwen-Plus model
      await selectAiModel('Qwen-Plus')

      // Verify the model is selected (optional additional verification)
      await electronHelper.window?.waitForTimeout(1000)
    })

    test('选择Qwen-Turbo模型', async () => {
      test.setTimeout(60000) // 1 minute
      await selectTestHost()

      // Select Qwen-Turbo model
      await selectAiModel('Qwen-Turbo')

      await electronHelper.window?.waitForTimeout(1000)
    })

    test('选择Deepseek-V3.1模型', async () => {
      test.setTimeout(60000) // 1 minute
      await selectTestHost()
      await openAiDialog()

      // Select Deepseek-V3.1 model
      await selectAiModel('Deepseek-V3.1')

      await electronHelper.window?.waitForTimeout(1000)
    })

    test('选择Deepseek-R1思考模型', async () => {
      test.setTimeout(60000) // 1 minute
      await selectTestHost()

      // Select Deepseek-R1-Thinking model
      await selectAiModel('Deepseek-R1-Thinking')

      await electronHelper.window?.waitForTimeout(1000)
    })

    test('测试不同模型的组合使用', async () => {
      test.setTimeout(120000) // 2 minutes
      await selectTestHost()

      // Test selecting multiple models in sequence
      const modelsToTest = ['Qwen-Plus', 'Qwen-Turbo', 'Deepseek-V3.1']

      for (const modelName of modelsToTest) {
        console.log(`Testing model: ${modelName}`)
        await selectAiModel(modelName)
        await electronHelper.window?.waitForTimeout(2000) // Wait between selections
      }

      // Final verification with the last selected model
      console.log('All model selections completed successfully')
    })
  })
})
