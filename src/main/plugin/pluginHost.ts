import { InstallHint } from './pluginManager'
import { StateLike, SecretsLike } from './pluginGlobalState'
export type VersionProviderFn = () => string | null | Promise<string | null>

export interface PluginHost {
  registerVersionProvider: (fn: () => string | null | Promise<string | null>) => void
  registerInstallHint: (hint: InstallHint) => void
  globalState: StateLike
  workspaceState: StateLike
  secrets: SecretsLike
}
