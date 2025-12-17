# Chaterm Project AGENTS.md

This document is intended for "AI coding agents/Agent tools" (such as the built-in Agent in this repository, various automated PR bots, and IDE-based intelligent coding assistants). The goal is to help agents quickly and correctly complete changes without disturbing human collaborators, while maintaining unified repository style, maintainability, and verifiability.

— If you are a human contributor, you can also refer to this document's workflow and acceptance checklist.

## Project Overview

- Tech Stack: Electron + Vite + Vue 3 + TypeScript
- Build & Run: electron-vite, electron-builder
- Code Structure:
  - `src/main`: Electron main process logic (windows, updates, SSH, storage, etc.)
  - `src/preload`: Preload scripts (secure bridge)
  - `src/renderer`: Frontend rendering layer (Vue, Pinia, Router, i18n)
  - `src/main/agent`: In-project AI Agent capabilities (LLM Provider, context, tools, etc.)
  - `src/main/storage/db`: Local DB (better-sqlite3), migrations and services

## Code Structure Quick Reference

- Main process entry: `src/main/index.ts`
- Renderer entry: `src/renderer/src/main.ts`
- Preload declarations: `src/preload/index.ts`, `src/preload/index.d.ts`
- Routing & State:
  - Router `src/renderer/src/router/index.ts`
  - Store `src/renderer/src/store/*.ts`
- Agent capabilities: `src/main/agent/*` (providers, core, integrations, utils, shared, etc.)
- DB services: `src/main/storage/db/*` (connections, tables, migrations, services)
- Build config: `electron.vite.config.ts` (aliases, proxy, sourcemap, component auto-import, etc.)

## Basic Principles (Required Reading for Agents)

- Small and Precise: Only modify files directly related to requirements, avoid "incidental" refactoring of unrelated code.
- Maintain Style: Follow ESLint + Prettier and existing naming, directory, and import alias conventions.
- Type First: Complete TypeScript types, use `any` cautiously; define types for new APIs/IPC.
- Include Tests: Core logic that is added or modified should have Vitest unit tests; end-to-end flows can add Playwright test cases.
- Don't Break Contracts: Respect existing IPC, Store, and service interfaces; new capabilities should use an "optional extension" approach.
- Sync Documentation: User-visible behavior changes or new capabilities should update `README.md/README_zh.md` or related comments.

## Change Scope Options (When Adding Features)

- Related-Only (Default/Mandatory):
  - Ignore existing issues unrelated to current functionality (code smells, historical naming, style inconsistencies, readability, etc.), do not modify them arbitrarily.
  - Only modify code and configuration directly related to "new features" or "issues explicitly to be fixed now".
  - If important issues are found (security/stability/build blockers), record them in the PR's "Known issues/Follow-ups" section, open an Issue if necessary; do not handle them in this change.
  - Lint/formatting auto-fixes are limited to files involved in this change, avoid cascading changes.

- Broadened-Refactor (Requires Maintainer Approval):
  - Only use after explicit maintainer approval; allows cascading refactoring or batch fixes of unrelated issues.
  - PR title must include prefix `[refactor-approved]`, description must list impact scope, migration/rollback plan, and verification method.

## Submission Process (Command Quick Reference)

- Install Dependencies:
  - `node scripts/patch-package-lock.js`
  - `npm install`
- Development & Debugging: `npm run dev`
- Code Checks:
  - Format `npm run format`
  - Lint fix `npm run lint`
  - Type check `npm run typecheck`
- Testing:
  - Unit tests `npm test`
  - E2E `npm run test:e2e` / `npm run test:e2e:headed`
- Build:
  - General `npm run build`
  - Platform packages `npm run build:win|build:mac|build:linux`

Pre-submission Checklist:

- Pass `lint`, `format`, `typecheck`, `test`.
- No unrelated diffs or large-scale formatting introduced.
- Minimal change scope with clear commit messages.
- If UI text or new features are involved, i18n and documentation are synced.
- This change follows Related-Only mode; if unrelated changes are included, approval has been obtained and marked with `[refactor-approved]`.
- Unrelated issues found but not handled are recorded in PR's "Known issues/Follow-ups" (or a separate Issue).

## Electron-Specific Constraints

- Main Process (`src/main`):
  - Do not block the event loop (long-running tasks should be async or use child processes/threads).
  - Communicate with renderer via IPC; keep channel names unique, payloads serializable, and type-safe.
- Preload (`src/preload`):
  - Only expose minimal APIs, use `contextBridge`; do not directly expose Node capabilities to the renderer.
- Renderer (`src/renderer`):
  - Use Composition API, Pinia for state management; route guards go in `router/guards.ts`.
  - New views follow `views/components` and `router/routes.ts` conventions.

## Agent Subsystem Change Guidelines (src/main/agent)

- Provider Extensions:
  - Place in `src/main/agent/api/providers/*`, and complete registration in `providers/types.ts` and `api/index.ts`.
  - Network interactions should uniformly use `api/retry.ts`, `api/transform/*` wrappers to maintain consistent logging and error formats.
- Tools/Integrations:
  - Place in `integrations/*` or `services/*`; follow existing naming and directory conventions.
  - New storage should reuse `core/storage/*` interfaces, or derive shared types in `shared/*`.
- Rules & Prompts:
  - System prompts are located in `core/prompts/*` and `shared/*`; reuse or extend existing modules before adding new ones.
- Testing:
  - Place in adjacent `__tests__` directory or `*.test.ts`; assert external contract behavior rather than internal details.

## Database & Migrations (better-sqlite3)

- Code Location: `src/main/storage/db/*`
- Adding/Modifying Tables:
  - Through new migration files (see examples in `migrations/*`), idempotent and replayable.
  - Service layer in `*.service.ts`; type definitions in `types.ts`.
- Do not hardcode paths or access DB across layers; use the service layer uniformly.

## i18n & UI Guidelines

- Text Content:
  - Chinese `src/renderer/src/locales/lang/zh-CN.ts`
  - English `src/renderer/src/locales/lang/en-US.ts`
- Components: `src/renderer/src/views/components/*`, use `less`/`css` for styles and avoid global pollution.
- New Routes: Update `src/renderer/src/router/routes.ts`, route guards in `router/guards.ts`.

## Security & Keys

- Do not commit any keys, tokens, private domains, or account information.
- Environment Variables: Renderer only exposes variables with `RENDERER_` prefix (see `electron.vite.config.ts`).
- External Requests: If proxy or Provider switching is needed, reuse existing Provider/Proxy mechanisms (`api/providers/*`, `api/providers/proxy.ts`).

## Dependencies & Build

- Build aliases are in `electron.vite.config.ts`:
  - Main process: `@shared`, `@core`, `@services`, `@integrations`, `@utils`, `@api`
  - Renderer: `@renderer`, `@views`, `@router`, `@store`, `@utils`, `@api`, `@config`, `@`
- If adding third-party libraries:
  - Evaluate package size and main/renderer process compatibility.
  - Keep `externalizeDepsPlugin` and packaging externalization strategy consistent, update configuration if necessary.

## Typical Workflow (Operation Template for Agents)

1. Read requirements → Create minimal change plan (including impact scope, rollback strategy).
2. Precisely locate directories and modules → Minimal scope changes.
3. Local quick verification: `npm run lint && npm run typecheck && npm test`.
4. If UI or cross-process communication is involved, perform manual/automated integration: `npm run dev` and `npm run test:e2e`.
5. Update documentation/comments and i18n.
6. Output change description and follow-up suggestions (such as potential risks, technical debt, TODOs).

## Prohibited Actions

- Large-scale formatting, reordering imports, meaningless renaming.
- Modifying unrelated configuration or scripts (e.g., release processes) to "make it work".
- Bypassing types or disabling ESLint rules to "temporarily pass".
- Committing code containing sensitive information or environment-specific paths.

## Reference Commands (Copy & Use)

- Code Quality:
  - `npm run format`
  - `npm run lint`
  - `npm run typecheck`
- Testing:
  - `npm test`
  - `npm run test:e2e`
- Run & Build:
  - `npm run dev`
  - `npm run build`

If further clarification is needed or uncertain scenarios are encountered, please briefly document your assumptions and trade-offs in the PR/change description to help human reviewers understand and make decisions.
