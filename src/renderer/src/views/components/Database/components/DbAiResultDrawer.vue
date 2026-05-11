<template>
  <a-drawer
    :open="store.dbAi.drawerOpen"
    :title="drawerTitle"
    :width="520"
    :body-style="{ padding: 0 }"
    placement="right"
    destroy-on-close
    @close="handleClose"
  >
    <div class="db-ai-drawer">
      <header class="db-ai-drawer__header">
        <div class="db-ai-drawer__context">
          <span class="db-ai-drawer__badge">{{ actionLabel }}</span>
          <span
            v-if="contextSummary"
            class="db-ai-drawer__ctx"
            :title="contextSummary"
            >{{ contextSummary }}</span
          >
        </div>
        <div class="db-ai-drawer__status">
          <span
            class="db-ai-drawer__status-dot"
            :class="`db-ai-drawer__status-dot--${statusClass}`"
          />
          <span>{{ statusLabel }}</span>
        </div>
      </header>

      <!-- Phase 2: dialect selector for SQL convert -->
      <section
        v-if="isConvertAction"
        class="db-ai-drawer__toolbar"
      >
        <label class="db-ai-drawer__label">{{ t('database.dbAi.targetDialect') }}</label>
        <a-select
          :value="selectedDialect"
          :options="dialectOptions"
          size="small"
          style="min-width: 160px"
          @change="handleDialectChange"
        />
        <span
          v-if="!isExecutableDialect"
          class="db-ai-drawer__hint"
          >{{ t('database.dbAi.textOnlyDialectHint') }}</span
        >
      </section>

      <section
        v-if="reasoningText"
        class="db-ai-drawer__section db-ai-drawer__section--reasoning"
      >
        <header class="db-ai-drawer__section-title">{{ t('database.dbAi.reasoning') }}</header>
        <pre class="db-ai-drawer__pre">{{ reasoningText }}</pre>
      </section>

      <section class="db-ai-drawer__section db-ai-drawer__section--content">
        <div
          v-if="request && request.status === 'error'"
          class="db-ai-drawer__error"
        >
          {{ request.errorMessage || t('database.dbAi.unknownError') }}
        </div>
        <div
          v-else-if="!request"
          class="db-ai-drawer__empty"
        >
          {{ t('database.dbAi.emptyState') }}
        </div>
        <div
          v-else
          class="db-ai-drawer__markdown markdown-content"
          v-html="renderedMarkdown"
        />
      </section>

      <!-- Phase 2: SQL action bar -->
      <section
        v-if="sqlBlock"
        class="db-ai-drawer__sql"
      >
        <header class="db-ai-drawer__sql-header">
          <span>{{ t('database.dbAi.generatedSql') }}</span>
          <a-space size="small">
            <a-button
              size="small"
              @click="handleCopySql"
              >{{ t('database.dbAi.copy') }}</a-button
            >
            <a-button
              size="small"
              :disabled="!canReplaceSelection"
              @click="handleReplaceSelection"
              >{{ t('database.dbAi.replaceSelection') }}</a-button
            >
            <a-button
              size="small"
              type="primary"
              :disabled="!canInsert"
              @click="handleInsertSql"
              >{{ t('database.dbAi.insertIntoEditor') }}</a-button
            >
            <a-button
              size="small"
              :disabled="!canExecute"
              @click="handleExecuteReadonly"
              >{{ t('database.dbAi.runReadOnly') }}</a-button
            >
          </a-space>
        </header>
        <pre class="db-ai-drawer__sql-block">{{ sqlBlock }}</pre>
      </section>

      <footer class="db-ai-drawer__footer">
        <a-space>
          <a-button
            v-if="canCancel"
            size="small"
            danger
            @click="handleCancel"
            >{{ t('database.dbAi.cancel') }}</a-button
          >
          <a-button
            size="small"
            @click="handleClear"
            >{{ t('database.dbAi.clear') }}</a-button
          >
        </a-space>
      </footer>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { message } from 'ant-design-vue'
import { marked } from 'marked'
import { useI18n } from 'vue-i18n'
import { useDatabaseWorkspaceStore } from '@/store/databaseWorkspaceStore'
import { sanitizeHtml } from '@/utils/sanitize'
import { createRendererLogger } from '@/utils/logger'
import type { DbAiAction } from '@common/db-ai-types'

/**
 * Drawer rendering the single-turn DB-AI result (track A). Streaming text is
 * accumulated in the store; this component is a pure projection of that
 * state plus the action bar for SQL code blocks.
 *
 * Out of scope here:
 *  - Starting requests (the Monaco action / context-menu entry does that)
 *  - IPC plumbing (forwarded from `window.api.dbAi.*` into the store)
 *  - Multi-turn chat (track B lives in AiTab)
 */
const props = defineProps<{
  /**
   * Optional callback the Monaco editor injects so the drawer can insert
   * or replace SQL text without reaching across component boundaries.
   * When `null` (e.g. user is on Overview), the insert/replace buttons
   * are disabled.
   */
  editorCommands?: {
    insertSql?: (sql: string) => void
    replaceSelection?: (sql: string) => void
    runSql?: (sql: string) => void
  } | null
}>()

const store = useDatabaseWorkspaceStore()
const { t } = useI18n()
const logger = createRendererLogger('database.dbAi.drawer')

const request = computed(() => store.activeDbAiRequest)
const reasoningText = computed(() => request.value?.reasoningText ?? '')

const actionLabel = computed<string>(() => {
  const action = request.value?.action
  if (!action) return t('database.dbAi.title')
  return actionToLabel(action)
})

const drawerTitle = computed(() => t('database.dbAi.drawerTitle'))

const statusClass = computed(() => {
  const status = request.value?.status
  if (!status) return 'idle'
  return status
})

const statusLabel = computed<string>(() => {
  const status = request.value?.status
  if (!status) return t('database.dbAi.statusIdle')
  switch (status) {
    case 'queued':
      return t('database.dbAi.statusQueued')
    case 'streaming':
      return t('database.dbAi.statusStreaming')
    case 'done':
      return t('database.dbAi.statusDone')
    case 'error':
      return t('database.dbAi.statusError')
    case 'cancelled':
      return t('database.dbAi.statusCancelled')
    default:
      return t('database.dbAi.statusIdle')
  }
})

const contextSummary = computed(() => {
  const ctx = request.value?.context
  if (!ctx) return ''
  const parts: string[] = [ctx.dbType]
  if (ctx.databaseName) parts.push(ctx.databaseName)
  if (ctx.schemaName) parts.push(ctx.schemaName)
  if (ctx.tableName) parts.push(ctx.tableName)
  return parts.join(' · ')
})

// Render streaming markdown through marked+sanitize. We re-run on every
// store update because the active request's `text` grows on each chunk.
const renderedMarkdown = computed(() => {
  const text = request.value?.text ?? ''
  if (text.length === 0) {
    if (request.value?.status === 'queued') return ''
    return ''
  }
  try {
    // marked.parse returns a Promise in async mode; stay sync via the
    // single-arg overload to keep the render cheap during high-frequency
    // streaming updates.
    const html = marked.parse(text, { async: false }) as string
    return sanitizeHtml(html)
  } catch (err) {
    logger.warn('markdown render failed', {
      event: 'database.dbAi.render.failed',
      reason: err instanceof Error ? err.message : 'unknown',
      textLen: text.length
    })
    return sanitizeHtml(`<pre>${escapeHtml(text)}</pre>`)
  }
})

// Track-B-independent SQL extraction: prefer the main-process-produced
// `sql` field on the done event; fall back to scraping the first fenced
// ```sql block out of the accumulated text so partial results are usable
// while streaming.
const sqlBlock = computed<string | null>(() => {
  const r = request.value
  if (!r) return null
  if (r.sql && r.sql.trim().length > 0) return r.sql.trim()
  if (r.status === 'done' || r.status === 'streaming' || r.status === 'error') {
    return extractSqlBlock(r.text) ?? null
  }
  return null
})

// --- Action guards ----------------------------------------------------------

const canInsert = computed(() => !!sqlBlock.value && !!props.editorCommands?.insertSql)
const canReplaceSelection = computed(() => !!sqlBlock.value && !!props.editorCommands?.replaceSelection)
const canCancel = computed(() => request.value?.status === 'queued' || request.value?.status === 'streaming')

const canExecute = computed(() => {
  if (!sqlBlock.value) return false
  if (!isExecutableDialect.value) return false
  return !!props.editorCommands?.runSql
})

const isConvertAction = computed(() => request.value?.action === 'convert')

// Dialect selector state is driven by the request's `targetDialect` field
// (captured at start), so switching between requests shows each one's own
// target rather than a single shared value.
const selectedDialect = computed(() => request.value?.targetDialect ?? 'postgresql')

// MVP supports executing generated SQL only against backends that match the
// active connection — PostgreSQL / MySQL. Other targets (e.g. Oracle, SQL
// Server) are text-only conversions: copy / insert is still available but
// read-only execution is hidden.
const isExecutableDialect = computed(() => {
  const dialect = selectedDialect.value
  if (!request.value) return true
  if (!isConvertAction.value) return true
  return dialect === 'postgresql' || dialect === 'mysql'
})

const dialectOptions = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'mssql', label: 'SQL Server' }
]

// --- Handlers ---------------------------------------------------------------

const handleClose = () => {
  store.setDbAiDrawerOpen(false)
}

const handleClear = () => {
  const reqId = request.value?.reqId
  if (reqId) store.removeDbAiRequest(reqId)
  store.setDbAiDrawerOpen(false)
}

const handleCancel = () => {
  const reqId = request.value?.reqId
  if (!reqId) return
  store.cancelDbAiRequest(reqId)
  // Best-effort IPC cancel; service-dev (task #5) owns the main-side
  // teardown. If the preload API isn't wired up yet we just freeze the
  // local state.
  const anyGlobal = globalThis as unknown as { window?: { api?: { dbAi?: { cancel?: (id: string) => Promise<unknown> } } } }
  const cancelFn = anyGlobal.window?.api?.dbAi?.cancel
  if (typeof cancelFn === 'function') {
    cancelFn(reqId).catch((err) => {
      logger.warn('dbAi cancel ipc failed', {
        event: 'database.dbAi.cancel.failed',
        reqId,
        reason: err instanceof Error ? err.message : 'unknown'
      })
    })
  }
}

const handleCopySql = async () => {
  const sql = sqlBlock.value
  if (!sql) return
  try {
    const nav = globalThis.navigator as Navigator | undefined
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(sql)
    } else {
      const ta = document.createElement('textarea')
      ta.value = sql
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } finally {
        document.body.removeChild(ta)
      }
    }
    message.success(t('database.copiedToClipboard'))
  } catch (err) {
    logger.warn('sql copy failed', {
      event: 'database.dbAi.copy.failed',
      reason: err instanceof Error ? err.message : 'unknown'
    })
    message.error(t('database.dbAi.copyFailed'))
  }
}

const handleInsertSql = () => {
  const sql = sqlBlock.value
  if (!sql) return
  const fn = props.editorCommands?.insertSql
  if (!fn) return
  fn(sql)
  message.success(t('database.dbAi.insertedIntoEditor'))
}

const handleReplaceSelection = () => {
  const sql = sqlBlock.value
  if (!sql) return
  const fn = props.editorCommands?.replaceSelection
  if (!fn) return
  fn(sql)
  message.success(t('database.dbAi.replacedSelection'))
}

const handleExecuteReadonly = () => {
  const sql = sqlBlock.value
  if (!sql) return
  const fn = props.editorCommands?.runSql
  if (!fn) return
  fn(sql)
}

const handleDialectChange = (value: string) => {
  // Track the target dialect on the request itself so re-opens remember
  // the last selection. Does NOT re-trigger the conversion — re-running is
  // the caller's responsibility (Phase 2 will add a retry button).
  const r = request.value
  if (!r) return
  store.dbAi.requests = {
    ...store.dbAi.requests,
    [r.reqId]: { ...r, targetDialect: value as typeof r.targetDialect }
  }
}

// --- Helpers ----------------------------------------------------------------

function actionToLabel(action: DbAiAction): string {
  switch (action) {
    case 'explain':
      return t('database.dbAi.actionExplain')
    case 'nl2sql':
      return t('database.dbAi.actionNl2Sql')
    case 'optimize':
      return t('database.dbAi.actionOptimize')
    case 'convert':
      return t('database.dbAi.actionConvert')
    case 'complete':
      return t('database.dbAi.actionComplete')
    default:
      return action
  }
}

function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return ch
    }
  })
}

/**
 * Pull the first ```sql ... ``` fenced block out of streaming markdown.
 * Used as a fallback while the main process has not yet emitted the done
 * event with a pre-parsed `result.sql`. Matches ```sql, ```mysql, ```plpgsql,
 * or a bare ``` fence — whichever appears first. Returns null when no block
 * has arrived yet (common during the first few hundred ms of streaming).
 */
function extractSqlBlock(markdown: string): string | null {
  if (!markdown || markdown.length === 0) return null
  const fenceRegex = /```(?:sql|mysql|pgsql|plpgsql|postgresql)?\s*\n([\s\S]*?)(?:```|$)/i
  const m = markdown.match(fenceRegex)
  if (!m || !m[1]) return null
  const body = m[1].trim()
  return body.length > 0 ? body : null
}
</script>

<style lang="less" scoped>
.db-ai-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--text-color);
  background: var(--bg-color);

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-color-secondary);
  }

  &__context {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__badge {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__ctx {
    font-size: 12px;
    color: var(--text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #9ca3af;

    &--queued {
      background: #f59e0b;
    }

    &--streaming {
      background: #3b82f6;
      animation: db-ai-drawer-pulse 1.2s ease-in-out infinite;
    }

    &--done {
      background: #10b981;
    }

    &--error {
      background: #ef4444;
    }

    &--cancelled {
      background: #9ca3af;
    }
  }

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border-color);
  }

  &__label {
    font-size: 12px;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__hint {
    font-size: 11px;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__section {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    overflow-y: auto;

    &--reasoning {
      background: var(--bg-color-secondary);
      max-height: 180px;
    }

    &--content {
      flex: 1;
      min-height: 160px;
    }
  }

  &__section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-color-secondary, #8a94a6);
    margin-bottom: 6px;
  }

  &__pre {
    margin: 0;
    font-family: 'JetBrains Mono', Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text-color);
  }

  &__markdown {
    font-size: 13px;
    line-height: 1.6;
    word-break: break-word;

    :deep(pre) {
      background: var(--bg-color-secondary);
      padding: 10px 12px;
      border-radius: 4px;
      overflow: auto;
    }

    :deep(code) {
      font-family: 'JetBrains Mono', Menlo, Consolas, monospace;
      font-size: 12px;
    }

    :deep(p) {
      margin: 6px 0;
    }
  }

  &__empty,
  &__error {
    font-size: 12px;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__error {
    color: #ef4444;
  }

  &__sql {
    border-top: 1px solid var(--border-color);
    padding: 10px 16px;
    background: var(--bg-color-secondary);
  }

  &__sql-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--text-color-secondary, #8a94a6);
    margin-bottom: 8px;
  }

  &__sql-block {
    margin: 0;
    padding: 10px 12px;
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-family: 'JetBrains Mono', Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text-color);
  }

  &__footer {
    padding: 10px 16px;
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: flex-end;
  }
}

@keyframes db-ai-drawer-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
