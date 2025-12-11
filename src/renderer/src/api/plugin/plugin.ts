import request from '@/utils/request'

const urls = {
  listPlugins: '/plugin/list',
  listPluginVersions: (pluginKey: string) => `/plugin/${pluginKey}/versions`,

  getPluginDownload: (pluginKey: string) => `/plugin/${pluginKey}/download`,

  getPluginIcon: (pluginKey: string) => `/plugin/${pluginKey}/icon`
}

export function listStorePlugins(params?: any) {
  return request({
    method: 'get',
    url: urls.listPlugins,
    params
  })
}

export function listPluginVersions(pluginKey: string) {
  return request({
    method: 'get',
    url: urls.listPluginVersions(pluginKey)
  })
}

export function getPluginDownload(pluginKey: string, version?: string) {
  return request({
    method: 'get',
    url: urls.getPluginDownload(pluginKey),
    params: version ? { version } : undefined,
    responseType: 'arraybuffer'
  })
}

export function getPluginIconUrl(pluginKey: string, version?: string): Promise<string> {
  return request({
    method: 'get',
    url: urls.getPluginIcon(pluginKey),
    params: {
      version
    },
    responseType: 'blob'
  }).then((res: any) => {
    const blob = res.data ?? res
    return URL.createObjectURL(blob)
  })
}
