import syncRequest from '@/utils/syncRequest'

const urls = {
  getUserTermConfig: '/sync/user-config',
  updateUserTermConfig: '/sync/user-config'
}

export function getUserTermConfig(params: { configType?: string }, options?: { signal?: AbortSignal }) {
  return syncRequest({
    method: 'get',
    url: urls.getUserTermConfig,
    params: params,
    signal: options?.signal
  })
}

export function updateUserTermConfig(
  data: {
    schemaVersion: number
    config: string
    configType?: string
  },
  options?: { signal?: AbortSignal }
) {
  return syncRequest({
    method: 'put',
    url: urls.updateUserTermConfig,
    data: data,
    signal: options?.signal
  })
}
