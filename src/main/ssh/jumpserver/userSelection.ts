import { ipcMain, BrowserWindow } from 'electron'
import { JumpServerUser } from './parser'

/**
 * Handle JumpServer user selection with event sender
 * Used in contexts where we have an IPC event object
 * @param event - Electron IPC event
 * @param connectionId - Connection identifier
 * @param users - List of available users
 * @returns Promise that resolves with selected user ID
 */
export const handleJumpServerUserSelectionWithEvent = (
  event: Electron.IpcMainInvokeEvent,
  connectionId: string,
  users: JumpServerUser[]
): Promise<number> => {
  return new Promise<number>((resolve, reject) => {
    // Send user selection request to frontend
    event.sender.send('jumpserver:user-selection-request', {
      id: connectionId,
      users
    })

    // Set timeout (30 seconds)
    const timeoutId = setTimeout(() => {
      ipcMain.removeAllListeners(`jumpserver:user-selection-response:${connectionId}`)
      ipcMain.removeAllListeners(`jumpserver:user-selection-cancel:${connectionId}`)
      event.sender.send('jumpserver:user-selection-timeout', { id: connectionId })
      reject(new Error('用户选择超时'))
    }, 30000)

    // Listen for user response
    ipcMain.once(`jumpserver:user-selection-response:${connectionId}`, (_evt: any, selectedUserId: number) => {
      clearTimeout(timeoutId)
      console.log(`User selected account ID: ${selectedUserId}`)
      resolve(selectedUserId)
    })

    // Listen for user cancel
    ipcMain.once(`jumpserver:user-selection-cancel:${connectionId}`, () => {
      clearTimeout(timeoutId)
      reject(new Error('User cancelled account selection'))
    })
  })
}

/**
 * Handle JumpServer user selection with BrowserWindow
 * Used in contexts where we don't have an IPC event object
 * @param connectionId - Connection identifier
 * @param users - List of available users
 * @returns Promise that resolves with selected user ID
 */
export const handleJumpServerUserSelectionWithWindow = (connectionId: string, users: JumpServerUser[]): Promise<number> => {
  return new Promise<number>((resolve, reject) => {
    // Send user selection request to frontend
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      mainWindow.webContents.send('jumpserver:user-selection-request', {
        id: connectionId,
        users
      })
    }

    // Set timeout (30 seconds)
    const timeoutId = setTimeout(() => {
      ipcMain.removeAllListeners(`jumpserver:user-selection-response:${connectionId}`)
      ipcMain.removeAllListeners(`jumpserver:user-selection-cancel:${connectionId}`)
      if (mainWindow) {
        mainWindow.webContents.send('jumpserver:user-selection-timeout', { id: connectionId })
      }
      reject(new Error('User selection timeout'))
    }, 30000)

    // Listen for user response
    ipcMain.once(`jumpserver:user-selection-response:${connectionId}`, (_evt: any, selectedUserId: number) => {
      clearTimeout(timeoutId)
      console.log(`[JumpServer ${connectionId}] User selected account ID: ${selectedUserId}`)
      resolve(selectedUserId)
    })

    // Listen for user cancel
    ipcMain.once(`jumpserver:user-selection-cancel:${connectionId}`, () => {
      clearTimeout(timeoutId)
      reject(new Error('User cancelled account selection'))
    })
  })
}
