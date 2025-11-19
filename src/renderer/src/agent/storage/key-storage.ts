import { getUserInfo } from '@/utils/permission'

// Get current user ID
function getCurrentUserId(): number {
  const userInfo = getUserInfo()
  if (!userInfo || !userInfo.uid) {
    throw new Error('User not logged in. Please login first to use storage.')
  }
  return userInfo.uid
}

// Set current user ID (for compatibility, not used in SQLite mode)
export function setCurrentUser(userId: number): void {
  // No-op in SQLite mode
  console.log('setCurrentUser called with userId:', userId)
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    await window.api.kvMutate({
      action: 'set',
      key: key,
      value: JSON.stringify(value)
    })
  } catch (error) {
    console.error('Error setting item in SQLite:', error)
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
    console.error('Error getting item from SQLite:', error)
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
    console.error('Error deleting item from SQLite:', error)
    throw error
  }
}

export async function getAllKeys(): Promise<string[]> {
  try {
    const result = await window.api.kvGet({})
    return result || []
  } catch (error) {
    console.error('Error getting all keys from SQLite:', error)
    throw error
  }
}
