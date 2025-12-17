# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chaterm is an Electron-based AI-driven terminal tool that provides intelligent command completion, multi-device management, AI Agent capabilities, and enterprise-grade security features.

**Tech Stack:**

- **Frontend Framework:** Vue 3 + TypeScript + Pinia + Vue Router + Vue I18n
- **UI Components:** Ant Design Vue (auto-imported) + Monaco Editor + xterm.js
- **Desktop Application:** Electron 30 + electron-vite + electron-builder
- **Data Storage:** better-sqlite3 (local database) + migration system
- **SSH/Terminal:** ssh2 + node-pty + custom SSH agent
- **AI Integration:** Anthropic Claude + OpenAI + AWS Bedrock + Ollama
- **Testing Framework:** Vitest (unit tests) + Playwright (E2E)
- **Code Quality:** ESLint + Prettier + TypeScript + Husky (pre-commit hooks)

## Core Architecture

### Three-Layer Architecture

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

### Key Path Aliases (electron.vite.config.ts)

**Main Process Aliases:**

- `@shared` → `src/main/agent/shared`
- `@core` → `src/main/agent/core`
- `@services` → `src/main/agent/services`
- `@integrations` → `src/main/agent/integrations`
- `@utils` → `src/main/agent/utils`
- `@api` → `src/main/agent/api`

**Renderer Process Aliases:**

- `@renderer` → `src/renderer/src`
- `@views` → `src/renderer/src/views`
- `@router` → `src/renderer/src/router`
- `@store` → `src/renderer/src/store`
- `@utils` → `src/renderer/src/utils`
- `@api` → `src/renderer/src/api`
- `@config` → `src/renderer/src/config`
- `@` → `src/renderer/src`

## Common Development Commands

### Environment Setup

```bash
# Must run this script before installation to fix package-lock.json
node scripts/patch-package-lock.js
npm install
```

### Development and Debugging

```bash
npm run dev # Start development server (hot reload)
npm run dev:watch # Start development server (file watch mode)
npm run start # Preview build results
```

### Code Quality Checks

```bash
npm run format # Prettier format all files
npm run lint # ESLint check and auto-fix
npm run lint:staged # Check staged files only (pre-commit hook)
npm run typecheck # TypeScript type checking (main + renderer processes)
npm run typecheck:node # Check main process types only
npm run typecheck:web # Check renderer process types only
```

### Testing

```bash
npm test # Vitest unit tests (watch mode)
npm run test:e2e # Playwright E2E tests (headless)
npm run test:e2e:headed # Playwright E2E tests (with browser)
npm run test:e2e:ui # Playwright E2E tests (UI mode)
```

### Build and Package

```bash
npm run build # Build all source code (without packaging)
npm run build:unpack # Build and generate unpacked directory (for verification)
npm run build:win # Build Windows installer
npm run build:mac # Build macOS application
npm run build:linux # Build Linux package
```

## Development Standards and Constraints

### Code Change Principles

1. **Minimize Change Scope:** Only modify files directly related to current requirements, avoid "incidental" refactoring of unrelated code
2. **Type Safety First:** Strict TypeScript type definitions, avoid `any`; new IPC channels must define types in `src/preload/index.d.ts`
3. **Maintain Contract Stability:** Do not break existing IPC interfaces, Pinia Stores, or database table structures
4. **Test Coverage:** Core logic changes require adding or updating unit tests
5. **Documentation Sync:** User-visible feature changes require updating README.md/README_zh.md and related comments
6. **No Emojis:** Emojis are strictly prohibited in code (including comments, logs, strings); use plain text descriptions instead; text markers like `[INFO]`, `[ERROR]`, `[WARNING]` can be used as alternatives
7. **Code Comment Language:** Newly added code comments must be written in English to maintain the codebase's internationalization standards

### Git Operation Standards

**Strictly Prohibit Automatic Git Operations:**

- **Prohibit `git add`:** After generating code changes, strictly prohibit automatically executing `git add` to stage files
- **Prohibit `git commit`:** Strictly prohibit automatically creating commits; all commit operations must be performed manually by the user
- **User Review First:** Code changes must be reviewed by the user first, and only after confirmation should the user decide whether to commit
- **Show Changes Only:** After completing code modifications, only use `git status` and `git diff` to display changes for user review

**Reason:**
Code changes involve the project's core logic and functionality, and must undergo manual review to ensure quality and security. Automatically executing git operations may lead to:

- Unreviewed code being committed
- Unexpected files being added to version control
- Inaccurate commit messages or non-compliant formats
- Difficult-to-rollback erroneous changes

### Electron-Specific Constraints

**Main Process (src/main):**

- Prohibit blocking the event loop; use async or child processes for long-running tasks
- Communication with renderer layer must go through IPC, keep channel names unique and payloads serializable
- Window management logic: see `src/main/windowManager.ts`
- Entry file: `src/main/index.ts`

**Preload Scripts (src/preload):**

- Use `contextBridge` to expose minimal API set
- All exposed APIs must define types in `src/preload/index.d.ts`
- Do not directly expose Node.js capabilities to renderer layer

**Renderer Process (src/renderer):**

- Use Vue 3 Composition API
- State management uses Pinia with persistence plugin
- Route configuration: `src/renderer/src/router/routes.ts`
- Route guards: `src/renderer/src/router/guards.ts`
- Entry file: `src/renderer/src/main.ts`

### Agent Subsystem Development (src/main/agent)

**Directory Structure:**

- `api/` - AI provider adapter layer (Anthropic, OpenAI, AWS Bedrock, Ollama)
- `core/` - Core logic (controller, prompts, storage, context)
- `services/` - Service layer (telemetry, diff, terminal)
- `integrations/` - Integration features (remote-terminal, tools)
- `shared/` - Shared types and constants
- `utils/` - Utility functions

**Extending AI Provider:**

1. Create new provider file in `api/providers/`
2. Register type in `api/providers/types.ts`
3. Complete registration in `api/index.ts`
4. Network requests should uniformly go through `api/retry.ts` and `api/transform/` wrappers

### Database and Migrations (src/main/storage/db)

**Key Files:**

- `connection.ts` - Database connection and path management
- `chaterm.service.ts` - Database service layer
- `autocomplete.service.ts` - Autocomplete data service
- `migrations/` - Database migration files
- `types.ts` - Database type definitions

**Adding New Tables or Modifying Table Structure:**

1. Create new migration file in `migrations/` (named by timestamp)
2. Ensure migrations are idempotent and replayable
3. Add service layer methods in corresponding `.service.ts`
4. Define related types in `types.ts`

### i18n Internationalization

**Text Location:**

- Chinese: `src/renderer/src/locales/lang/zh-CN.ts`
- English: `src/renderer/src/locales/lang/en-US.ts`

**Usage:**

```typescript
// In Vue components
const { t } = useI18n()
const text = t('key.subkey')
```

### Environment Variables

- Renderer process can only access environment variables starting with `RENDERER_`
- Configuration location: `build/.env` file (gitignored)
- Controlled via `envPrefix: 'RENDERER_'` in `electron.vite.config.ts`

## Pre-commit Checklist

Before committing code, must confirm:

1. [OK] Pass all checks: `npm run lint && npm run typecheck && npm test`
2. [OK] No formatting changes to unrelated files (check git diff)
3. [OK] Commit message follows Conventional Commits format
4. [OK] If UI changes are involved, bilingual text has been updated (zh-CN + en-US)
5. [OK] If database is modified, migration files have been created
6. [OK] If new IPC channels are added, types have been defined in `src/preload/index.d.ts`
7. [OK] No sensitive information committed (keys, tokens, private domains)

## Security Considerations

1. **Prohibit Committing Sensitive Data:** API keys, tokens, private domains, account information
2. **IPC Security:** All communication between main and renderer processes must go through APIs exposed by `contextBridge`
3. **Input Validation:** Strictly validate all IPC messages from renderer process
4. **Dependency Security:** Evaluate security and package size before adding third-party libraries

## Common Questions

**Q: Why run `node scripts/patch-package-lock.js` before `npm install`?**
A: The project uses a custom script to fix package-lock.json to resolve specific dependency issues.

**Q: How to debug main process code?**
A: Use Electron debug configuration in VS Code, or use `console.log` in code and check terminal output.

**Q: How to view renderer process logs?**
A: Press `Cmd+Option+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux) in the application to open DevTools.

**Q: Where is the database file stored?**
A: Get the path via `getChatermDbPathForUser()`, usually in the user data directory.

## Related Documentation

- **Contribution Guide:** `CONTRIBUTING.md` (English) / `CONTRIBUTING_zh.md` (Chinese)
- **Agent Development Guide:** `AGENTS.md` (detailed AI Agent development standards)
- **Security Policy:** `SECURITY.md`
