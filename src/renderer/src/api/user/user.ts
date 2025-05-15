import request from '@/utils/request'

// import authRequest from '@/utils/authRequest'

interface ApiResponse<T> {
  code: number
  data: T
  Message?: string
}

type ApiResponsePromise<T> = Promise<ApiResponse<T>>

interface LoginResponse {
  token: string
  // 其他用户信息
}

const urls = {
  sayHello: '/user',
  userLogin: '/user/login-pwd',
  userLogOut: '/user/login-out',
  getUser: '/user/info',
  getUserTermConfig: '/user/term-config',
  updateUserTermConfig: '/user/term-config',
  userQuickCommand: '/user/quick-command',
  userQuickCommandInfo: '/user/quick-command/info',
  aliasUpdateTerm: '/term-api/alias/update',
  aliasRefreshTerm: '/term-api/alias/refresh',
  ssoToBearerToken: '/user/login-sso'
}

export function sayHello(params) {
  return request({
    method: 'get',
    url: urls.sayHello,
    params: params
  })
}
export function ssoBearerToken() {
  return request({
    method: 'get',
    url: urls.ssoToBearerToken
  })
}
export function userLogin(params): ApiResponsePromise<LoginResponse> {
  return request({
    method: 'post',
    url: urls.userLogin,
    data: params
  })
}

export function userLogOut() {
  return request({
    method: 'get',
    url: urls.userLogOut
  })
}

export function getUser(params) {
  return request({
    method: 'get',
    url: urls.getUser,
    params: params
  })
}

export function getUserTermConfig(params) {
  return request({
    method: 'get',
    url: urls.getUserTermConfig,
    params: params
  })
}

export function updateUserTermConfig(data) {
  return request({
    method: 'put',
    url: urls.updateUserTermConfig,
    data: data
  })
}

export function listUserQuickCommand(parameter) {
  return request({
    method: 'get',
    url: urls.userQuickCommand,
    params: parameter
  })
}

export function getUserQuickCommand(parameter) {
  return request({
    method: 'get',
    url: urls.userQuickCommand,
    params: parameter
  })
}

export function createUserQuickCommand(data) {
  return request({
    method: 'post',
    url: urls.userQuickCommand,
    data: data
  })
}

export function updateUserQuickCommand(data) {
  return request({
    method: 'put',
    url: urls.userQuickCommand,
    data: data
  })
}

export function deleteUserQuickCommand(params) {
  return request({
    method: 'delete',
    url: urls.userQuickCommand,
    params: params
  })
}

export function aliasUpdate(data) {
  return request({
    url: urls.aliasUpdateTerm,
    method: 'post',
    data: data
  })
}

export function aliasRefresh(data) {
  return request({
    method: 'post',
    url: urls.aliasRefreshTerm,
    data: data
  })
}
