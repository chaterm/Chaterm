const config = {
  // Request URL
  api: import.meta.env.MODE == 'development' ? '/api' : import.meta.env.RENDERER_VUE_APP_API_BASEURL,
  // Internationalization
  LANG: [
    { name: '简体中文', value: 'zh-CN' },
    { name: '繁體中文', value: 'zh-TW' },
    { name: 'English', value: 'en-US' },
    { name: 'Deutsch', value: 'de-DE' },
    { name: 'Français', value: 'fr-FR' },
    { name: 'Italiano', value: 'it-IT' },
    { name: 'Português', value: 'pt-PT' },
    { name: 'Русский', value: 'ru-RU' },
    { name: '日本語', value: 'ja-JP' },
    { name: '한국어', value: 'ko-KR' }
  ]
}
export default config
