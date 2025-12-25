/// <reference types="vite/client" />
/// <reference types="../../preload/index.d.ts" />

declare const __APP_INFO__: {
  version: string
}

// Edition configuration injected at build time from build/edition-config/*.json
declare const __EDITION_CONFIG__: {
  edition: 'cn' | 'global'
  displayName: string
  api: {
    baseUrl: string
    kmsUrl: string
    syncUrl: string
  }
  update: {
    serverUrl: string
    releaseNotesUrl: string
  }
  auth: {
    loginBaseUrl: string
  }
  defaults: {
    language: string
  }
  legal: {
    privacyPolicyUrl: string
    termsOfServiceUrl: string
  }
  speech: {
    wsUrl: string
  }
  docs: {
    baseUrl: string
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Type declarations for vitest-browser-vue
declare module 'vitest-browser-vue' {
  import type { Component } from 'vue'

  export function render<T extends Component>(
    component: T,
    options?: {
      props?: Record<string, any>
      global?: {
        plugins?: any[]
        stubs?: Record<string, any>
      }
    }
  ): {
    container: HTMLElement
    baseElement: HTMLElement
  }

  export function cleanup(): Promise<void>
}

// Type declarations for @vitest/browser/context
declare module '@vitest/browser/context' {
  interface ElementLocator {
    element: () => HTMLElement
    click: () => Promise<void>
    fill: (value: string) => Promise<void>
    query: () => Promise<HTMLElement | null>
  }

  export const page: {
    getByTestId: (id: string) => ElementLocator
    getByRole: (role: string, options?: { name?: string | RegExp }) => ElementLocator
  }

  export const userEvent: {
    keyboard: (keys: string) => Promise<void>
  }
}
