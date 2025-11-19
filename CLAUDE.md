# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

Chaterm 是一个基于 Electron 的 AI 驱动终端工具，提供智能命令补全、多设备管理、AI Agent 能力和企业级安全特性。

**技术栈：**

- **前端框架：** Vue 3 + TypeScript + Pinia + Vue Router + Vue I18n
- **UI 组件：** Ant Design Vue (自动导入) + Monaco Editor + xterm.js
- **桌面应用：** Electron 30 + electron-vite + electron-builder
- **数据存储：** better-sqlite3 (本地数据库) + 迁移系统
- **SSH/终端：** ssh2 + node-pty + 自定义 SSH 代理
- **AI 集成：** Anthropic Claude + OpenAI + AWS Bedrock + Ollama
- **测试框架：** Vitest (单元测试) + Playwright (E2E)
- **代码质量：** ESLint + Prettier + TypeScript + Husky (pre-commit hooks)

## 核心架构

### 三层架构

```
┌─────────────────────────────────────────────────────┐
│ Renderer Process (src/renderer) │
│ - Vue 3 SPA with Pinia state management │
│ - xterm.js for terminal UI │
│ - Monaco Editor for text editing │
│ - Ant Design Vue components │
└──────────────────┬──────────────────────────────────┘
 │ IPC (contextBridge)
┌──────────────────┴──────────────────────────────────┐
│ Preload Scripts (src/preload) │
│ - Secure API bridge between main & renderer │
│ - Type definitions in index.d.ts │
└──────────────────┬──────────────────────────────────┘
 │
┌──────────────────┴──────────────────────────────────┐
│ Main Process (src/main) │
│ ┌─────────────────────────────────────────────┐ │
│ │ Agent System (src/main/agent) │ │
│ │ - AI providers, context, tools, integrations │ │
│ │ - Path aliases: @core, @services, @api, etc.│ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ SSH Layer (src/main/ssh) │ │
│ │ - SSH connections, SFTP, port forwarding │ │
│ │ - SSH agent, jumpserver integration │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ Storage (src/main/storage) │ │
│ │ - DB layer: better-sqlite3 + migrations │ │
│ │ - Data sync: cloud sync with encryption │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 关键路径别名 (electron.vite.config.ts)

**主进程别名：**

- `@shared` → `src/main/agent/shared`
- `@core` → `src/main/agent/core`
- `@services` → `src/main/agent/services`
- `@integrations` → `src/main/agent/integrations`
- `@utils` → `src/main/agent/utils`
- `@api` → `src/main/agent/api`

**渲染进程别名：**

- `@renderer` → `src/renderer/src`
- `@views` → `src/renderer/src/views`
- `@router` → `src/renderer/src/router`
- `@store` → `src/renderer/src/store`
- `@utils` → `src/renderer/src/utils`
- `@api` → `src/renderer/src/api`
- `@config` → `src/renderer/src/config`
- `@` → `src/renderer/src`

## 常用开发命令

### 环境准备

```bash
# 安装前必须运行此脚本修复 package-lock.json
node scripts/patch-package-lock.js
npm install
```

### 开发与调试

```bash
npm run dev # 启动开发服务器 (热重载)
npm run dev:watch # 启动开发服务器 (文件监听模式)
npm run start # 预览构建结果
```

### 代码质量检查

```bash
npm run format # Prettier 格式化所有文件
npm run lint # ESLint 检查并自动修复
npm run lint:staged # 仅检查暂存文件 (pre-commit hook)
npm run typecheck # TypeScript 类型检查 (主进程+渲染进程)
npm run typecheck:node # 仅检查主进程类型
npm run typecheck:web # 仅检查渲染进程类型
```

### 测试

```bash
npm test # Vitest 单元测试 (watch 模式)
npm run test:e2e # Playwright E2E 测试 (headless)
npm run test:e2e:headed # Playwright E2E 测试 (显示浏览器)
npm run test:e2e:ui # Playwright E2E 测试 (UI 模式)
```

### 构建与打包

```bash
npm run build # 构建所有源码 (不打包应用)
npm run build:unpack # 构建并生成解压目录 (用于验证)
npm run build:win # 构建 Windows 安装包
npm run build:mac # 构建 macOS 应用
npm run build:linux # 构建 Linux 包
```

## 开发规范与约束

### 代码改动原则

1. **最小化变更范围：** 仅修改与当前需求直接相关的文件，避免"顺手"重构无关代码
2. **类型安全优先：** 严格 TypeScript 类型定义，避免 `any`；新增 IPC 通道必须在 `src/preload/index.d.ts` 中定义类型
3. **保持契约稳定：** 不破坏现有 IPC 接口、Pinia Store、数据库表结构
4. **测试覆盖：** 核心逻辑变更需添加或更新单元测试
5. **文档同步：** 用户可见的功能变更需更新 README.md/README_zh.md 和相关注释
6. **禁止表情符号：** 代码中（包括注释、日志、字符串）严禁使用表情符号（emoji），应使用纯文本描述；可使用文本标记如 `[INFO]`、`[ERROR]`、`[WARNING]` 等替代

### Git 操作规范

**严禁自动 Git 操作：**

- **禁止使用 `git add`：** 生成代码变更后，严禁自动执行 `git add` 命令将文件加入暂存区
- **禁止使用 `git commit`：** 严禁自动创建提交，所有提交操作必须由用户手动完成
- **用户审查优先：** 代码变更必须先由用户审查，确认无误后再由用户决定是否提交
- **仅展示变更：** 完成代码修改后，仅使用 `git status` 和 `git diff` 展示变更内容供用户查看

**原因说明：**
代码变更涉及项目的核心逻辑和功能，必须经过人工审查以确保质量和安全性。自动执行 git 操作可能导致：
- 未经审查的代码被提交
- 意外的文件被加入版本控制
- 提交信息不准确或不符合规范
- 难以回滚的错误变更

### Electron 特有约束

**主进程 (src/main)：**

- 禁止阻塞事件循环，长时任务使用异步或子进程
- 与渲染层通信必须走 IPC，保持信道命名唯一且负载可序列化
- 窗口管理逻辑见 `src/main/windowManager.ts`
- 入口文件：`src/main/index.ts`

**预加载脚本 (src/preload)：**

- 使用 `contextBridge` 暴露最小 API 集合
- 所有暴露的 API 必须在 `src/preload/index.d.ts` 中定义类型
- 不直接暴露 Node.js 能力给渲染层

**渲染进程 (src/renderer)：**

- 使用 Vue 3 Composition API
- 状态管理使用 Pinia，配置持久化插件
- 路由配置：`src/renderer/src/router/routes.ts`
- 路由守卫：`src/renderer/src/router/guards.ts`
- 入口文件：`src/renderer/src/main.ts`

### Agent 子系统开发 (src/main/agent)

**目录结构：**

- `api/` - AI provider 适配层 (Anthropic, OpenAI, AWS Bedrock, Ollama)
- `core/` - 核心逻辑 (controller, prompts, storage, context)
- `services/` - 服务层 (telemetry, diff, terminal)
- `integrations/` - 集成功能 (remote-terminal, tools)
- `shared/` - 共享类型与常量
- `utils/` - 工具函数

**扩展 AI Provider：**

1. 在 `api/providers/` 创建新 provider 文件
2. 在 `api/providers/types.ts` 注册类型
3. 在 `api/index.ts` 完成注册
4. 网络请求统一走 `api/retry.ts` 与 `api/transform/` 封装

### 数据库与迁移 (src/main/storage/db)

**关键文件：**

- `connection.ts` - 数据库连接与路径管理
- `chaterm.service.ts` - 数据库服务层
- `autocomplete.service.ts` - 自动补全数据服务
- `migrations/` - 数据库迁移文件
- `types.ts` - 数据库类型定义

**添加新表或修改表结构：**

1. 在 `migrations/` 创建新迁移文件 (按时间戳命名)
2. 确保迁移是幂等的且可重放
3. 在对应 `.service.ts` 添加服务层方法
4. 在 `types.ts` 定义相关类型

### i18n 国际化

**文案位置：**

- 中文：`src/renderer/src/locales/lang/zh-CN.ts`
- 英文：`src/renderer/src/locales/lang/en-US.ts`

**使用方式：**

```typescript
// 在 Vue 组件中
const { t } = useI18n()
const text = t('key.subkey')
```

### 环境变量

- 渲染进程仅能访问以 `RENDERER_` 开头的环境变量
- 配置位置：`build/.env` 文件 (gitignored)
- 通过 `electron.vite.config.ts` 的 `envPrefix: 'RENDERER_'` 控制

## 提交前检查清单

在提交代码前必须确认：

1. [OK] 通过所有检查：`npm run lint && npm run typecheck && npm test`
2. [OK] 未引入无关文件的格式化变更 (检查 git diff)
3. [OK] 提交信息符合 Conventional Commits 格式
4. [OK] 如涉及 UI 变更，已更新双语文案 (zh-CN + en-US)
5. [OK] 如修改数据库，已创建迁移文件
6. [OK] 如新增 IPC 通道，已在 `src/preload/index.d.ts` 定义类型
7. [OK] 未提交敏感信息 (密钥、Token、私有域名)

## 安全注意事项

1. **禁止提交敏感数据：** API 密钥、Token、私有域名、账号信息
2. **IPC 安全：** 所有主进程与渲染进程通信必须通过 `contextBridge` 暴露的 API
3. **输入验证：** 对所有来自渲染进程的 IPC 消息进行严格验证
4. **依赖安全：** 新增第三方库前评估安全性与包体积

## 常见问题

**Q: 为什么 `npm install` 前要运行 `node scripts/patch-package-lock.js`？**
A: 项目使用自定义脚本修复 package-lock.json 以解决特定依赖问题。

**Q: 如何调试主进程代码？**
A: 在 VS Code 中使用 Electron 调试配置，或在代码中使用 `console.log` 并查看终端输出。

**Q: 如何查看渲染进程日志？**
A: 在应用中按 `Cmd+Option+I` (macOS) 或 `Ctrl+Shift+I` (Windows/Linux) 打开 DevTools。

**Q: 数据库文件存放在哪里？**
A: 通过 `getChatermDbPathForUser()` 获取路径，通常在用户数据目录下。

## 相关文档

- **贡献指南：** `CONTRIBUTING.md` (英文) / `CONTRIBUTING_zh.md` (中文)
- **Agent 开发指南：** `AGENTS.md` (详细的 AI Agent 开发规范)
- **安全策略：** `SECURITY.md`
