import * as fs from 'fs'
import path from 'path'
import { clearInstallHints, clearVersionProviders, listPlugins, PluginManifest, registerInstallHint, registerVersionProvider } from './pluginManager'

import type { PluginHost, PluginHostModules, VersionProviderFn } from './pluginHost'
import { PluginStorageContext } from './pluginGlobalState'
import { capabilityRegistry, BastionCapability, BastionDefinition } from '../ssh/capabilityRegistry'

export interface PluginModule {
  register(host: PluginHost): void | Promise<void>
}

export async function loadAllPlugins() {
  const plugins = listPlugins()

  clearVersionProviders()
  clearInstallHints()
  capabilityRegistry.clearBastions()
  const storage = new PluginStorageContext()

  let hostModules: PluginHostModules = {}
  try {
    hostModules = {
      ssh2: require('ssh2')
    }
  } catch (e) {
    console.warn('[pluginLoader] ssh2 module not available for plugins:', e)
  }

  for (const p of plugins) {
    if (!p.enabled) continue

    const manifestPath = path.join(p.path, 'plugin.json')
    if (!fs.existsSync(manifestPath)) continue

    let manifest: PluginManifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest
    } catch (e) {
      console.error('[pluginLoader] invalid manifest for', p.id, e)
      continue
    }

    const entry = path.join(p.path, manifest.main)
    if (!fs.existsSync(entry)) {
      console.error('[pluginLoader] main entry not found for', p.id)
      continue
    }
    const host: PluginHost = {
      registerVersionProvider(fn: VersionProviderFn) {
        registerVersionProvider(p.id, fn)
      },
      registerInstallHint(hint) {
        registerInstallHint(p.id, hint)
      },
      registerBastionCapability(capability: BastionCapability) {
        capabilityRegistry.registerBastion(capability)
      },
      registerBastionDefinition(definition: BastionDefinition) {
        capabilityRegistry.registerBastionDefinition(definition)
      },
      globalState: storage.globalState,
      workspaceState: storage.workspaceState,
      secrets: storage.secrets,
      modules: hostModules
    }
    try {
      const mod: PluginModule = require(entry)
      if (typeof mod.register === 'function') {
        await mod.register(host)
        console.log('[pluginLoader] plugin registered:', p.id)
      } else {
        console.log('[pluginLoader] plugin has no register():', p.id)
      }
    } catch (e) {
      console.error('[pluginLoader] load error for', p.id, e)
    }
  }
}
