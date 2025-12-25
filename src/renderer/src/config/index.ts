const config = {
  // Request URL
  api: import.meta.env.MODE == 'development' ? '/api' : import.meta.env.RENDERER_VUE_APP_API_BASEURL,
  // Internationalization
  LANG: [
    { name: '简体中文', value: 'zh-CN' },
    { name: 'English', value: 'en-US' },
    { name: '日本語', value: 'ja-JP' },
    { name: '한국어', value: 'ko-KR' }
  ]
}
export default config
