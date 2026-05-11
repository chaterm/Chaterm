const dockBackedUserTabs = new Set([
  'CommonConfigEditor',
  'KnowledgeCenterEditor',
  'assetManagement',
  'assetConfig',
  'keyManagement',
  'userInfo',
  'userConfig',
  'mcpConfigEditor',
  'securityConfigEditor',
  'keywordHighlightEditor',
  'jumpserverSupport',
  'aliasConfig',
  'k8sClusterConfig',
  'files'
])

export const isDockBackedUserTab = (value: string): boolean => dockBackedUserTabs.has(value) || value.startsWith('plugins:')

export const getMenuForDockBackedUserTab = (currentMenu: string, value: string): string => {
  if (currentMenu === 'database' && isDockBackedUserTab(value)) {
    return 'workspace'
  }

  return currentMenu
}
