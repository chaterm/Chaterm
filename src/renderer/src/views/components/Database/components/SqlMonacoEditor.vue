<template>
  <div
    ref="containerRef"
    class="sql-monaco-editor"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as monaco from 'monaco-editor'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController'

// The project-wide Monaco wrapper lives at
// `@views/components/Editors/base/monacoEditor.vue` and is the single place
// that configures `self.MonacoEnvironment.getWorker`. That wrapper is loaded
// lazily by its consumers (MCP config editor, SSH drag editor, settings
// editors). If the SQL workspace is opened before any of those code paths,
// workers may fall back to the main thread. If this surfaces during manual
// QA, hoist worker initialization into `src/renderer/src/main.ts`.
// Intentionally no side-effect import here: eagerly importing the shared
// wrapper pulls in the editor-config store and its transitive dependencies
// (configSyncManager -> i18n), which breaks isolated tests of this file.

const props = defineProps<{
  modelValue: string
  readonly?: boolean
  theme?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'run', mode: 'all' | 'currentStatement'): void
  /**
   * Fired when the user invokes a DB-AI editor action. Five kinds are
   * surfaced today:
   *  - `explainSelection`: explain the selected SQL (or full editor text
   *    when nothing is selected).
   *  - `optimizeSelection`: optimize the selected SQL (falls back to
   *    full text when nothing is selected).
   *  - `convertDialect`: translate the selected SQL to a different SQL
   *    dialect (falls back to full text). Target dialect is picked in
   *    the result drawer.
   *  - `nl2sqlFromComment`: when the cursor sits on a line that is a
   *    pure SQL comment (`-- ...` or `/* ... *\/`), use that comment's
   *    content as the natural-language question. Cheap power-user
   *    shortcut for `generateFromComment` in docs/database_ai.md §11.1.
   *  - `nl2sqlPrompt`: open the NL → SQL prompt modal so the user can
   *    type a free-form question. The parent owns the modal.
   *
   * The parent is expected to resolve the active connection context
   * from the store (NOT from a stale closure captured at editor mount)
   * before kicking off the DB-AI request.
   */
  (e: 'dbAi', kind: 'explainSelection' | 'optimizeSelection' | 'convertDialect' | 'nl2sqlFromComment' | 'nl2sqlPrompt', sql: string): void
}>()

const containerRef = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
// Disposable handles for editor actions registered during mount. All actions
// MUST be disposed on unmount to avoid leaking registrations across editor
// instances (every time a SQL tab is opened, a fresh editor is created).
const actionDisposables: monaco.IDisposable[] = []

onMounted(() => {
  if (!containerRef.value) return
  editor = monaco.editor.create(containerRef.value, {
    value: props.modelValue ?? '',
    language: 'sql',
    theme: props.theme ?? 'vs-dark',
    readOnly: !!props.readonly,
    fontSize: 13,
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false
  })

  editor.onDidChangeModelContent(() => {
    if (!editor) return
    const v = editor.getValue()
    if (v !== props.modelValue) emit('update:modelValue', v)
  })

  // Cmd/Ctrl+Enter: run the current statement (selection wins if present,
  // otherwise the statement under the cursor, as implemented in
  // `getCurrentStatement`). If the editor is genuinely empty the workspace
  // layer surfaces the sqlEmpty error.
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    const sel = editor?.getSelection()
    const model = editor?.getModel()
    const selected = sel && model ? model.getValueInRange(sel) : ''
    emit('run', selected.trim().length > 0 ? 'currentStatement' : 'all')
  })

  // Register the DB-AI "Explain selection" action. The callback deliberately
  // does NOT capture any store state — it just emits, and the parent resolves
  // fresh context from the store when handling the event. This prevents the
  // bug where the user opens tab A, triggers the action, switches to tab B,
  // and the request fires against the stale tab A connection.
  const explainAction = editor.addAction({
    id: 'database.ai.explainSelection',
    label: 'Database: Explain selection (AI)',
    contextMenuGroupId: 'database-ai',
    contextMenuOrder: 1,
    run: (ed) => {
      emit('dbAi', 'explainSelection', readSelectionOrFull(ed))
    }
  })
  actionDisposables.push(explainAction)

  // "Optimize selection" — mirrors Explain: selection wins, fall back to
  // full editor contents when no selection.
  const optimizeAction = editor.addAction({
    id: 'database.ai.optimizeSelection',
    label: 'Database: Optimize selection (AI)',
    contextMenuGroupId: 'database-ai',
    contextMenuOrder: 2,
    run: (ed) => {
      emit('dbAi', 'optimizeSelection', readSelectionOrFull(ed))
    }
  })
  actionDisposables.push(optimizeAction)

  // "Convert dialect" — opens the drawer; the drawer's dialect selector
  // drives the target dialect.
  const convertAction = editor.addAction({
    id: 'database.ai.convertDialect',
    label: 'Database: Convert dialect (AI)',
    contextMenuGroupId: 'database-ai',
    contextMenuOrder: 3,
    run: (ed) => {
      emit('dbAi', 'convertDialect', readSelectionOrFull(ed))
    }
  })
  actionDisposables.push(convertAction)

  // "Generate SQL from comment" — if the current line is a SQL comment
  // (`-- ...` or `/* ... */`), hand the comment body up as the NL
  // question. Otherwise (or when the extracted body is empty) fall
  // through to the prompt modal so the user can type directly. This is
  // the `generateFromComment` shortcut from docs/database_ai.md §11.1.
  const nl2sqlCommentAction = editor.addAction({
    id: 'database.ai.nl2sqlFromComment',
    label: 'Database: NL to SQL from current comment (AI)',
    contextMenuGroupId: 'database-ai',
    contextMenuOrder: 4,
    run: (ed) => {
      const comment = readCommentAtCursor(ed)
      if (comment) {
        emit('dbAi', 'nl2sqlFromComment', comment)
      } else {
        // Nothing resembling a comment — open the modal with an empty
        // seed question so the user can type.
        emit('dbAi', 'nl2sqlPrompt', '')
      }
    }
  })
  actionDisposables.push(nl2sqlCommentAction)

  // "NL → SQL prompt" — always opens the modal. Seed the prompt with
  // whatever is currently selected so users can refine prose they
  // already wrote elsewhere.
  const nl2sqlPromptAction = editor.addAction({
    id: 'database.ai.nl2sqlPrompt',
    label: 'Database: NL to SQL prompt... (AI)',
    contextMenuGroupId: 'database-ai',
    contextMenuOrder: 5,
    run: (ed) => {
      const sel = ed.getSelection()
      const model = ed.getModel()
      const selected = sel && model ? model.getValueInRange(sel) : ''
      emit('dbAi', 'nl2sqlPrompt', selected.trim())
    }
  })
  actionDisposables.push(nl2sqlPromptAction)
})

/**
 * Read the current selection; fall back to the full editor text when the
 * selection is empty. Shared by Explain / Optimize / Convert actions.
 */
function readSelectionOrFull(ed: monaco.editor.ICodeEditor): string {
  const sel = ed.getSelection()
  const model = ed.getModel()
  const selected = sel && model ? model.getValueInRange(sel) : ''
  if (selected.trim().length > 0) return selected
  return ed.getValue() ?? ''
}

/**
 * If the cursor is sitting on a SQL comment line, return the comment
 * body (trimmed, quote markers stripped). Otherwise return `null`.
 *
 * Recognizes:
 *  - Double-dash line comments: `-- this is a question`
 *  - Block comments on a single line: `/* this is a question *\/`
 *
 * Intentionally conservative: does not try to reconstruct multi-line
 * block comments (Monaco gives us only one line at a time here) and
 * does not infer "comment-like" content from plain text. If a user wants
 * a free-form prompt they use the other action.
 */
function readCommentAtCursor(ed: monaco.editor.ICodeEditor): string | null {
  const model = ed.getModel()
  const pos = ed.getPosition()
  if (!model || !pos) return null
  const lineText = model.getLineContent(pos.lineNumber) ?? ''
  const trimmed = lineText.trim()
  if (trimmed.length === 0) return null

  const lineComment = /^--\s?(.*)$/.exec(trimmed)
  if (lineComment) {
    const body = lineComment[1].trim()
    return body.length > 0 ? body : null
  }
  const blockComment = /^\/\*\s*(.*?)\s*\*\/$/.exec(trimmed)
  if (blockComment) {
    const body = blockComment[1].trim()
    return body.length > 0 ? body : null
  }
  return null
}

watch(
  () => props.modelValue,
  (v) => {
    if (editor && v !== editor.getValue()) editor.setValue(v ?? '')
  }
)

onBeforeUnmount(() => {
  for (const d of actionDisposables) {
    try {
      d.dispose()
    } catch {
      // disposing an action that was already disposed is fine — ignore.
    }
  }
  actionDisposables.length = 0
  editor?.dispose()
  editor = null
})

defineExpose({
  getText(): string {
    return editor?.getValue() ?? ''
  },
  getSelectedText(): string {
    const sel = editor?.getSelection()
    if (!sel || !editor) return ''
    return editor.getModel()?.getValueInRange(sel) ?? ''
  },
  // Replace the full document via executeEdits so the change participates
  // in Monaco's undo stack (setValue would wipe undo history).
  replaceAll(next: string): void {
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    const full = model.getFullModelRange()
    editor.executeEdits('sql-format', [{ range: full, text: next, forceMoveMarkers: true }])
  },
  // Replace the current selection (used when the user only wants to format
  // the highlighted fragment). No-op if the selection is empty.
  replaceSelection(next: string): void {
    if (!editor) return
    const sel = editor.getSelection()
    if (!sel || sel.isEmpty()) return
    editor.executeEdits('sql-format', [{ range: sel, text: next, forceMoveMarkers: true }])
  },
  /**
   * Insert `text` at the cursor via executeEdits so the change participates
   * in Monaco's undo stack. If the editor currently has a non-empty
   * selection, replaces the selection instead (matches Monaco's own paste
   * behaviour). Used by the DB-AI drawer's "Insert into editor" action.
   */
  insertAtCursor(next: string): void {
    if (!editor) return
    const sel = editor.getSelection()
    const model = editor.getModel()
    if (!model) return
    if (sel && !sel.isEmpty()) {
      editor.executeEdits('db-ai-insert', [{ range: sel, text: next, forceMoveMarkers: true }])
    } else {
      const pos = editor.getPosition()
      if (!pos) return
      const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
      editor.executeEdits('db-ai-insert', [{ range, text: next, forceMoveMarkers: true }])
    }
  },
  getTextUntilCursor(): string {
    if (!editor) return ''
    const pos = editor.getPosition()
    const model = editor.getModel()
    if (!pos || !model) return ''
    return model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: pos.lineNumber,
      endColumn: pos.column
    })
  },
  /**
   * Return the SQL statement the cursor is sitting inside, using a simple
   * semicolon-split policy. Good enough for Tier B scope; does NOT try to
   * understand strings / comments / dollar-quoted blocks. If the cursor is
   * between two semicolons with only whitespace between them, returns ''.
   */
  getCurrentStatement(): string {
    if (!editor) return ''
    const model = editor.getModel()
    const pos = editor.getPosition()
    if (!model || !pos) return ''
    const text = model.getValue()
    const offset = model.getOffsetAt(pos)
    // Clamp defensively — Monaco should never hand us out-of-range offsets,
    // but a caller-invoked race could.
    const clamped = Math.max(0, Math.min(offset, text.length))
    let start = 0
    let end = text.length
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== ';') continue
      if (i < clamped) {
        start = i + 1 // statement after this semicolon
      } else {
        end = i // statement up to (not including) this semicolon
        break
      }
    }
    return text.slice(start, end).trim()
  },
  focus() {
    editor?.focus()
  }
})
</script>

<style scoped>
.sql-monaco-editor {
  width: 100%;
  height: 100%;
  min-height: 120px;
}
</style>
