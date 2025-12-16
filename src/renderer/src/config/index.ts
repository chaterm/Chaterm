const config = {
  // Request URL
  api: import.meta.env.MODE == 'development' ? '/api' : import.meta.env.RENDERER_VUE_APP_API_BASEURL,
  // Internationalization
  LANG: [
    { name: '简体中文', value: 'zh-CN' },
    { name: 'English', value: 'en-US' }
  ]
}
export default config
