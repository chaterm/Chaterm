/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      getLocalIP: () => Promise<string>
      getMacAddress: () => Promise<string>
      invokeCustomAdsorption: (data: { appX: number; appY: number }) => Promise<void>
      // SSH related methods
      connect: (data: {
        id: string
        host: string
        port: number
        username: string
        password: string
        privateKey: string
        passphrase: string
      }) => Promise<any>
      connectReadyData: (id: string) => Promise<any>
      shell: (data: { id: string }) => Promise<any>
      writeToShell: (data: { id: string; data: string; marker?: string }) => Promise<void>
      onShellData: (id: string, callback: (data: any) => void) => () => void
      onShellError: (id: string, callback: (data: any) => void) => () => void
      onShellClose: (id: string, callback: () => void) => () => void
      resizeShell: (id: string, cols: number, rows: number) => Promise<any>
      disconnect: (data: { id: string }) => Promise<any>
      sshConnExec: (data: { cmd: string; id: string }) => Promise<any>
      checkSftpConnAvailable: (id: string) => Promise<boolean>
      // Keyboard interactive methods
      onKeyboardInteractiveRequest: (callback: (data: any) => void) => () => void
      onKeyboardInteractiveTimeout: (callback: (data: any) => void) => () => void
      onKeyboardInteractiveResult: (callback: (data: any) => void) => () => void
      submitKeyboardInteractiveResponse: (id: string, response: string) => Promise<void>
      cancelKeyboardInteractive: (id: string) => Promise<void>
      // Asset related methods
      connectAssetInfo: (data: { uuid: string }) => Promise<any>
      // Command related methods
      queryCommand: (data: { command: string; ip: string }) => Promise<any>
      insertCommand: (data: { command: string; ip: string }) => Promise<any>
      getLocalAssetRoute: (data: { searchType: string; params?: any[] }) => Promise<any>
      updateLocalAssetLabel: (data: { uuid: string; label: string }) => Promise<any>
      updateLocalAsseFavorite: (data: { uuid: string; status: number }) => Promise<any>
      // Terminal state methods
      recordTerminalState: (data: { id: string; state: any }) => Promise<void>
      // SFTP related methods
      sftpConnList: () => Promise<string[]>
    }
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}
