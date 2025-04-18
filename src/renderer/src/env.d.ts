/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      getLocalIP: () => Promise<string>
      getMacAddress: () => Promise<string>
      invokeCustomAdsorption: (data: { appX: number; appY: number }) => Promise<void>
    }
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}
