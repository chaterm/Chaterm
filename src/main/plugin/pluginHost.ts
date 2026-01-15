import { InstallHint } from './pluginManager'
import { StateLike, SecretsLike } from './pluginGlobalState'
import type { BastionCapability, BastionDefinition } from '../ssh/capabilityRegistry'

export type VersionProviderFn = () => string | null | Promise<string | null>

export interface PluginHostModules {
  ssh2?: typeof import('ssh2')
}

export interface PluginHost {
  registerVersionProvider: (fn: () => string | null | Promise<string | null>) => void
  registerInstallHint: (hint: InstallHint) => void
  globalState: StateLike
  workspaceState: StateLike
  secrets: SecretsLike
  modules: PluginHostModules

  /**
   * Register a bastion capability for plugin-based bastion host integration.
   * JumpServer is built-in and does not use this mechanism.
   * @param capability The bastion capability to register
   */
  registerBastionCapability: (capability: BastionCapability) => void

  /**
   * Register a bastion definition (plugin metadata) for dynamic UI/DB/routing.
   * Should be called alongside registerBastionCapability.
   * @param definition The bastion definition to register
   */
  registerBastionDefinition: (definition: BastionDefinition) => void
}
