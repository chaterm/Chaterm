const dockBackedUserTabs = new Set([
  'CommonConfigEditor',
  'KnowledgeCenterEditor',
  'assetManagement',
  'assetConfig',
  'keyManagement',
  'onboardingGuide',
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

interface DockPanelLike {
  params?: Record<string, any>
}

export const getDockTerminalTabId = (panel: DockPanelLike | null | undefined): string | null => {
  const params = panel?.params
  const panelType = params?.type || params?.data?.type
  if ((panelType !== 'term' && panelType !== 'ssh') || typeof params?.id !== 'string') {
    return null
  }

  return params.id
}
