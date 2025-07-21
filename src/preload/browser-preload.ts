import { contextBridge, ipcRenderer } from 'electron'

// Expose some APIs to the browser window
contextBridge.exposeInMainWorld('api', {
  // If other functions need to be exposed, add them here
})

// Listen for DOM changes to capture SPA route changes
window.addEventListener('DOMContentLoaded', () => {
  let lastUrl = location.href

  // Use MutationObserver to listen for DOM changes
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      // Notify main process that URL has changed (for single-page applications)
      ipcRenderer.send('spa-url-changed', lastUrl)
    }
  })

  observer.observe(document, { subtree: true, childList: true })

  // Override history methods to capture single-page application route changes
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
