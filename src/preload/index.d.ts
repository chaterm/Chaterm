import { ElectronAPI } from '@electron-toolkit/preload'
interface Cookie {
  name: string
  value: string
}
interface ApiType {
  getCookie: (name: string) => Promise<{
    success: boolean
    value?: string
  }>
  setCookie: (
    name: string,
    value: string,
    expirationDays: number
  ) => Promise<{
    success: boolean
    value?: string
  }>

  getAllCookies: () => Promise<{
    success: boolean
    cookies?: Cookie[]
  }>
  removeCookie: (name: string) => Promise<{
    success: boolean
  }>
  getLocalIP: () => Promise<string>
  getMacAddress: () => Promise<string>
  getPlatform: () => Promise<string>
  invokeCustomAdsorption: (data: { appX: number; appY: number }) => void
  queryCommand: (data: { command: string; ip: string }) => Promise<any>
  insertCommand: (data: { command: string; ip: string }) => Promise<any>
  getLocalAssetRoute: (data: { searchType: string; params?: any[] }) => Promise<any>
  updateLocalAssetLabel: (data: { uuid: string; label: string }) => Promise<any>
  updateLocalAsseFavorite: (data: { uuid: string; status: number }) => Promise<any>
  chatermInsert: (data: { sql: string; params?: any[] }) => Promise<any>
  chatermUpdate: (data: { sql: string; params?: any[] }) => Promise<any>
  deleteAsset: (data: { uuid: string }) => Promise<any>
  getKeyChainSelect: () => Promise<any>
  getAssetGroup: () => Promise<any>
  createAsset: (data: { form: any }) => Promise<any>
  updateAsset: (data: { form: any }) => Promise<any>
  getKeyChainList: () => Promise<any>
  createKeyChain: (data: { form: any }) => Promise<any>
  deleteKeyChain: (data: { id: number }) => Promise<any>
  getKeyChainInfo: (data: { id: number }) => Promise<any>
  updateKeyChain: (data: { form: any }) => Promise<any>
  connectAssetInfo: (data: { uuid: string }) => Promise<any>
  openBrowserWindow: (url: string) => Promise<void>
  connect: (connectionInfo: any) => Promise<any>
  shell: (params: any) => Promise<any>
  writeToShell: (params: any) => Promise<any>
  disconnect: (params: any) => Promise<any>
  selectPrivateKey: () => Promise<any>
  onShellData: (id: string, callback: (data: any) => void) => () => void
  onShellError: (id: string, callback: (data: any) => void) => () => void
  onShellClose: (id: string, callback: () => void) => () => void
  recordTerminalState: (params: any) => Promise<any>
  recordCommand: (params: any) => Promise<any>
  sshSftpList: (opts: { id: string; remotePath: string }) => Promise<any>
  sftpConnList: () => Promise<string[]>
  sshConnExec: (args: { id: string; cmd: string }) => Promise<any>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ApiType
  }
}
