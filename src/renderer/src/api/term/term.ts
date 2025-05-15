import request from '@/utils/request'
import { CommonResponse, TermPostData, TermQueryParams } from './define'

const termProxyApi = {
  TermFileContent: '/term-api/file-content',
  TermFileContentSave: '/term-api/file-content/save',
  TermFileLs: '/term-api/file-ls',
  TermFileRename: '/term-api/file-rename',
  TermCmdList: '/term-api/cmd/list',
  AliasUpdate: '/term-api/alias/update',
  AliasRefresh: '/term-api/alias/refresh',
  GetUserSessionList: '/term-api/session/list'
}

export function termFileContent(parameter: TermQueryParams): Promise<CommonResponse> {
  return request({
    url: termProxyApi.TermFileContent,
    method: 'get',
    params: parameter
  })
}

export function termFileContentSave(data: TermPostData): Promise<CommonResponse> {
  return request({
    url: termProxyApi.TermFileContentSave,
    method: 'post',
    data: data
  })
}
export function termFileLs(parameter: TermQueryParams): Promise<CommonResponse> {
  return request({
    url: termProxyApi.TermFileLs,
    method: 'get',
    params: parameter
  })
}
export function getUserSessionList(data: TermPostData): Promise<CommonResponse> {
  return request({
    method: 'post',
    url: termProxyApi.GetUserSessionList,
    data: data
  })
}
