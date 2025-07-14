import './assets/main.css'
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

// 全局设置 notification 的 top
notification.config({
  top: '30px'
})
// 导入存储函数
import * as storageState from './agent/storage/state'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
const app = createApp(App)
//路由
app.use(router)
//国际化
app.use(i18n)
//状态管理
app.use(pinia)
// 右键
app.use(contextmenu)

// 将存储 API 暴露到全局 window 对象，供主进程调用
declare global {
  interface Window {
    storageAPI: typeof storageState
  }
}

window.storageAPI = storageState

app.mount('#app')

if (import.meta.hot) {
  import.meta.hot.on('vite:afterUpdate', () => {
    shortcutService.init()
  })
}

export { pinia }
