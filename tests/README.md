# Chaterm 测试指南

这是一个完整的测试文档，说明如何运行和扩展Chaterm项目的各种测试。

## 🎯 测试架构概览

```
tests/
├── unit/                    # 单元测试
│   ├── components/AiTab/   # AI组件测试
│   ├── api/                # API提供商测试
│   └── utils/              # 工具函数测试
├── integration/            # 集成测试
│   ├── ssh-database.test.ts    # SSH服务与数据库集成
│   └── ai-message.test.ts      # AI服务与消息存储集成
├── e2e/                    # 端到端测试
│   └── AI-functions.test.ts   # AI工作流程测试
├── setup/                  # 测试环境配置
│   ├── unit.ts            # 单元测试配置
│   └── integration.ts     # 集成测试配置
├── helpers/                # 测试辅助工具
│   └── electron-helper.ts # Electron测试辅助类
├── fixtures/               # 测试数据
│   └── test-connections.json  # 测试连接配置
├── mocks/                  # Mock数据和服务
└── screenshots/            # E2E测试截图
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 运行所有测试

```bash
npm run test:all
```

### 3. 分别运行不同类型的测试

```bash
# 单元测试
npm run test:unit

# 集成测试
npm run test:integration

# E2E测试
npm run test:e2e
```

## 📋 可用测试命令

| 命令                         | 描述                     | 用途              |
| ---------------------------- | ------------------------ | ----------------- |
| `npm test`                   | 运行单元测试（监视模式） | 开发时使用        |
| `npm run test:unit`          | 运行所有单元测试         | 快速验证代码逻辑  |
| `npm run test:integration`   | 运行集成测试             | 验证模块间交互    |
| `npm run test:e2e`           | 运行E2E测试              | 验证完整用户流程  |
| `npm run test:e2e:ui`        | 运行E2E测试（UI模式）    | 可视化调试E2E测试 |
| `npm run test:e2e:headed`    | 运行E2E测试（有头模式）  | 观察测试执行过程  |
| `npm run test:watch`         | 监视模式运行测试         | 开发时持续测试    |
| `npm run test:coverage`      | 运行测试并生成覆盖率报告 | 检查测试覆盖率    |
| `npm run test:ai`            | 运行AI相关测试           | 专项测试AI功能    |
| `npm run test:all`           | 运行所有测试             | CI/CD流水线使用   |
| `npm run test:build-and-e2e` | 构建后运行E2E测试        | 生产环境验证      |

## 🧪 测试类型详解

### 单元测试 (Unit Tests)

**目的**: 测试单个函数、类或组件的功能
**工具**: Vitest + Vue Test Utils
**位置**: `tests/unit/`

**示例**:

```typescript
test('应该正确创建ChatMessage', () => {
  const message = createNewMessage('user', 'Hello AI')
  expect(message).toMatchObject({
    role: 'user',
    content: 'Hello AI',
    timestamp: expect.any(Number)
  })
})
```

**覆盖范围**:

- ✅ AI工具函数 (`utils.test.ts`)
- ✅ 类型验证 (`types.test.ts`)
- ✅ Vue组件 (`index.test.ts`)
- ✅ API提供商 (`providers/`)

### 集成测试 (Integration Tests)

**目的**: 测试不同模块之间的交互和数据流
**工具**: Vitest + Better-sqlite3 + Mock服务
**位置**: `tests/integration/`

**示例**:

```typescript
test('SSH服务与数据库集成', async () => {
  const connection = await sshService.createConnection(config)
  await sshService.connect(connection.id)

  const result = await sshService.executeCommand(connection.id, 'ls -la')

  // 验证命令执行和数据库存储
  expect(result.code).toBe(0)
  const history = sshService.getCommandHistory(connection.id)
  expect(history).toHaveLength(1)
})
```

**覆盖范围**:

- ✅ SSH服务与数据库交互 (`ssh-database.test.ts`)
- ✅ AI服务与消息存储 (`ai-message.test.ts`)

### 端到端测试 (E2E Tests)

**目的**: 从用户角度测试完整的应用工作流程
**工具**: Playwright + Electron
**位置**: `tests/e2e/`

**示例**:

```typescript
test('完整的SSH连接→命令执行→AI对话流程', async () => {
  // 1. 启动应用
  await electronHelper.launch()

  // 2. 创建SSH连接
  await electronHelper.createSSHConnection(config)

  // 3. 执行命令
  await electronHelper.executeCommand('ls -la')

  // 4. AI对话
  await electronHelper.sendAIMessage('解释ls命令输出')
  const response = await electronHelper.waitForAIResponse()

  expect(response.length).toBeGreaterThan(0)
})
```

**覆盖范围**:

- ✅ 应用启动和初始化 (`app-startup.test.ts`)
- ✅ 键盘快捷键和交互
- ✅ 错误处理和恢复

## 📊 测试覆盖率

当前设置的覆盖率目标：

- **分支覆盖率**: 70%
- **函数覆盖率**: 70%
- **行覆盖率**: 70%
- **语句覆盖率**: 70%

查看详细覆盖率报告：

```bash
npm run test:coverage
open coverage/index.html  # 打开HTML报告
```

## 🛠️ 开发工作流程

### 1. 新功能开发

```bash
# 启动监视模式
npm run test:watch

# 编写代码和测试...
# 测试会自动运行并显示结果
```

### 2. 提交代码前

```bash
# 运行完整测试套件
npm run test:all

# 检查测试覆盖率
npm run test:coverage
```

### 3. 调试E2E测试

```bash
# 运行带界面的E2E测试
npm run test:e2e:headed

# 使用Playwright UI模式
npm run test:e2e:ui
```

### 4. 修复Bug时

```bash
# 先写回归测试
# 再修复代码
# 确保测试通过
npm run test:all
```

## 🔧 扩展测试

### 添加新的单元测试

1. 在 `tests/unit/` 下创建测试文件
2. 遵循命名约定: `*.test.ts`
3. 使用现有的工具函数和Mock数据

```typescript
// tests/unit/new-feature.test.ts
import { describe, test, expect } from 'vitest'
import { newFeature } from '@/path/to/feature'

describe('新功能测试', () => {
  test('应该正确处理输入', () => {
    const result = newFeature('input')
    expect(result).toBe('expected output')
  })
})
```

### 添加新的集成测试

1. 在 `tests/integration/` 下创建测试文件
2. 使用 `tests/setup/integration.ts` 中的辅助函数
3. 创建真实的数据库和服务交互

```typescript
// tests/integration/new-integration.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase } from '../setup/integration'

describe('新服务集成测试', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    db.close()
  })

  test('应该正确集成新服务', async () => {
    // 测试代码
  })
})
```

### 添加新的E2E测试

1. 在 `tests/e2e/` 下创建测试文件
2. 使用 `ElectronHelper` 类进行应用交互
3. 为关键用户流程编写测试

```typescript
// tests/e2e/new-workflow.test.ts
import { test, expect } from '@playwright/test'
import { ElectronHelper } from '../helpers/electron-helper'

test.describe('新工作流程E2E测试', () => {
  let electronHelper: ElectronHelper

  test.beforeEach(async () => {
    electronHelper = new ElectronHelper()
    await electronHelper.launch()
    await electronHelper.waitForAppReady()
  })

  test.afterEach(async () => {
    await electronHelper.close()
  })

  test('新功能完整流程', async () => {
    // 测试步骤
  })
})
```

## 🐛 常见问题解决

### Q: 单元测试运行失败

**可能原因**:

- 依赖导入路径错误
- Mock数据配置问题
- 组件依赖未正确处理

**解决方案**:

```bash
# 检查配置
cat vitest.config.ts

# 验证路径别名
npm run typecheck
```

### Q: 集成测试数据库错误

**可能原因**:

- 测试数据库路径问题
- SQLite权限问题
- 并发访问冲突

**解决方案**:

```bash
# 清理测试数据
rm -rf tests/fixtures/test.db

# 单独运行集成测试
npm run test:integration
```

### Q: E2E测试超时或失败

**可能原因**:

- 应用构建不完整
- Electron启动超时
- UI元素选择器变化

**解决方案**:

```bash
# 确保应用已构建
npm run build

# 运行有头模式查看问题
npm run test:e2e:headed

# 更新截图
npm run test:e2e
```

### Q: 测试覆盖率不足

**解决方案**:

```bash
# 查看详细覆盖率报告
npm run test:coverage
open coverage/index.html

# 识别未覆盖的代码
# 编写相应测试用例
```

## 📈 性能测试

### 内存使用监控

```bash
# 运行带内存监控的测试
NODE_OPTIONS="--max-old-space-size=4096" npm run test:all
```

### 测试执行时间分析

```bash
# 生成测试性能报告
npm run test:coverage -- --reporter=verbose
```

## 🔄 持续集成 (CI/CD)

### GitHub Actions 配置示例

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run build
      - run: npm run test:e2e
```

## 📝 最佳实践

### 1. 测试命名规范

- 描述性的测试名称
- 使用"应该..."的格式
- 中文描述更清晰

### 2. 测试结构

```typescript
describe('功能模块', () => {
  beforeEach(() => {
    // 每个测试前的准备工作
  })

  test('应该在正常情况下工作', () => {
    // Arrange - 准备数据
    // Act - 执行操作
    // Assert - 验证结果
  })

  test('应该正确处理错误情况', () => {
    // 错误情况测试
  })
})
```

### 3. Mock数据管理

- 使用 `tests/fixtures/` 存储测试数据
- 保持Mock数据的真实性
- 定期更新测试数据

### 4. 测试隔离

- 每个测试独立运行
- 清理测试副作用
- 避免测试间相互依赖

## 🎉 总结

通过这套完整的测试方案，您可以：

- ✅ **快速验证**代码逻辑（单元测试）
- ✅ **确保模块协作**正常（集成测试）
- ✅ **验证用户体验**完整（E2E测试）
- ✅ **持续监控**代码质量（覆盖率报告）
- ✅ **自动化**测试流程（CI/CD集成）

现在您拥有了一套完整、可靠的测试体系，可以大大提高代码质量和开发效率！ 🚀

---

**需要帮助？** 查看具体测试文件中的示例代码，或参考 `TESTING_SETUP.md` 获取更多详细信息。
