/**
 * AiTab workspace identifier. Controls which feature surface the component
 * is embedded into:
 *
 *  - `terminal` (default): classic right-side AI sidebar in Terminal mode,
 *    plus the Agent full-screen mode. Drives host auto-detection via the
 *    SSH event bus, allows the agent/cmd mode picker, and persists sidebar
 *    state under the `terminal` namespace.
 *  - `database`: mounted inside the Database workspace (Phase 3 / task
 *    #18). Does NOT talk to the SSH host event bus, locks chat mode to
 *    `agent`, carries a DB context (`assetId` / database / schema), and
 *    persists sidebar state under a separate `database` namespace so DB
 *    chat tabs never leak into Terminal sessions.
 *
 * Stage 1 of #18 introduces the prop and short-circuits terminal-specific
 * behaviours. Stages 2-3 add the Database workspace mount, the AI toggle
 * button, and Task payload plumbing once `#11` lands the `workspace` +
 * `dbContext` fields on `WebviewMessage`.
 */
export type AiTabWorkspace = 'terminal' | 'database'

export const AI_TAB_DEFAULT_WORKSPACE: AiTabWorkspace = 'terminal'

/**
 * Lightweight guard to check whether a value is a valid `AiTabWorkspace`.
 * Useful when reading persisted localStorage values.
 */
export function isAiTabWorkspace(value: unknown): value is AiTabWorkspace {
  return value === 'terminal' || value === 'database'
}

/**
 * localStorage key for persisted AiTab sidebar state. Stage 1 of #18
 * introduces workspace-scoped namespacing so Terminal chats and Database
 * chats don't share one tab list. A one-time migration promotes the
 * legacy `sharedAiTabState` blob into the terminal namespace on the first
 * load that sees it.
 *
 * Keep the key shape stable — other modules (e.g. TerminalLayout save/load
 * callbacks) reference the string returned here, not a hand-written literal.
 */
export function aiTabStorageKey(workspace: AiTabWorkspace): string {
  return `sharedAiTabState:${workspace}`
}

/**
 * Legacy key (pre-namespacing). Present on any user who upgraded from a
 * build before Stage 1 of #18. Migration logic lives in
 * `migrateLegacyAiTabStorage` so TerminalLayout stays a thin consumer.
 */
export const LEGACY_AI_TAB_STORAGE_KEY = 'sharedAiTabState'

/**
 * Best-effort one-time migration:
 *  - If the legacy key exists and the terminal-namespaced key does NOT,
 *    rename the value so existing users keep their Terminal AiTab state.
 *  - Always remove the legacy key after the first run so we don't thrash
 *    on every mount.
 *
 * Runs in the renderer; relies on `globalThis.localStorage` being available.
 * Fails silently — a missing / broken localStorage should never block AiTab
 * from rendering.
 */
export function migrateLegacyAiTabStorage(): void {
  const g = globalThis as unknown as { localStorage?: Storage }
  const storage = g.localStorage
  if (!storage) return
  try {
    const legacy = storage.getItem(LEGACY_AI_TAB_STORAGE_KEY)
    if (legacy === null) return
    const targetKey = aiTabStorageKey('terminal')
    if (storage.getItem(targetKey) === null) {
      storage.setItem(targetKey, legacy)
    }
    storage.removeItem(LEGACY_AI_TAB_STORAGE_KEY)
  } catch {
    // storage quota, privacy mode, etc. — the legacy state will just be
    // ignored on subsequent loads, which is still acceptable.
  }
}
