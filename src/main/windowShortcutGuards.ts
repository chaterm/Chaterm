type ReloadShortcutInput = {
  type?: string
  key?: string
  meta?: boolean
  control?: boolean
  alt?: boolean
  shift?: boolean
}

type ReloadShortcutContext = {
  platform: NodeJS.Platform | string
  isTerminalFocused: boolean
  isFileEditorFocused: boolean
}

const isReloadShortcut = (input: ReloadShortcutInput): boolean => {
  return input.type === 'keyDown' && (input.key === 'r' || input.key === 'R') && !input.alt && !input.shift
}

const hasPlatformReloadModifier = (input: ReloadShortcutInput, platform: NodeJS.Platform | string): boolean => {
  return platform === 'darwin' ? !!input.meta : !!input.control
}

export const shouldRequestFileEditorReplaceShortcut = (
  input: ReloadShortcutInput,
  context: Pick<ReloadShortcutContext, 'platform' | 'isFileEditorFocused'>
): boolean => {
  return isReloadShortcut(input) && context.isFileEditorFocused && hasPlatformReloadModifier(input, context.platform)
}

export const shouldPreventReloadShortcut = (input: ReloadShortcutInput, context: ReloadShortcutContext): boolean => {
  if (!isReloadShortcut(input) || !hasPlatformReloadModifier(input, context.platform)) {
    return false
  }

  if (context.platform === 'darwin') {
    return true
  }

  return context.isFileEditorFocused || !context.isTerminalFocused
}
