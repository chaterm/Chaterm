import './assets/main.css'
import './assets/theme.less'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import i18n from './locales'
import contextmenu from 'v-contextmenu'
import 'v-contextmenu/dist/themes/default.css'
import 'ant-design-vue/dist/reset.css'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { notification } from 'ant-design-vue'
import { shortcutService } from './services/shortcutService'
import { APP_EDITION } from './utils/edition'
import { createRendererLogger } from './utils/logger'
import { useEditorConfigStore } from './stores/editorConfig'

// Set document title based on edition
document.title = APP_EDITION === 'cn' ? 'Chaterm CN' : 'Chaterm'

// Set global notification top position
notification.config({
  top: '30px'
})
// Import storage functions
import * as storageState from './agent/storage/state'
// Import IndexedDB migration listener
import { setupIndexDBMigrationListener } from './services/indexdb-migration-listener'

// Initialize IndexedDB migration listener
setupIndexDBMigrationListener()

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
const app = createApp(App)
// Router
app.use(router)
// Internationalization
app.use(i18n)
// State management
app.use(pinia)
// Context menu
app.use(contextmenu)

// Vue warning handler - route Vue warnings to unified logger
const vueLogger = createRendererLogger('vue')
app.config.warnHandler = (msg, _instance, trace) => {
  vueLogger.warn(msg, { trace })
}

// Expose storage API to global window object for main process calls
declare global {
  interface Window {
    storageAPI: typeof storageState
  }
}

window.storageAPI = storageState

// Initialize editor config store early
const initializeEditorConfig = async () => {
  try {
    const editorConfigStore = useEditorConfigStore()
    await editorConfigStore.loadConfig()
  } catch (error) {
    console.error('Failed to initialize editor config:', error)
  }
}

app.mount('#app')

// Initialize editor config after app is mounted
initializeEditorConfig()

if (import.meta.hot) {
  import.meta.hot.on('vite:afterUpdate', () => {
    shortcutService.init()
  })
}

import { userConfigStore } from '@/services/userConfigStoreService'

// Register IPC handlers when renderer process starts
function setupIPCHandlers() {
  const electronAPI = (window as any).electron

  if (!electronAPI?.ipcRenderer) return
  const { ipcRenderer } = electronAPI

  ipcRenderer.on('userConfig:get', async () => {
    try {
      const config = await userConfigStore.getConfig()
      ipcRenderer.send('userConfig:get-response', config)
    } catch (error) {
      const e = error as Error
      ipcRenderer.send('userConfig:get-error', e.message)
    }
  })
}

setupIPCHandlers()

export { pinia }
