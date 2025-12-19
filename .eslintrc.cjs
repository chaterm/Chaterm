/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution')

module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    '@electron-toolkit',
    '@electron-toolkit/eslint-config-ts/eslint-recommended',
    '@vue/eslint-config-typescript/recommended',
    'plugin:prettier/recommended',
    '@vue/eslint-config-prettier'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn', // Show warning during development
    'vue/require-default-prop': 'off',
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/ban-ts-comment': 'off', // Disable checking for @ts-ignore etc. comments
    '@typescript-eslint/no-unused-vars': 'warn', // Show warning for unused variables
    'no-case-declarations': 'off', // Allow let and const declarations in case statements
    'no-control-regex': 'off', // Allow control characters in regular expressions
    'no-empty': 'off', // Allow empty code blocks
    '@typescript-eslint/no-var-requires': 'off', // Allow using require statements
    'no-ex-assign': 'off', // Allow modifying exception parameters
    'no-useless-escape': 'off', // Allow unnecessary escape characters
    'prefer-const': 'off', // Allow using let declarations that are not re-assigned
    '@typescript-eslint/no-namespace': 'off', // Allow using namespace keyword
    'no-fallthrough': 'off' // Allow switch case statements to fall through
  }
}
