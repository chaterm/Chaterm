import { contextBridge, ipcRenderer } from 'electron'

// 公开一些 API 给浏览器窗口
contextBridge.exposeInMainWorld('api', {
  // 如果需要公开其他功能，可以在这里添加
})

// 监听 DOM 变化，捕获 SPA 的路由变化
window.addEventListener('DOMContentLoaded', () => {
  let lastUrl = location.href

  // 使用 MutationObserver 监听 DOM 变化
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      // 通知主进程 URL 已经变化 (针对单页应用)
      ipcRenderer.send('spa-url-changed', lastUrl)
    }
  })

  observer.observe(document, { subtree: true, childList: true })

  // 重写 history 方法以捕获单页应用的路由变化
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  history.pushState = function (args) {
    originalPushState.apply(this, args)
    ipcRenderer.send('spa-url-changed', location.href)
  }

  history.replaceState = function (args) {
    originalReplaceState.apply(this, args)
    ipcRenderer.send('spa-url-changed', location.href)
  }

  window.addEventListener('popstate', () => {
    ipcRenderer.send('spa-url-changed', location.href)
  })
})
