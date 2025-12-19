import { ipcMain } from 'electron'
import { keyboardInteractiveOpts } from '../sshHandle'

export const handleJumpServerKeyboardInteractive = (event, id, prompts, finish) => {
  return new Promise<void>((resolve, reject) => {
    event.sender.send('ssh:keyboard-interactive-request', {
      id,
      prompts: prompts.map((p) => p.prompt)
    })

    const timeoutId = setTimeout(() => {
      ipcMain.removeAllListeners(`ssh:keyboard-interactive-response:${id}`)
      ipcMain.removeAllListeners(`ssh:keyboard-interactive-cancel:${id}`)
      finish([])
      event.sender.send('ssh:keyboard-interactive-timeout', { id })
      reject(new Error('Two-factor authentication timeout'))
    }, 30000)

    ipcMain.once(`ssh:keyboard-interactive-response:${id}`, (_evt, responses) => {
      clearTimeout(timeoutId)
      finish(responses)
      keyboardInteractiveOpts.set(id, responses)
      resolve()
    })

    ipcMain.once(`ssh:keyboard-interactive-cancel:${id}`, () => {
      clearTimeout(timeoutId)
      finish([])
      reject(new Error('User cancelled two-factor authentication'))
    })
  })
}
