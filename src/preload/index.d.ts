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
  sendToMain: (message: any) => Promise<any>
  onMainMessage: (callback: (message: any) => void) => () => void
  cancelTask: () => Promise<any>
  openHeartbeatWindow: (heartbeatId: string, interval: number) => Promise<any>
  closeHeartbeatWindow: (heartbeatId: string) => Promise<any>
  heartBeatTick: (callback: (heartbeatId: string) => void) => () => void
  userSnippetOperation: (data: { operation: 'list' | 'create' | 'delete' | 'update' | 'swap'; params?: any }) => Promise<{
    code: number
    message?: string
    data?: any
  }>
  updateOrganizationAssetFavorite: (data: { organizationUuid: string; host: string; status: number }) => Promise<any>
  updateOrganizationAssetComment: (data: { organizationUuid: string; host: string; comment: string }) => Promise<any>
  // 自定义文件夹管理API
  createCustomFolder: (data: { name: string; description?: string }) => Promise<any>
  getCustomFolders: () => Promise<any>
  updateCustomFolder: (data: { folderUuid: string; name: string; description?: string }) => Promise<any>
  deleteCustomFolder: (data: { folderUuid: string }) => Promise<any>
  moveAssetToFolder: (data: { folderUuid: string; organizationUuid: string; assetHost: string }) => Promise<any>
  removeAssetFromFolder: (data: { folderUuid: string; organizationUuid: string; assetHost: string }) => Promise<any>
  getAssetsInFolder: (data: { folderUuid: string }) => Promise<any>
  refreshOrganizationAssets: (data: { organizationUuid: string; jumpServerConfig: any }) => Promise<any>
  updateTheme: (params: any) => Promise<boolean>
  mainWindowInit: (params: any) => Promise<void>
  mainWindowShow: () => Promise<void>
  onSystemThemeChanged: (callback: (theme: string) => void) => () => void
  // Keyboard-interactive authentication
  onKeyboardInteractiveRequest: (callback: (data: any) => void) => () => void
  onKeyboardInteractiveTimeout: (callback: (data: any) => void) => () => void
  onKeyboardInteractiveResult: (callback: (data: any) => void) => () => void
  submitKeyboardInteractiveResponse: (id: string, code: string) => void
  cancelKeyboardInteractive: (id: string) => void
  // JumpServer user selection
  onUserSelectionRequest: (callback: (data: any) => void) => () => void
  onUserSelectionTimeout: (callback: (data: any) => void) => () => void
  sendUserSelectionResponse: (id: string, userId: number) => void
  sendUserSelectionCancel: (id: string) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ApiType
  }
}
