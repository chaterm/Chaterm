import mitt from 'mitt'
import type { AssetInfo } from '@/views/components/AiTab/types'

/**
 * Define event types
 */
export interface AppEvents {
  currentClickServer: any // Can be replaced with actual item type instead of any
  updateRightIcon: boolean // Update right icon status
  executeTerminalCommand: { command: string; tabId?: string } // Execute terminal command
  autoExecuteCode: { command: string; tabId: string }
  focusActiveTerminal: string | undefined // Return focus to currently active terminal
  getActiveTabAssetInfo: void // Request to get asset information of current active tab
  assetInfoResult: AssetInfo | null // Return asset information result
  LocalAssetMenu: any // Update asset directory
  SettingModelChanged: any // Setting page model change event
  AiTabModelChanged: any // AI Tab model change event
  apiProviderChanged: any
  activeTabChanged: any
  chatToAi: any
  sendMessageToAi: { content: string; tabId?: string }
  toggleMenu: any
  updateWatermark: string // Update watermark status
  updateSecretRedaction: string // Update secret redaction status
  updateDataSync: string // Update data sync status
  keyChainUpdated: void // Keychain update event, used to sync key options in host configuration
  aliasStatusChanged: number // Alias status change event, 1 means enabled, 2 means disabled
  openUserTab: any // Open Tab
  kbActiveFileChanged: { relPath: string } // KnowledgeCenter active file changed
  kbEntriesRemoved: { entries: Array<{ relPath: string; isDir: boolean }> } // KnowledgeCenter delete/cut remove tabs
  kbFileRenamed: { oldRelPath: string; newRelPath: string; newName: string } // KnowledgeCenter file/folder renamed
  // Can extend more events
  [key: string | symbol]: any
}

const emitter = mitt<AppEvents>()

const ASYNC_EMIT_DEFAULT_TIMEOUT_MS = 3_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) {
    return promise
  }
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`eventBus emitAsync timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeoutId)
        reject(error)
      }
    )
  })
}

async function emitAsync<T extends keyof AppEvents>(type: T, event?: AppEvents[T], options?: { timeoutMs?: number }): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? ASYNC_EMIT_DEFAULT_TIMEOUT_MS
  const handlers = emitter.all.get(type) as Set<(payload: AppEvents[T]) => unknown> | undefined

  if (!handlers || handlers.size === 0) {
    return
  }

  const tasks = Array.from(handlers).map(async (handler) => {
    await withTimeout(Promise.resolve(handler(event as AppEvents[T])), timeoutMs)
  })

  await Promise.all(tasks)
}

const eventBus = {
  on: emitter.on,
  off: emitter.off,
  emit: emitter.emit,
  emitAsync
}

export default eventBus
