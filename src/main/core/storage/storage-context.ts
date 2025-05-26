import * as keyStorage from './key-storage'

// 存储在 secrets 中的值的类型，简化为 string
// GlobalState 和 WorkspaceState 可以存储 any 类型

interface StateLike {
  get<T>(key: string): Promise<T | undefined>
  update<T>(key: string, value: T): Promise<void>
  keys?(): Promise<string[]>
}

interface SecretsLike {
  get(key: string): Promise<string | undefined>
  store(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export class StorageContext {
  public globalState: StateLike
  public workspaceState: StateLike
  public secrets: SecretsLike

  constructor() {
    this.globalState = {
      get: async <T>(key: string): Promise<T | undefined> => {
        return keyStorage.getItem<T>(`global_${key}`)
      },
      update: async <T>(key: string, value: T): Promise<void> => {
        return keyStorage.setItem<T>(`global_${key}`, value)
      },
      keys: async (): Promise<string[]> => {
        const allKeys = await keyStorage.getAllKeys()
        return allKeys.filter((k) => k.startsWith('global_')).map((k) => k.replace('global_', ''))
      }
    }

    this.workspaceState = {
      get: async <T>(key: string): Promise<T | undefined> => {
        return keyStorage.getItem<T>(`workspace_${key}`)
      },
      update: async <T>(key: string, value: T): Promise<void> => {
        return keyStorage.setItem<T>(`workspace_${key}`, value)
      },
      keys: async (): Promise<string[]> => {
        const allKeys = await keyStorage.getAllKeys()
        return allKeys
          .filter((k) => k.startsWith('workspace_'))
          .map((k) => k.replace('workspace_', ''))
      }
    }

    this.secrets = {
      get: async (key: string): Promise<string | undefined> => {
        return keyStorage.getItem<string>(`secret_${key}`)
      },
      store: async (key: string, value: string): Promise<void> => {
        return keyStorage.setItem<string>(`secret_${key}`, value)
      },
      delete: async (key: string): Promise<void> => {
        return keyStorage.deleteItem(`secret_${key}`)
      }
    }
  }
}

export const storageContext = new StorageContext()
