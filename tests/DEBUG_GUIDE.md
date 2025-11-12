# Playwright E2E 测试调试指南

本指南将帮助你调试 Chaterm 项目中的 Playwright E2E 测试，包括 `tests/e2e/AI-functions.test.ts` 等测试文件。

## 前置准备

### 1. 确保项目已编译

```bash
# 构建项目
npm run build
```

### 2. 检查测试文件路径

确保以下文件存在：

- `tests/e2e/AI-functions.test.ts`
- `tests/helpers/electron-helper.ts`
- `playwright.config.ts`

### 3. 环境准备

- 已配置好1台主机名为test的可连接的测试服务器

## 调试方法

### 方法一：命令行调试（推荐）

#### 1. 基本运行（无头模式）

```bash
# 运行所有 E2E 测试
npx playwright test tests/e2e/

# 运行特定测试文件
npx playwright test tests/e2e/AI-functions.test.ts
```

#### 2. 带界面运行（可视化调试）

```bash
# 显示浏览器窗口运行 AI 功能测试
npx playwright test tests/e2e/AI-functions.test.ts --headed

# 包含详细日志
npx playwright test tests/e2e/AI-functions.test.ts --headed --reporter=line
```

#### 3. 调试模式（逐步执行）

```bash
# 进入调试模式，可以逐步执行
npx playwright test tests/e2e/AI-functions.test.ts --debug
```

#### 4. UI 模式（最直观）

```bash
# 使用 Playwright 的图形界面调试 AI 测试
npx playwright test tests/e2e/AI-functions.test.ts --ui
```

#### 5. 运行特定测试用例

```bash

# 运行特定的 AI 模式测试
npx playwright test tests/e2e/AI-functions.test.ts --grep "测试Chat模式"
npx playwright test tests/e2e/AI-functions.test.ts --grep "测试 Command 模式"
npx playwright test tests/e2e/AI-functions.test.ts --grep "测试 Agent 模式"

# Debug特定测试用例
npx playwright test tests/e2e/AI-functions.test.ts --grep "系统资源监控" --debug
```

#### 6. 详细日志调试

```bash
# 启用详细的API日志调试 AI 测试
DEBUG=pw:api npx playwright test tests/e2e/AI-functions.test.ts --headed

# 启用所有Playwright日志
DEBUG=pw:* npx playwright test tests/e2e/AI-functions.test.ts --headed

# 仅显示浏览器日志
DEBUG=pw:browser npx playwright test tests/e2e/AI-functions.test.ts --headed
```

### 方法二：VSCode 调试

#### 1. 使用预设的调试配置

1. 打开任意 E2E 测试文件（如 `tests/e2e/AI-functions.test.ts`）
2. 按 `F5` 或点击调试菜单
3. 选择合适的调试配置
4. 设置断点并开始调试

#### 2. 调试当前文件

1. 在 VSCode 中打开任意 E2E 测试文件
2. 选择 "Debug Playwright E2E Tests" 配置
3. 将会调试当前打开的测试文件

### 方法三：使用 package.json 脚本

```bash
# 使用项目预定义的脚本
npm run test:e2e

# UI模式
npm run test:e2e:ui

# 带界面运行
npm run test:e2e:headed
```

## 常见问题排查

### 1. 应用启动失败

**现象**: ElectronApplication.launch() 失败
**解决方案**:

```bash
# 确保项目已构建
npm run build

# 检查 out/main/index.js 是否存在
ls -la out/main/

# 如果文件不存在，重新构建
npm run build
```

### 2. 元素选择器不工作

**现象**: 找不到页面元素（特别是 AI 模式切换、模型选择等）
**解决方案**:

- 使用 `--headed` 模式查看实际的UI
- 检查 `data-testid` 属性是否存在
- 使用浏览器开发者工具检查元素选择器
- 对于 AI 功能测试，注意检查模式选择器和模型下拉框的可见性

### 3. 测试超时

**现象**: 测试执行超时（AI 测试通常需要更长时间）
**解决方案**:

```bash
# AI 测试增加超时时间（默认已设置为300秒-600秒）
npx playwright test tests/e2e/AI-functions.test.ts --timeout=600000

# 对于长时间运行的 Agent 模式测试
npx playwright test tests/e2e/AI-functions.test.ts --grep "智能系统诊断" --timeout=900000
```

### 4. AI 模式切换失败

**现象**: 无法正确切换到 Chat/Command/Agent 模式
**解决方案**:

- 检查模式选择器是否可见和可点击
- 使用 `--headed` 模式观察UI状态变化
- 检查控制台是否有JavaScript错误

### 5. AI 模型选择失败

**现象**: 无法选择指定的 AI 模型（Qwen-Plus、Deepseek-V3等）
**解决方案**:

- 确认模型在下拉列表中可用
- 检查模型名称拼写是否正确
- 使用调试模式观察下拉框的展开过程

### 6. Electron 应用无法正常关闭

**现象**: 测试结束后进程残留
**解决方案**:

```bash
# 手动杀死相关进程
pkill -f electron
pkill -f chaterm
```

## AI 功能测试专门调试技巧

### 1. 调试 AI 任务执行过程

```typescript
// 在 handleTaskExecution 函数中添加调试信息
console.log('等待执行按钮或任务完成...')
await electronHelper.screenshot('before-task-execution')

// 检查任务状态
const isProcessing = await electronHelper.window?.evaluate(() => {
  const processingElement = document.querySelector('.processing-text')
  return processingElement !== null
})
console.log('任务处理中:', isProcessing)
```

### 2. 调试模式切换

```typescript
// 在 switchToModeAndCreateNewChat 函数中添加调试
console.log(`当前模式: ${currentMode}, 目标模式: ${targetMode}`)
await electronHelper.screenshot(`before-switch-to-${targetMode}`)

// 验证模式切换结果
const actualMode = await electronHelper.window?.locator('.input-controls .ant-select:first-child .ant-select-selection-item')?.textContent()
console.log(`模式切换结果: ${actualMode}`)
```

### 3. 调试 AI 模型选择

```typescript
// 在 selectAiModel 函数中添加调试
console.log(`选择AI模型: ${modelName}`)
await electronHelper.screenshot('before-model-selection')

// 获取可用模型列表
const availableModels = await electronHelper.window?.locator('.ant-select-item .model-label').allTextContents()
console.log('可用模型:', availableModels)

await electronHelper.screenshot('after-model-selection')
```

### 4. 调试主机选择

```typescript
// 在 selectFirstHost 函数中添加调试
console.log('等待主机列表加载...')
await electronHelper.screenshot('host-list-state')

// 检查主机可用性
const hostCount = await electronHelper.window?.locator('.dark-tree .title-with-icon .computer-icon + span').count()
console.log(`可用主机数量: ${hostCount}`)
```

## 调试技巧

### 1. 添加调试语句

在测试代码中添加调试信息：

```typescript
console.log('DEBUG: 当前步骤执行中')
await electronHelper.screenshot('debug-step-1')
await electronHelper.window?.waitForTimeout(5000) // 暂停观察
```

### 2. 使用截图调试

```typescript
// 在关键步骤截图
await electronHelper.screenshot('before-ai-task')
await executeTask('Agent', 'execute top command')
await electronHelper.screenshot('after-ai-task')
```

### 3. 检查元素可见性

```typescript
// 调试元素选择器问题
const isVisible = await electronHelper.window?.locator('[data-testid="terminal-container"]').isVisible()
console.log('Terminal visible:', isVisible)

// 检查AI控件状态
const modeSelector = electronHelper.window?.locator('.input-controls .ant-select:first-child')
const isModeVisible = await modeSelector?.isVisible()
console.log('Mode selector visible:', isModeVisible)
```

### 4. 获取页面信息

```typescript
// 在测试中获取页面信息
if (electronHelper.window) {
  const url = electronHelper.window.url()
  const title = await electronHelper.window.title()
  console.log('Page URL:', url)
  console.log('Page Title:', title)

  // 获取当前AI模式和模型
  const currentMode = await electronHelper.window.locator('.input-controls .ant-select:first-child .ant-select-selection-item').textContent()
  const currentModel = await electronHelper.window.locator('.input-controls .ant-select:nth-child(2) .ant-select-selection-item').textContent()
  console.log('Current AI Mode:', currentMode)
  console.log('Current AI Model:', currentModel)
}
```

### 5. AI 特定调试技巧

```typescript
// 检查AI响应状态
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

## 生成测试报告

### HTML 报告

```bash
# 运行测试并生成报告
npx playwright test tests/e2e/AI-functions.test.ts

# 查看报告
npx playwright show-report
```

### 自定义报告

```bash
# 生成详细的JSON报告
npx playwright test tests/e2e/AI-functions.test.ts --reporter=json

# 生成JUnit报告
npx playwright test tests/e2e/AI-functions.test.ts --reporter=junit
```

## 高级调试选项

### 1. 录制视频

在 `playwright.config.ts` 中已配置视频录制，失败时会自动录制。

### 2. 网络调试

```bash
# 查看网络请求
DEBUG=pw:api npx playwright test tests/e2e/AI-functions.test.ts --headed
```

### 3. 慢动作模式

```typescript
// 在测试中添加慢动作
await electronHelper.app?.launch({
  args: [...],
  slowMo: 1000 // 每个操作延迟1秒
})
```

### 4. AI 测试专用调试选项

```bash
# 长时间运行的AI测试，启用所有调试信息
DEBUG=pw:* npx playwright test tests/e2e/AI-functions.test.ts --grep "智能系统诊断" --headed --timeout=900000

# 仅调试模式切换相关测试
npx playwright test tests/e2e/AI-functions.test.ts --grep "AI模式切换" --debug

# 调试特定AI模型的测试
npx playwright test tests/e2e/AI-functions.test.ts --grep "Deepseek-R1" --headed --reporter=line
```

## 故障排除清单

在遇到问题时，请按以下顺序检查：

### 基础环境检查

1. ✅ 项目是否已构建 (`npm run build`)
2. ✅ `out/main/index.js` 文件是否存在
3. ✅ Node.js 和 npm 版本是否符合要求
4. ✅ Playwright 依赖是否正确安装
5. ✅ Electron 应用是否能够正常启动

### AI 功能特定检查

6. ✅ 是否已配置 AI API 密钥
7. ✅ 网络连接是否正常（AI API 调用需要）
8. ✅ AI 模型列表是否正确加载
9. ✅ 主机连接是否正常建立
10. ✅ 测试用例的超时设置是否合理

### 测试执行检查

11. ✅ 测试文件路径是否正确
12. ✅ 选择器是否匹配当前UI状态
13. ✅ 是否有进程冲突或端口占用
14. ✅ 截图和视频记录是否正常工作

## 常用调试命令汇总

```bash
# 快速诊断命令
npx playwright test tests/e2e/AI-functions.test.ts --list  # 列出所有测试用例
npx playwright test tests/e2e/AI-functions.test.ts --dry-run  # 预运行测试（不执行）

# 常用调试命令组合
npx playwright test tests/e2e/AI-functions.test.ts --headed --debug --timeout=0  # 无超时调试
npx playwright test tests/e2e/AI-functions.test.ts --ui --timeout=600000  # UI模式长超时
DEBUG=pw:* npx playwright test tests/e2e/AI-functions.test.ts --headed --reporter=line  # 全量日志

# 特定功能调试
npx playwright test tests/e2e/AI-functions.test.ts --grep "Chat" --headed  # 仅Chat模式
npx playwright test tests/e2e/AI-functions.test.ts --grep "Agent" --debug  # Agent模式调试
npx playwright test tests/e2e/AI-functions.test.ts --grep "模式切换" --ui  # 模式切换UI调试
```

## 性能调试

### 1. 测试执行时间分析

```bash
# 生成带时间的详细报告
npx playwright test tests/e2e/AI-functions.test.ts --reporter=html,line

# 分析慢速测试
npx playwright test tests/e2e/AI-functions.test.ts --reporter=json --output-dir=test-results
```

### 2. 内存使用监控

```typescript
// 在测试中监控内存使用
const memoryBefore = process.memoryUsage()
await runAgentTest('执行系统诊断')
const memoryAfter = process.memoryUsage()

console.log('Memory usage:', {
  heapUsed: (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024,
  external: (memoryAfter.external - memoryBefore.external) / 1024 / 1024
})
```

## 最佳实践

### 1. 测试组织

- 按功能模块组织测试（Chat、Command、Agent）
- 使用 `.skip` 跳过不稳定的测试
- 合理设置超时时间（AI测试通常需要更长时间）

### 2. 调试效率

- 优先使用 `--headed` 模式观察UI行为
- 使用截图记录关键状态
- 添加有意义的 console.log 信息

### 3. 问题定位

- 从简单测试开始调试
- 逐步增加复杂度
- 保存失败时的截图和视频

### 4. 持续集成

- 在CI/CD中使用无头模式
- 配置合适的重试机制
- 保存测试制品（截图、视频、报告）

## 参考资源

- [Playwright官方文档](https://playwright.dev/)
- [Electron测试指南](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [AI-functions.test.ts 测试文件](./tests/e2e/AI-functions.test.ts)
- [Electron Helper工具](./tests/helpers/electron-helper.ts)

---

**注意**: 本指南基于当前的 Chaterm 项目结构和 AI 功能设计。如果项目结构发生变化，请相应更新此指南。

如果遇到本指南未涵盖的问题，请参考项目的 [测试文档](./tests/README.md) 或提交 issue。
