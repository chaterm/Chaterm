import request from '@/utils/request'

const urls = {
  assetList: '/asset/routes',
  favorite: '/asset/favorite',
  workspace: '/asset/user-work-space',
  alias: '/asset/alias'
}
const termProxyApi = {
  TermFileContent: '/term-api/cmd/list'
}
export function getListCmd(params) {
  return request({
    method: 'get',
    url: `${termProxyApi.TermFileContent}?&uuid=${params}`
  })
}

export function getassetMenu(params) {
  return request({
    method: 'get',
    url: urls.assetList,
    params: params
  })
}

export function setUserfavorite(data) {
  return request({
    method: 'post',
    url: urls.favorite,
    data: data
  })
}

export function getUserWorkSpace() {
  return request({
    method: 'get',
    url: urls.workspace
  })
}

export function setAlias(data) {
  return request({
    method: 'post',
    url: urls.alias,
    data: data
  })
}
