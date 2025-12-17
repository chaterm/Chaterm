import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'
import AutoImport from 'unplugin-auto-import/vite'
import pkg from './package.json'

const publicDir = resolve('resources')
const envDir = resolve('build')

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['p-wait-for', 'chrome-launcher', 'globby', 'execa', 'p-timeout', 'get-folder-size', 'serialize-error', 'os-name']
      })
    ],
    resolve: {
      alias: {
        '@shared': resolve('src/main/agent/shared'),
        '@core': resolve('src/main/agent/core'),
        '@services': resolve('src/main/agent/services'),
        '@integrations': resolve('src/main/agent/integrations'),
        '@utils': resolve('src/main/agent/utils'),
        '@api': resolve('src/main/agent/api')
      }
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        external: [
          // Force externalize native modules to prevent bundling issues
          'chokidar',
          'fsevents'
        ]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true
    }
  },
  renderer: {
    publicDir,
    envDir,
    envPrefix: 'RENDERER_',
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
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://demo.chaterm.ai/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    build: {
      sourcemap: true
    },
    plugins: [
      vue(),
      Components({
        resolvers: [
          AntDesignVueResolver({
            importStyle: false // Use CSS in JS
          })
        ]
      }),
      AutoImport({
        resolvers: [AntDesignVueResolver()]
      })
    ],
    define: {
      __APP_INFO__: {
        version: pkg.version
      }
    },
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true
        }
      }
    }
  }
})
