import request from '@/utils/request'

const urls = {
  listPlugins: '/plugin/list',
  listPluginVersions: (pluginKey: string) => `/plugin/${pluginKey}/versions`,

  getPluginDownloadInfo: (pluginKey: string) => `/plugin/${pluginKey}/download-info`,

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

export function listPluginVersions(pluginKey: string, platform?: string) {
  return request({
    method: 'get',
    url: urls.listPluginVersions(pluginKey),
    params: {
      platform
    }
  })
}

export function getPluginDownload(pluginKey: string, version?: string, platform?: string) {
  return request({
    method: 'get',
    url: urls.getPluginDownload(pluginKey),
    params: {
      version,
      platform
    },
    responseType: 'arraybuffer'
  })
}

export function getPluginDownloadInfo(pluginKey: string, version?: string, platform?: string, region?: string) {
  return request({
    method: 'get',
    url: urls.getPluginDownloadInfo(pluginKey),
    params: {
      version,
      platform,
      region
    }
  })
}

export function downloadPluginPackage(downloadUrl: string) {
  if (/^https?:\/\//i.test(downloadUrl)) {
    return (window as any).api.downloadPluginPackage(downloadUrl)
  }

  return request({
    method: 'get',
    url: downloadUrl,
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
