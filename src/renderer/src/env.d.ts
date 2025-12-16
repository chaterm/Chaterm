/// <reference types="vite/client" />
/// <reference types="../../preload/index.d.ts" />

declare const __APP_INFO__: {
  version: string
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}
