# Chaterm 项目 AGENTS.md

本文面向“AI 编码代理/Agent 工具”（如本仓库自带的 Agent、各类自动化 PR 机器人、IDE 内智能编码助理）。目标是：在不打扰人类协作者的前提下，帮助 Agent 快速、正确地完成改动，并保持仓库风格统一、可维护与可验证。

— 如果你是人类贡献者，也可以参考此文的做事流程与验收清单。

## 项目速览

- 技术栈：Electron + Vite + Vue 3 + TypeScript
- 打包与运行：electron-vite、electron-builder
- 代码目录：
  - `src/main`：Electron 主进程逻辑（窗口、更新、SSH、存储等）
  - `src/preload`：预加载脚本（安全桥接）
  - `src/renderer`：前端渲染层（Vue、Pinia、Router、i18n）
  - `src/main/agent`：项目内 AI Agent 能力（LLM Provider、上下文、工具等）
  - `src/main/storage/db`：本地 DB（better-sqlite3）、迁移与服务

## 代码结构速参

- 主进程入口：`src/main/index.ts`
- 渲染层入口：`src/renderer/src/main.ts`
- 预加载声明：`src/preload/index.ts`、`src/preload/index.d.ts`
- 路由与状态：
  - 路由 `src/renderer/src/router/index.ts`
  - Store `src/renderer/src/store/*.ts`
- Agent 能力：`src/main/agent/*`（providers、core、integrations、utils、shared 等）
- DB 服务：`src/main/storage/db/*`（连接、表、迁移、服务）
- 构建配置：`electron.vite.config.ts`（别名、代理、sourcemap、组件自动导入等）

## 基本准则（Agent 必读）

- 小而准：仅改与需求直接相关的文件，避免“顺手”重构无关代码。
- 保持风格：遵循 ESLint + Prettier 与现有命名、目录、导入别名习惯。
- 类型优先：TypeScript 类型完整、谨慎使用 `any`；新增 API/IPC 定义类型。
- 带上测试：新增或修改的核心逻辑应有 Vitest 单测；涉及端到端流程可加 Playwright 用例。
- 不打破契约：尊重既有 IPC、Store、服务接口；新增能力采用“可选扩展”方式。
- 文档同步：用户可见行为变化或新增能力，应更新 `README.md/README_zh.md` 或相关注释。

## 变更范围选项（新增功能时）

- Related-Only（默认/强制）：
  - 忽视与当前功能无关的既有问题（代码味道、历史命名、风格不一、可读性等），不随意改动。
  - 仅修改与“新增功能”或“当前明确要修复的问题”直接相关的代码与配置。
  - 如发现重要问题（安全/稳定/构建阻断），在 PR 的 “Known issues/Follow-ups” 区块记录，必要时另开 Issue；本次改动不处理。
  - Lint/格式化的自动修复仅限本次改动涉及的文件，避免连带改动。

- Broadened-Refactor（需维护者批准）：
  - 仅在维护者明确同意后使用；允许连带重构或批量修复无关问题。
  - PR 标题需加前缀 `[refactor-approved]`，描述中必须列出影响面、迁移/回滚方案与验证方式。

## 提交流程（命令速查）

- 安装依赖：
  - `node scripts/patch-package-lock.js`
  - `npm install`
- 开发调试：`npm run dev`
- 代码检查：
  - 格式化 `npm run format`
  - Lint 修复 `npm run lint`
  - 类型检查 `npm run typecheck`
- 测试：
  - 单测 `npm test`
  - E2E `npm run test:e2e` / `npm run test:e2e:headed`
- 构建：
  - 通用 `npm run build`
  - 平台包 `npm run build:win|build:mac|build:linux`

提交前自检清单：

- 通过 `lint`、`format`、`typecheck`、`test`。
- 未引入无关 diff 或大范围格式化。
- 变更范围最小且提交信息清晰。
- 如涉及 UI 文案或新功能，已同步 i18n 与文档。
- 本次改动遵循 Related-Only 模式；如包含无关改动，已获批准并注明 `[refactor-approved]`。
- 发现但未处理的无关问题已记录到 PR 的 “Known issues/Follow-ups”（或另开 Issue）。

## Electron 特有约束

- 主进程（`src/main`）：
  - 禁止阻塞事件循环（长时任务请异步或子进程/线程）。
  - 与渲染层通信走 IPC；保持信道命名唯一、负载可序列化、类型安全。
- 预加载（`src/preload`）：
  - 仅暴露最小 API，使用 `contextBridge`；不要直接暴露 Node 能力给渲染层。
- 渲染层（`src/renderer`）：
  - 使用 Composition API、Pinia 管理状态；路由守卫放在 `router/guards.ts`。
  - 新增视图走 `views/components` 与 `router/routes.ts` 约定。

## Agent 子系统改动规范（src/main/agent）

- Provider 扩展：
  - 放在 `src/main/agent/api/providers/*`，并在 `providers/types.ts` 与 `api/index.ts` 完成注册。
  - 网络交互请统一走 `api/retry.ts`、`api/transform/*` 的封装，保持日志与错误格式一致。
- 工具/集成：
  - 放在 `integrations/*` 或 `services/*`；遵循现有命名与目录。
  - 新增存储请复用 `core/storage/*` 接口，或在 `shared/*` 衍生共用类型。
- 规则与提示词：
  - 系统提示词位于 `core/prompts/*` 与 `shared/*`；新增前先复用或扩展现有模块。
- 测试：
  - 放在相邻目录 `__tests__` 或 `*.test.ts`；对外契约行为做断言而非内部细节。

## 数据库与迁移（better-sqlite3）

- 代码位置：`src/main/storage/db/*`
- 新增/修改表：
  - 通过新增迁移文件（示例见 `migrations/*`），幂等可重放。
  - 服务层放在 `*.service.ts`；类型定义放在 `types.ts`。
- 不要硬编码路径或跨层访问 DB；统一走服务层。

## i18n 与 UI 规范

- 文案放在：
  - 中文 `src/renderer/src/locales/lang/zh-CN.ts`
  - 英文 `src/renderer/src/locales/lang/en-US.ts`
- 组件：`src/renderer/src/views/components/*`，样式使用 `less`/`css` 并避免全局污染。
- 新增路由：更新 `src/renderer/src/router/routes.ts`，路由守卫在 `router/guards.ts`。

## 安全与密钥

- 禁止提交任何密钥、Token、私有域名与账号信息。
- 环境变量：渲染层仅暴露以 `RENDERER_` 前缀的变量（见 `electron.vite.config.ts`）。
- 外部请求：如果需要代理或切换 Provider，请复用现有 Provider/Proxy 机制（`api/providers/*`、`api/providers/proxy.ts`）。

## 依赖与构建

- 构建别名位于 `electron.vite.config.ts`：
  - 主进程：`@shared`、`@core`、`@services`、`@integrations`、`@utils`、`@api`
  - 渲染层：`@renderer`、`@views`、`@router`、`@store`、`@utils`、`@api`、`@config`、`@`
- 如需新增第三方库：
  - 评估包体与主/渲染进程适配性。
  - 保持 `externalizeDepsPlugin` 与打包外部化策略一致，必要时更新配置。

## 典型工作流（给 Agent 的操作模板）

1. 读取需求 → 制定最小变更计划（含影响面、回滚策略）。
2. 精确定位到目录与模块 → 最小范围改动。
3. 本地快速验证：`npm run lint && npm run typecheck && npm test`。
4. 如涉及 UI 或跨进程通信，进行手动/自动化联调：`npm run dev` 与 `npm run test:e2e`。
5. 更新文档/注释与 i18n。
6. 输出变更说明与后续建议（如潜在风险、技术债、TODO）。

## 禁止事项

- 大规模格式化、重排导入、无意义的重命名。
- 修改无关配置或脚本（例如发布流程）以“让它能跑”。
- 绕过类型或禁用 ESLint 规则来“临时通过”。
- 提交含敏感信息或环境专属路径的代码。

## 参考命令（复制即用）

- 代码质量：
  - `npm run format`
  - `npm run lint`
  - `npm run typecheck`
- 测试：
  - `npm test`
  - `npm run test:e2e`
- 运行与构建：
  - `npm run dev`
  - `npm run build`

如需进一步说明或遇到不确定场景，请在 PR/变更描述中简要写出你的假设与权衡，便于人类审阅者理解与决策。
