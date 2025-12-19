import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'

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
          exclude: ['src/renderer/src/utils/terminalOutputExtractor.test.ts'],
          environment: 'node'
        },
        plugins: [vue()],
        resolve: {
          alias: {
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
        }
      }
    ],
    coverage: {
      provider: 'v8',
      enabled: false,
      reporter: ['text', 'html', 'json'],
      exclude: ['tests/**', 'dist/**', 'electron.vite.config.ts', 'src/renderer/src/env.d.ts']
    }
  }
})
