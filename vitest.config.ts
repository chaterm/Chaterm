import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@shared': resolve('src/main/agent/shared'),
      '@core': resolve('src/main/agent/core'),
      '@services': resolve('src/main/agent/services'),
      '@integrations': resolve('src/main/agent/integrations'),
      '@utils': resolve('src/main/agent/utils'),
      '@api': resolve('src/main/agent/api'),
      '@storage': resolve('src/main/storage'),
      '@renderer': resolve('src/renderer/src'),
      '@views': resolve('src/renderer/src/views'),
      '@router': resolve('src/renderer/src/router'),
      '@store': resolve('src/renderer/src/store'),
      '@config': resolve('src/renderer/src/config'),
      '@': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['tests/e2e/**', 'di st/**', 'node_modules/**', 'src/renderer/src/utils/terminalOutputExtractor.test.ts'],
    coverage: {
      provider: 'v8',
      enabled: false, // 默认关闭，使用 npm run test:coverage 时会自动开启
      reporter: ['text', 'html', 'json'],
      exclude: ['tests/**', 'dist/**', 'electron.vite.config.ts', 'src/renderer/src/env.d.ts']
    }
  }
})
