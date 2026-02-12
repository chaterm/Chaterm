import { getUserInfo } from '@/utils/permission'

const logger = createRendererLogger('agent.storage')

// Get current user ID
export function getCurrentUserId(): number {
  const userInfo = getUserInfo()
  if (!userInfo || !userInfo.uid) {
    throw new Error('User not logged in. Please login first to use storage.')
  }
  return userInfo.uid
}

// Set current user ID (for compatibility, not used in SQLite mode)
export function setCurrentUser(userId: number): void {
  // No-op in SQLite mode
  logger.debug('setCurrentUser called', { userId })
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    await window.api.kvMutate({
      action: 'set',
      key: key,
      value: JSON.stringify(value)
    })
  } catch (error) {
    logger.error('Error setting item in SQLite', { key, error: error })
    throw error
  }
}

export async function getItem<T>(key: string): Promise<T | undefined> {
  try {
    const result = await window.api.kvGet({ key })
    if (result?.value) {
      return JSON.parse(result.value) as T
    }
    return undefined
  } catch (error) {
    logger.error('Error getting item from SQLite', { key, error: error })
    throw error
  }
}

export async function deleteItem(key: string): Promise<void> {
  try {
    await window.api.kvMutate({
      action: 'delete',
      key: key
    })
  } catch (error) {
    logger.error('Error deleting item from SQLite', { key, error: error })
    throw error
  }
}

export async function getAllKeys(): Promise<string[]> {
  try {
    const result = await window.api.kvGet({})
    return result || []
  } catch (error) {
    logger.error('Error getting all keys from SQLite', { error: error })
    throw error
  }
}
