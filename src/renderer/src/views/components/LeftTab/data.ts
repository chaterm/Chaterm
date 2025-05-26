const menuTabsData = [
  {
    name: 'Hosts',
    key: 'workspace',
    icon: new URL('@/assets/menu/host.svg', import.meta.url).href,
    activeIcon: new URL('@/assets/menu/host_active.svg', import.meta.url).href
  },
  {
    name: 'Keychain',
    key: 'keychain',
    icon: new URL('@/assets/menu/key.svg', import.meta.url).href,
    activeIcon: new URL('@/assets/menu/key_active.svg', import.meta.url).href
  },
  {
    name: 'Files',
    key: 'files',
    icon: new URL('@/assets/menu/files.svg', import.meta.url).href,
    activeIcon: new URL('@/assets/menu/files_active.svg', import.meta.url).href
  },
  {
    name: 'Extensions',
    key: 'extensions',
    icon: new URL('@/assets/menu/extensions.svg', import.meta.url).href,
    activeIcon: new URL('@/assets/menu/extensions_active.svg', import.meta.url).href
  },
  {
    name: 'Monitor',
    key: 'monitor',
    icon: new URL('@/assets/menu/monitor.svg', import.meta.url).href,
    activeIcon: new URL('@/assets/menu/monitor_active.svg', import.meta.url).href
  },
  {
    name: 'AI',
    key: 'ai',
    icon: new URL('@/assets/menu/ai.svg', import.meta.url).href,
    activeIcon: new URL('@/assets/menu/ai_active.svg', import.meta.url).href
  },
  {
    name: 'User',
    key: 'user',
    icon: new URL('@/assets/menu/user.svg', import.meta.url).href,
    activeIcon: new URL('@/assets/menu/user_active.svg', import.meta.url).href
  },
  {
    name: 'Setting',
    key: 'setting',
    icon: new URL('@/assets/menu/setting.svg', import.meta.url).href,
    activeIcon: new URL('@/assets/menu/setting_active.svg', import.meta.url).href
  },
  {
    name: 'Notice',
    key: 'notice',
    icon: new URL('@/assets/menu/notice.svg', import.meta.url).href,
    activeIcon: new URL('@/assets/menu/notice_active.svg', import.meta.url).href
  }
]
export { menuTabsData }
