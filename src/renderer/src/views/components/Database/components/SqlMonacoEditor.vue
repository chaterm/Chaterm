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
}>()

const containerRef = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

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
})

watch(
  () => props.modelValue,
  (v) => {
    if (editor && v !== editor.getValue()) editor.setValue(v ?? '')
  }
)

onBeforeUnmount(() => {
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
