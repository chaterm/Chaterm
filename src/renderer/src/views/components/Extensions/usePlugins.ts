import { computed, ref } from 'vue'
import { listStorePlugins } from '@/api/plugin/plugin'

const api = (window as any).api

export interface PluginUiItem {
  id: string
  name: string
  description: string
  iconUrl: string | null
  version: string | null
  tabName: string
  enabled: boolean
}

export interface StorePluginItem {
  pluginId: string
  name: string
  description: string
  latestVersion: string
  iconUrl: string
  isPrivate: boolean
}

export interface DisplayPluginItem {
  name: string
  description: string
  iconKey: string
  iconUrl: string
  tabName: string
  show: boolean
  isPlugin: boolean
  pluginId?: string
  installed: boolean
  hasUpdate: boolean
  installedVersion?: string
  latestVersion?: string
  isDraggedOnly?: boolean
}

const pluginItems = ref<PluginUiItem[]>([])
const storePlugins = ref<StorePluginItem[]>([])

const compareVersion = (a?: string, b?: string): number => {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0
    const vb = pb[i] || 0
    if (va > vb) return 1
    if (va < vb) return -1
  }
  return 0
}

const pluginList = computed<DisplayPluginItem[]>(() => {
  const installedMap = new Map<string, PluginUiItem>()
  pluginItems.value
    .filter((p) => p.enabled)
    .forEach((p) => {
      const key = p.id
      installedMap.set(key, p)
    })

  const merged: DisplayPluginItem[] = []

  for (const sp of storePlugins.value) {
    const installed = installedMap.get(sp.pluginId)
    if (installed) {
      const installedVersion = installed.version || ''
      const hasUpdate = compareVersion(installedVersion, sp.latestVersion) < 0
      merged.push({
        name: sp.name,
        description: sp.description,
        iconKey: '',
        iconUrl: installed.iconUrl || '',
        tabName: installed.name,
        show: true,
        isPlugin: true,
        pluginId: installed.id,
        installed: true,
        hasUpdate,
        installedVersion,
        latestVersion: sp.latestVersion
      })
      installedMap.delete(sp.pluginId)
    } else {
      // The store has it, but it is not installed locally
      merged.push({
        name: sp.name,
        description: sp.description,
        iconKey: '',
        iconUrl: sp.iconUrl,
        tabName: sp.name,
        show: true,
        isPlugin: true,
        pluginId: sp.pluginId,
        installed: false,
        hasUpdate: false,
        isDraggedOnly: false,
        installedVersion: '',
        latestVersion: sp.latestVersion
      })
    }
  }

  // The rest are plugins that are available locally but not in the store
  installedMap.forEach((p) => {
    merged.push({
      name: p.name,
      description: p.description,
      iconKey: '',
      iconUrl: p.iconUrl || '',
      tabName: p.name,
      show: true,
      isPlugin: true,
      pluginId: p.id,
      installed: true,
      hasUpdate: false,
      installedVersion: p.version || '',
      latestVersion: ''
    })
  })

  // Sort: Installed First
  return merged
    .filter((item) => item.show)
    .sort((a, b) => {
      const rank = (x: DisplayPluginItem) => {
        if (x.installed) return 0
        if (x.hasUpdate) return 1
        return 2
      }
      const ra = rank(a)
      const rb = rank(b)
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name)
    })
})

const loadPlugins = async () => {
  try {
    if (!api?.listPlugins) return
    const list = await api.listPlugins()
    pluginItems.value = (list || [])
      .filter((p: any) => p.enabled)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        version: p.version,
        description: p.description,
        iconUrl: p.iconUrl || null,
        tabName: p.tabName || p.id,
        enabled: p.enabled
      }))
  } catch (e) {
    console.error('loadPlugins error', e)
  }
}

const loadStorePlugins = async () => {
  try {
    const res: any = await listStorePlugins()
    const data = res?.data || res
    const plugins = data?.plugins || []

    storePlugins.value = plugins.map((p: any) => ({
      pluginId: p.pluginId,
      name: p.name,
      description: p.description,
      latestVersion: p.latestVersion,
      isPrivate: p.isPrivate,
      iconUrl: p.iconUrl
    }))
  } catch (e) {
    console.error('loadStorePlugins error', e)
  }
}

const uninstallLocalPlugin = (pluginId: string) => {
  pluginItems.value = pluginItems.value.filter((p) => p.id !== pluginId)
}

export function usePluginStore() {
  return {
    pluginItems,
    storePlugins,
    pluginList,
    loadPlugins,
    loadStorePlugins,
    uninstallLocalPlugin
  }
}
