const config = {
  //请求的地址
  api: import.meta.env.MODE == 'development' ? '/api' : import.meta.env.RENDERER_VUE_APP_API_BASEURL,
  //国际化
  LANG: [
    { name: '简体中文', value: 'zh-CN' },
    { name: 'English', value: 'en-US' }
  ]
}
export default config
