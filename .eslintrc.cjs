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
    '@typescript-eslint/no-explicit-any': 'warn', // 开发阶段显示警告
    'vue/require-default-prop': 'off',
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/ban-ts-comment': 'off', // 禁用 @ts-ignore 等注释的检查
    '@typescript-eslint/no-unused-vars': 'warn', // 未使用的变量显示警告
    'no-case-declarations': 'off', // 允许在 case 语句块中使用 let 和 const 声明
    'no-control-regex': 'off', // 允许在正则表达式中使用控制字符
    'no-empty': 'off', // 允许空代码块
    '@typescript-eslint/no-var-requires': 'off', // 允许使用 require 语句
    'no-ex-assign': 'off', // 允许修改异常参数
    'no-useless-escape': 'off', // 允许不必要的转义字符
    'prefer-const': 'off', // 允许使用 let 声明不会被重新赋值的变量
    '@typescript-eslint/no-namespace': 'off' // 允许使用 namespace 关键字
  }
}
