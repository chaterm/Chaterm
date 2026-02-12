import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import prettierConfig from '@vue/eslint-config-prettier'
import electronToolkitConfig from '@electron-toolkit/eslint-config'
import electronToolkitTs from '@electron-toolkit/eslint-config-ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname
})

export default [
  js.configs.recommended,
  electronToolkitConfig,
  ...electronToolkitTs.configs.recommended,
  ...compat.extends('plugin:prettier/recommended'),
  ...defineConfigWithVueTs(pluginVue.configs['flat/recommended'], vueTsConfigs.recommended),
  prettierConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Disable any type warnings
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/ban-ts-comment': 'off', // Disable checking for @ts-ignore etc. comments
      '@typescript-eslint/no-unused-vars': 'off', // Disable unused variables warnings
      'no-case-declarations': 'off', // Allow let and const declarations in case statements
      'no-control-regex': 'off', // Allow control characters in regular expressions
      'no-empty': 'off', // Allow empty code blocks
      '@typescript-eslint/no-var-requires': 'off', // Allow using require statements
      '@typescript-eslint/no-require-imports': 'off', // Allow using require() style imports
      '@typescript-eslint/explicit-function-return-type': 'off', // Allow functions without explicit return types
      'no-ex-assign': 'off', // Allow modifying exception parameters
      'no-useless-escape': 'off', // Allow unnecessary escape characters
      'prefer-const': 'off', // Allow using let declarations that are not re-assigned
      '@typescript-eslint/no-namespace': 'off', // Allow using namespace keyword
      'no-fallthrough': 'off', // Allow switch case statements to fall through
      '@typescript-eslint/no-unused-expressions': 'off', // Disable unused expressions warnings
      'vue/valid-v-for': 'off', // Disable v-for key warnings
      'vue/no-v-html': 'off', // Disable v-html warnings
      'no-console': 'error' // Error on console.* usage - use createLogger() instead
    }
  },
  // Whitelist files that legitimately need console access
  {
    files: [
      'src/main/services/logging/index.ts',
      'src/main/services/logging/mainVendorConsoleCapture.ts',
      'src/main/services/logging/retention.ts',
      'src/main/storage/db/early-migration.ts'
    ],
    rules: {
      'no-console': 'off'
    }
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      '.gitignore',
      '**/*.cjs', // Ignore CommonJS files that use require()
      'scripts/**', // Ignore script files that use CommonJS
      'coverage/**',
      'build/**',
      '**/auto-imports.d.ts', // Ignore auto-generated files from unplugin-auto-import
      '**/components.d.ts' // Ignore auto-generated files from unplugin-vue-components
    ]
  }
]
