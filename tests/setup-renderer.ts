// Node.js 22+ ships an experimental built-in `localStorage` getter on the
// global object. Without `--localstorage-file`, it is a useless empty object.
// Vitest's `populateGlobal` skips copying jsdom's `localStorage` over to the
// Node global because the key already exists, leaving tests with the broken
// Node version. Re-expose jsdom's real Storage instances on the global so
// tests can use localStorage/sessionStorage and dispatch StorageEvents.
const jsdomWindow = (window as any).jsdom?.window as Window | undefined

if (jsdomWindow) {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const storage = jsdomWindow[name]
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => storage,
      set: (next: Storage) => {
        Object.defineProperty(window, name, {
          configurable: true,
          writable: true,
          value: next
        })
      }
    })
  }
}
