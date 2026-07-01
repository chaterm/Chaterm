const MONACO_EDITOR_SELECTOR = '.monaco-editor-container, .monaco-editor, .monaco-editor textarea, .monaco-editor .inputarea'

export const isMonacoEditorShortcutTarget = (target: EventTarget | null): boolean => {
  const el = target as { closest?: (selector: string) => unknown } | null
  return !!el?.closest?.(MONACO_EDITOR_SELECTOR)
}
