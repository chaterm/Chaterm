import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin, bytecodePlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'
import AutoImport from 'unplugin-auto-import/vite'

const publicDir = resolve('resources')
const envDir = resolve('build')

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          'p-wait-for',
          'chrome-launcher',
          'globby',
          'execa',
          'p-timeout',
          'get-folder-size',
          'serialize-error',
          'os-name'
        ]
      }),
      bytecodePlugin()
    ],
    resolve: {
      alias: {
        '@shared': resolve('src/main/shared'),
        '@core': resolve('src/main/core'),
        '@services': resolve('src/main/services'),
        '@integrations': resolve('src/main/integrations'),
        '@utils': resolve('src/main/utils'),
        '@api': resolve('src/main/api'),
        vscode: resolve('src/main/vscode-mock.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin(), bytecodePlugin()]
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
        '@': resolve('src/renderer/src')
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
    plugins: [
      vue(),
      Components({
        resolvers: [
          AntDesignVueResolver({
            importStyle: false // 使用 CSS in JS
          })
        ]
      }),
      AutoImport({
        resolvers: [AntDesignVueResolver()]
      })
    ],
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true
        }
      }
    }
  }
})
