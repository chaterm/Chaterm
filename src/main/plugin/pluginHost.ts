import { InstallHint } from './pluginManager'
import { StateLike, SecretsLike } from './pluginGlobalState'
export type VersionProviderFn = () => string | null | Promise<string | null>

export interface ITreeItem {
  id: string
  label: string
  collapsibleState?: 'none' | 'collapsed'
  command?: string
  args?: any[]
}

export interface PluginHost {
  registerVersionProvider: (fn: () => string | null | Promise<string | null>) => void
  registerInstallHint: (hint: InstallHint) => void
  globalState: StateLike
  workspaceState: StateLike
  secrets: SecretsLike
  registerTreeDataProvider: (
    viewId: string,
    provider: {
      getChildren: (element?: any) => Promise<ITreeItem[]>
    }
  ) => void
  executeCommand: (commandId: string, ...args: any[]) => Promise<any>
  registerCommand: (commandId: string, handler: (...args: any[]) => any) => void
  setContext: (key: string, value: any) => void
  refreshTree: (viewId: string) => void
  asAbsolutePath: (relativePath: string) => string
  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<boolean>
}
