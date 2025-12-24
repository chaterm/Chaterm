import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'

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
  test: {
    // Projects configuration for different test contexts
    projects: [
      {
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
