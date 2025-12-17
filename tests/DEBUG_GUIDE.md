# Playwright E2E Testing Debug Guide

This guide will help you debug Playwright E2E tests in the Chaterm project, including test files such as `tests/e2e/AI-functions.test.ts`.

## Prerequisites

### 1. Ensure the project is built

```bash
# Build the project
npm run build
```

### 2. Check test file paths

Ensure the following files exist:

- `tests/e2e/AI-functions.test.ts`
- `tests/helpers/electron-helper.ts`
- `playwright.config.ts`

### 3. Environment setup

- A test server with hostname "test" that can be connected to is configured

## Debugging Methods

### Method 1: Command Line Debugging (Recommended)

#### 1. Basic run (headless mode)

```bash
# Run all E2E tests
npx playwright test tests/e2e/

# Run a specific test file
npx playwright test tests/e2e/AI-functions.test.ts
```

#### 2. Run with UI (visual debugging)

```bash
# Run AI function tests with browser window visible
npx playwright test tests/e2e/AI-functions.test.ts --headed

# With detailed logs
npx playwright test tests/e2e/AI-functions.test.ts --headed --reporter=line
```

#### 3. Debug mode (step-by-step execution)

```bash
# Enter debug mode for step-by-step execution
npx playwright test tests/e2e/AI-functions.test.ts --debug
```

#### 4. UI mode (most intuitive)

```bash
# Use Playwright's graphical interface to debug AI tests
npx playwright test tests/e2e/AI-functions.test.ts --ui
```

#### 5. Run specific test cases

```bash

# Run specific AI mode tests
npx playwright test tests/e2e/AI-functions.test.ts --grep "测试Chat模式"
npx playwright test tests/e2e/AI-functions.test.ts --grep "测试 Command 模式"
npx playwright test tests/e2e/AI-functions.test.ts --grep "测试 Agent 模式"

# Debug specific test cases
npx playwright test tests/e2e/AI-functions.test.ts --grep "系统资源监控" --debug
```

#### 6. Detailed log debugging

```bash
# Enable detailed API logs for debugging AI tests
DEBUG=pw:api npx playwright test tests/e2e/AI-functions.test.ts --headed

# Enable all Playwright logs
DEBUG=pw:* npx playwright test tests/e2e/AI-functions.test.ts --headed

# Show browser logs only
DEBUG=pw:browser npx playwright test tests/e2e/AI-functions.test.ts --headed
```

### Method 2: VSCode Debugging

#### 1. Use preset debug configurations

1. Open any E2E test file (e.g., `tests/e2e/AI-functions.test.ts`)
2. Press `F5` or click the debug menu
3. Select an appropriate debug configuration
4. Set breakpoints and start debugging

#### 2. Debug current file

1. Open any E2E test file in VSCode
2. Select the "Debug Playwright E2E Tests" configuration
3. This will debug the currently open test file

### Method 3: Using package.json scripts

```bash
# Use project predefined scripts
npm run test:e2e

# UI mode
npm run test:e2e:ui

# Run with UI
npm run test:e2e:headed
```

## Common Issues Troubleshooting

### 1. Application launch failure

**Symptom**: ElectronApplication.launch() fails
**Solution**:

```bash
# Ensure the project is built
npm run build

# Check if out/main/index.js exists
ls -la out/main/

# If the file doesn't exist, rebuild
npm run build
```

### 2. Element selectors not working

**Symptom**: Cannot find page elements (especially AI mode switching, model selection, etc.)
**Solution**:

- Use `--headed` mode to view the actual UI
- Check if `data-testid` attributes exist
- Use browser developer tools to inspect element selectors
- For AI function tests, pay attention to checking the visibility of mode selectors and model dropdowns

### 3. Test timeout

**Symptom**: Test execution times out (AI tests typically require longer time)
**Solution**:

```bash
# Increase timeout for AI tests (default is set to 300-600 seconds)
npx playwright test tests/e2e/AI-functions.test.ts --timeout=600000

# For long-running Agent mode tests
npx playwright test tests/e2e/AI-functions.test.ts --grep "智能系统诊断" --timeout=900000
```

### 4. AI mode switching failure

**Symptom**: Cannot correctly switch to Chat/Command/Agent mode
**Solution**:

- Check if the mode selector is visible and clickable
- Use `--headed` mode to observe UI state changes
- Check the console for JavaScript errors

### 5. AI model selection failure

**Symptom**: Cannot select the specified AI model (Qwen-Plus, Deepseek-V3, etc.)
**Solution**:

- Confirm the model is available in the dropdown list
- Check if the model name spelling is correct
- Use debug mode to observe the dropdown expansion process

### 6. Electron application cannot close properly

**Symptom**: Processes remain after test completion
**Solution**:

```bash
# Manually kill related processes
pkill -f electron
pkill -f chaterm
```

## AI Function Testing Specific Debugging Tips

### 1. Debug AI task execution process

```typescript
// Add debug information in the handleTaskExecution function
console.log('Waiting for execute button or task completion...')
await electronHelper.screenshot('before-task-execution')

// Check task status
const isProcessing = await electronHelper.window?.evaluate(() => {
  const processingElement = document.querySelector('.processing-text')
  return processingElement !== null
})
console.log('Task processing:', isProcessing)
```

### 2. Debug mode switching

```typescript
// Add debugging in the switchToModeAndCreateNewChat function
console.log(`Current mode: ${currentMode}, Target mode: ${targetMode}`)
await electronHelper.screenshot(`before-switch-to-${targetMode}`)

// Verify mode switching result
const actualMode = await electronHelper.window?.locator('.input-controls .ant-select:first-child .ant-select-selection-item')?.textContent()
console.log(`Mode switching result: ${actualMode}`)
```

### 3. Debug AI model selection

```typescript
// Add debugging in the selectAiModel function
console.log(`Selecting AI model: ${modelName}`)
await electronHelper.screenshot('before-model-selection')

// Get available model list
const availableModels = await electronHelper.window?.locator('.ant-select-item .model-label').allTextContents()
console.log('Available models:', availableModels)

await electronHelper.screenshot('after-model-selection')
```

### 4. Debug host selection

```typescript
// Add debugging in the selectFirstHost function
console.log('Waiting for host list to load...')
await electronHelper.screenshot('host-list-state')

// Check host availability
const hostCount = await electronHelper.window?.locator('.dark-tree .title-with-icon .computer-icon + span').count()
console.log(`Available host count: ${hostCount}`)
```

## Debugging Tips

### 1. Add debug statements

Add debug information in test code:

```typescript
console.log('DEBUG: Current step executing')
await electronHelper.screenshot('debug-step-1')
await electronHelper.window?.waitForTimeout(5000) // Pause for observation
```

### 2. Use screenshots for debugging

```typescript
// Take screenshots at key steps
await electronHelper.screenshot('before-ai-task')
await executeTask('Agent', 'execute top command')
await electronHelper.screenshot('after-ai-task')
```

### 3. Check element visibility

```typescript
// Debug element selector issues
const isVisible = await electronHelper.window?.locator('[data-testid="terminal-container"]').isVisible()
console.log('Terminal visible:', isVisible)

// Check AI control status
const modeSelector = electronHelper.window?.locator('.input-controls .ant-select:first-child')
const isModeVisible = await modeSelector?.isVisible()
console.log('Mode selector visible:', isModeVisible)
```

### 4. Get page information

```typescript
// Get page information in tests
if (electronHelper.window) {
  const url = electronHelper.window.url()
  const title = await electronHelper.window.title()
  console.log('Page URL:', url)
  console.log('Page Title:', title)

  // Get current AI mode and model
  const currentMode = await electronHelper.window.locator('.input-controls .ant-select:first-child .ant-select-selection-item').textContent()
  const currentModel = await electronHelper.window.locator('.input-controls .ant-select:nth-child(2) .ant-select-selection-item').textContent()
  console.log('Current AI Mode:', currentMode)
  console.log('Current AI Model:', currentModel)
}
```

### 5. AI-specific debugging tips

```typescript
// Check AI response status
const checkAiResponseStatus = async () => {
  const isProcessing = await electronHelper.window?.evaluate(() => {
    const processingElement = document.querySelector('.processing-text')
    const executeButton = document.querySelector('button[aria-label*="执行"]')
    const completionText = document.querySelector('text[contains="开始新任务"]')

    return {
      isProcessing: processingElement !== null,
      hasExecuteButton: executeButton !== null,
      isCompleted: completionText !== null
    }
  })

  console.log('AI Response Status:', isProcessing)
  return isProcessing
}
```

## Generate Test Reports

### HTML Report

```bash
# Run tests and generate report
npx playwright test tests/e2e/AI-functions.test.ts

# View report
npx playwright show-report
```

### Custom Reports

```bash
# Generate detailed JSON report
npx playwright test tests/e2e/AI-functions.test.ts --reporter=json

# Generate JUnit report
npx playwright test tests/e2e/AI-functions.test.ts --reporter=junit
```

## Advanced Debugging Options

### 1. Video recording

Video recording is configured in `playwright.config.ts` and will automatically record on failure.

### 2. Network debugging

```bash
# View network requests
DEBUG=pw:api npx playwright test tests/e2e/AI-functions.test.ts --headed
```

### 3. Slow motion mode

```typescript
// Add slow motion in tests
await electronHelper.app?.launch({
  args: [...],
  slowMo: 1000 // Delay each operation by 1 second
})
```

### 4. AI test-specific debugging options

```bash
# Long-running AI tests with all debug information enabled
DEBUG=pw:* npx playwright test tests/e2e/AI-functions.test.ts --grep "智能系统诊断" --headed --timeout=900000

# Debug only mode switching related tests
npx playwright test tests/e2e/AI-functions.test.ts --grep "AI模式切换" --debug

# Debug tests for specific AI models
npx playwright test tests/e2e/AI-functions.test.ts --grep "Deepseek-R1" --headed --reporter=line
```

## Troubleshooting Checklist

When encountering issues, check in the following order:

### Basic Environment Check

1. ✅ Is the project built (`npm run build`)
2. ✅ Does the `out/main/index.js` file exist
3. ✅ Do Node.js and npm versions meet requirements
4. ✅ Are Playwright dependencies correctly installed
5. ✅ Can the Electron application start normally

### AI Function Specific Checks

6. ✅ Is the AI API key configured
7. ✅ Is the network connection normal (required for AI API calls)
8. ✅ Is the AI model list loaded correctly
9. ✅ Is the host connection established normally
10. ✅ Are the test case timeout settings reasonable

### Test Execution Checks

11. ✅ Is the test file path correct
12. ✅ Do selectors match the current UI state
13. ✅ Are there process conflicts or port usage
14. ✅ Are screenshots and video recording working normally

## Common Debugging Commands Summary

```bash
# Quick diagnostic commands
npx playwright test tests/e2e/AI-functions.test.ts --list  # List all test cases
npx playwright test tests/e2e/AI-functions.test.ts --dry-run  # Pre-run tests (without execution)

# Common debugging command combinations
npx playwright test tests/e2e/AI-functions.test.ts --headed --debug --timeout=0  # Debug without timeout
npx playwright test tests/e2e/AI-functions.test.ts --ui --timeout=600000  # UI mode with long timeout
DEBUG=pw:* npx playwright test tests/e2e/AI-functions.test.ts --headed --reporter=line  # Full logs

# Specific function debugging
npx playwright test tests/e2e/AI-functions.test.ts --grep "Chat" --headed  # Chat mode only
npx playwright test tests/e2e/AI-functions.test.ts --grep "Agent" --debug  # Agent mode debugging
npx playwright test tests/e2e/AI-functions.test.ts --grep "模式切换" --ui  # Mode switching UI debugging
```

## Performance Debugging

### 1. Test execution time analysis

```bash
# Generate detailed report with timing
npx playwright test tests/e2e/AI-functions.test.ts --reporter=html,line

# Analyze slow tests
npx playwright test tests/e2e/AI-functions.test.ts --reporter=json --output-dir=test-results
```

### 2. Memory usage monitoring

```typescript
// Monitor memory usage in tests
const memoryBefore = process.memoryUsage()
await runAgentTest('执行系统诊断')
const memoryAfter = process.memoryUsage()

console.log('Memory usage:', {
  heapUsed: (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024,
  external: (memoryAfter.external - memoryBefore.external) / 1024 / 1024
})
```

## Best Practices

### 1. Test organization

- Organize tests by functional modules (Chat, Command, Agent)
- Use `.skip` to skip unstable tests
- Set reasonable timeout times (AI tests typically require longer time)

### 2. Debugging efficiency

- Prioritize using `--headed` mode to observe UI behavior
- Use screenshots to record key states
- Add meaningful console.log information

### 3. Issue localization

- Start debugging from simple tests
- Gradually increase complexity
- Save screenshots and videos when tests fail

### 4. Continuous integration

- Use headless mode in CI/CD
- Configure appropriate retry mechanisms
- Save test artifacts (screenshots, videos, reports)

## Reference Resources

- [Playwright Official Documentation](https://playwright.dev/)
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [AI-functions.test.ts Test File](./tests/e2e/AI-functions.test.ts)
- [Electron Helper Tool](./tests/helpers/electron-helper.ts)

---

**Note**: This guide is based on the current Chaterm project structure and AI function design. If the project structure changes, please update this guide accordingly.

If you encounter issues not covered in this guide, please refer to the project's [Test Documentation](./tests/README.md) or submit an issue.
