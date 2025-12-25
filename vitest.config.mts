import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import pkg from './package.json'

// Load edition config for tests (default to 'cn' edition)
const loadEditionConfig = (edition: string) => {
  const configPath = resolve(`build/edition-config/${edition}.json`)
  try {
    const content = readFileSync(configPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    // Fallback config for tests
    return {
      edition,
      displayName: 'Chaterm',
      api: { baseUrl: '', kmsUrl: '', syncUrl: '' },
      update: { serverUrl: '', releaseNotesUrl: '' },
      auth: { loginBaseUrl: '' },
      defaults: { language: 'en-US' },
      legal: { privacyPolicyUrl: '', termsOfServiceUrl: '' },
      speech: { wsUrl: '' },
      docs: { baseUrl: '' }
    }
  }
}

const edition = process.env.APP_EDITION || 'cn'
const editionConfig = loadEditionConfig(edition)

// Shared defines for renderer tests
const rendererDefines = {
  __APP_INFO__: JSON.stringify({ version: pkg.version }),
  __EDITION_CONFIG__: JSON.stringify(editionConfig),
  'import.meta.env.RENDERER_APP_EDITION': JSON.stringify(edition)
}

// Shared renderer process aliases
const rendererAliases = {
  '@renderer': resolve('src/renderer/src'),
  '@views': resolve('src/renderer/src/views'),
  '@router': resolve('src/renderer/src/router'),
  '@store': resolve('src/renderer/src/store'),
  '@utils': resolve('src/renderer/src/utils'),
  '@api': resolve('src/renderer/src/api'),
  '@config': resolve('src/renderer/src/config'),
  '@': resolve('src/renderer/src'),
  '@shared': resolve('src/main/agent/shared')
}

export default defineConfig({
  // Root-level define for all projects to inherit
  define: rendererDefines,
  test: {
    // Projects configuration for different test contexts
    projects: [
      {
        extends: true,
        test: {
          name: 'main-process',
          include: ['src/main/**/*.test.ts', 'src/main/**/*.spec.ts'],
          environment: 'node'
        },
        resolve: {
          alias: {
            '@shared': resolve('src/main/agent/shared'),
            '@core': resolve('src/main/agent/core'),
            '@services': resolve('src/main/agent/services'),
            '@integrations': resolve('src/main/agent/integrations'),
            '@utils': resolve('src/main/agent/utils'),
            '@api': resolve('src/main/agent/api'),
            '@storage': resolve('src/main/storage')
          }
        }
      },
      {
        extends: true,
        test: {
          name: 'renderer-process',
          include: ['src/renderer/**/*.test.ts', 'src/renderer/**/*.spec.ts'],
          exclude: [
            'src/renderer/src/utils/terminalOutputExtractor.test.ts',
            'src/renderer/**/*.component.test.ts' // Exclude component tests from jsdom
          ],
          environment: 'jsdom'
        },
        plugins: [vue()],
        resolve: {
          alias: rendererAliases
        }
      },
      {
        extends: true,
        test: {
          name: 'renderer-browser',
          include: ['src/renderer/**/*.component.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
            viewport: { width: 1280, height: 720 }
          },
          globals: true
        },
        plugins: [vue()],
        resolve: {
          alias: [
            {
              find: /^monaco-editor$/,
              replacement: resolve(__dirname, 'node_modules/monaco-editor/esm/vs/editor/editor.api')
            },
            ...Object.entries(rendererAliases).map(([find, replacement]) => ({
              find,
              replacement
            }))
          ]
        }
      }
    ],
    coverage: {
      provider: 'v8',
      enabled: true,
      reporter: ['text', 'html', 'json'],
      exclude: ['tests/**', 'dist/**', 'electron.vite.config.ts', 'src/renderer/src/env.d.ts']
    }
  }
})
