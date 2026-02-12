import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'
import AutoImport from 'unplugin-auto-import/vite'
import pkg from './package.json'

const publicDir = resolve('resources')
const envDir = resolve('build')

type Edition = 'cn' | 'global'

// Edition configuration interface (must match build/edition-config/*.json structure)
interface EditionConfig {
  edition: Edition
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

/**
 * Load edition configuration from JSON file
 * This is the single source of truth for all edition-specific URLs
 */
const loadEditionConfig = (edition: Edition): EditionConfig => {
  const configPath = resolve(`build/edition-config/${edition}.json`)
  try {
    const content = readFileSync(configPath, 'utf-8')
    return JSON.parse(content) as EditionConfig
  } catch (error) {
    throw new Error(`Edition config not found for: ${edition}`)
  }
}

const resolveEdition = (mode: string | undefined): Edition => {
  if (process.env.APP_EDITION === 'cn' || process.env.APP_EDITION === 'global') {
    return process.env.APP_EDITION
  }

  if (mode?.endsWith('.cn')) {
    return 'cn'
  }

  if (mode?.endsWith('.global')) {
    return 'global'
  }

  return 'cn'
}

export default defineConfig(({ mode }) => {
  const resolvedMode = mode || 'development'
  const edition = resolveEdition(resolvedMode)

  // Load edition config from JSON (single source of truth)
  const editionConfig = loadEditionConfig(edition)

  // Load environment variables from the appropriate .env file
  // Note: Must specify 'RENDERER_' prefix since project uses RENDERER_* variables
  const env = loadEnv(resolvedMode, envDir, 'RENDERER_')

  // Use environment variable if available, otherwise use edition config
  const proxyTarget = env.RENDERER_VUE_APP_API_BASEURL || editionConfig.api.baseUrl

  return {
    main: {
      plugins: [
        externalizeDepsPlugin({
          exclude: ['p-wait-for', 'chrome-launcher', 'globby', 'execa', 'p-timeout', 'get-folder-size', 'serialize-error', 'os-name']
        }),
        AutoImport({
          imports: [
            {
              '@logging/index': ['createLogger']
            }
          ],
          dts: resolve('src/main/auto-imports.d.ts')
        })
      ],
      resolve: {
        alias: {
          '@shared': resolve('src/main/agent/shared'),
          '@core': resolve('src/main/agent/core'),
          '@services': resolve('src/main/agent/services'),
          '@integrations': resolve('src/main/agent/integrations'),
          '@utils': resolve('src/main/agent/utils'),
          '@api': resolve('src/main/agent/api'),
          '@logging': resolve('src/main/services/logging')
        }
      },
      define: {
        'process.env.APP_EDITION': JSON.stringify(edition),
        'process.env.LOG_LEVEL': JSON.stringify(resolvedMode.startsWith('development') ? 'debug' : 'info')
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
            target: proxyTarget,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, '')
          }
        }
      },
      optimizeDeps: {
        include: [
          'monaco-editor',
          'monaco-editor/esm/vs/editor/editor.all.js',
          'monaco-editor/esm/vs/basic-languages/shell/shell.contribution',
          'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution',
          'monaco-editor/esm/vs/basic-languages/python/python.contribution',
          'monaco-editor/esm/vs/basic-languages/go/go.contribution',
          'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
        ]
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
          imports: [
            {
              '@/utils/logger': ['createRendererLogger']
            }
          ],
          dts: resolve('src/renderer/auto-imports.d.ts'),
          resolvers: [AntDesignVueResolver()]
        })
      ],
      define: {
        __APP_INFO__: {
          version: pkg.version
        },
        // Inject edition config to renderer process (single source of truth)
        __EDITION_CONFIG__: JSON.stringify(editionConfig),
        'import.meta.env.RENDERER_APP_EDITION': JSON.stringify(edition)
      },
      css: {
        preprocessorOptions: {
          less: {
            javascriptEnabled: true
          }
        }
      }
    }
  }
})
