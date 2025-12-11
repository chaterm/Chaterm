import { ChatermDatabaseService } from '../storage/database'
import { getCurrentUserId, getGuestUserId } from '../storage/db/connection'

export interface StateLike {
  get<T>(key: string): Promise<T | undefined>
  update<T>(key: string, value: T): Promise<void>
  keys(): Promise<string[]>
}

export interface SecretsLike {
  get(key: string): Promise<string | undefined>
  store(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * Retrieve the DB instance corresponding to the current user
 * db:kv:get / db:kv:mutate
 */
async function getDbForCurrentUser() {
  let userId = getCurrentUserId()

  if (!userId) {
    userId = getGuestUserId()
  }

  return ChatermDatabaseService.getInstance(userId)
}

/**
 * Read any key
 */
async function getValue<T>(rawKey: string): Promise<T | undefined> {
  const db = await getDbForCurrentUser()
  const row = db.getKeyValue(rawKey)
  if (!row || !row.value) return undefined

  const { safeParse } = await import('../storage/db/json-serializer')
  const parsedValue = await safeParse(row.value)
  return parsedValue as T
}

/**
 * Write any key
 */
async function setValue<T>(rawKey: string, value: T): Promise<void> {
  const db = await getDbForCurrentUser()
  const { safeStringify } = await import('../storage/db/json-serializer')

  const result = await safeStringify(value)
  if (!result.success) {
    throw new Error(`Failed to serialize value: ${result.error}`)
  }

  await db.setKeyValue({
    key: rawKey,
    value: result.data!,
    updated_at: Date.now()
  })
}

/**
 * Delete any key
 */
async function deleteValue(rawKey: string): Promise<void> {
  const db = await getDbForCurrentUser()
  await db.deleteKeyValue(rawKey)
}

/**
 * Read all keys
 */
async function getAllKeys(): Promise<string[]> {
  const db = await getDbForCurrentUser()
  return db.getAllKeys()
}

/**
 * - globalState：global_
 * - workspaceState：workspace_
 * - secrets：secret_
 */
export class PluginStorageContext {
  public globalState: StateLike
  public workspaceState: StateLike
  public secrets: SecretsLike

  constructor() {
    this.globalState = {
      get: async <T>(key: string): Promise<T | undefined> => {
        return getValue<T>(`global_${key}`)
      },
      update: async <T>(key: string, value: T): Promise<void> => {
        return setValue<T>(`global_${key}`, value)
      },
      keys: async (): Promise<string[]> => {
        const allKeys = await getAllKeys()
        return allKeys.filter((k) => k.startsWith('global_')).map((k) => k.replace('global_', ''))
      }
    }

    this.workspaceState = {
      get: async <T>(key: string): Promise<T | undefined> => {
        return getValue<T>(`workspace_${key}`)
      },
      update: async <T>(key: string, value: T): Promise<void> => {
        return setValue<T>(`workspace_${key}`, value)
      },
      keys: async (): Promise<string[]> => {
        const allKeys = await getAllKeys()
        return allKeys.filter((k) => k.startsWith('workspace_')).map((k) => k.replace('workspace_', ''))
      }
    }

    this.secrets = {
      get: async (key: string): Promise<string | undefined> => {
        return getValue<string>(`secret_${key}`)
      },
      store: async (key: string, value: string): Promise<void> => {
        return setValue<string>(`secret_${key}`, value)
      },
      delete: async (key: string): Promise<void> => {
        return deleteValue(`secret_${key}`)
      }
    }
  }
}
