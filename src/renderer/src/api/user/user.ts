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
  // Other user information
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
  ssoToBearerToken: '/user/login-sso',
  sendEmailCode: '/user/login-email/send-code',
  emailLogin: '/user/login-email',
  sendMobileCode: '/user/login-mobile/send-code',
  mobileLogin: '/user/login-mobile',
  updateUser: '/user/info',
  changePassword: '/user/password',
  checkUserDevice: '/user/check-device',
  sendEmailBindCode: '/user/bind-email/send-code',
  verifyAndBindEmail: '/user/bind-email/verify',
  sendMobileBindCode: '/user/bind-mobile/send-code',
  verifyAndBindMobile: '/user/bind-mobile/verify',
  updateAvatar: '/user/avatar/update',
  getTrustedDevices: '/user/trusted-devices',
  revokeTrustedDevice: '/user/trusted-devices/revoke'
}
export function sendEmailCode(params) {
  return request({
    method: 'post',
    url: urls.sendEmailCode,
    data: params
  })
}

export function emailLogin(params) {
  return request({
    method: 'post',
    url: urls.emailLogin,
    data: params
  })
}

export function sendMobileCode(params) {
  return request({
    method: 'post',
    url: urls.sendMobileCode,
    data: params
  })
}

export function mobileLogin(params) {
  return request({
    method: 'post',
    url: urls.mobileLogin,
    data: params
  })
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

export function updateUser(data) {
  return request({
    method: 'post',
    url: urls.updateUser,
    data: data
  })
}

export function changePassword(data) {
  return request({
    method: 'post',
    url: urls.changePassword,
    data: data
  })
}

export function checkUserDevice(data) {
  return request({
    method: 'post',
    url: urls.checkUserDevice,
    data: data
  })
}

export function sendEmailBindCode(params) {
  return request({
    method: 'post',
    url: urls.sendEmailBindCode,
    data: params
  })
}

export function verifyAndBindEmail(params) {
  return request({
    method: 'post',
    url: urls.verifyAndBindEmail,
    data: params
  })
}

export function sendMobileBindCode(params) {
  return request({
    method: 'post',
    url: urls.sendMobileBindCode,
    data: params
  })
}

export function verifyAndBindMobile(params) {
  return request({
    method: 'post',
    url: urls.verifyAndBindMobile,
    data: params
  })
}

export function updateAvatar(params) {
  return request({
    method: 'post',
    url: urls.updateAvatar,
    data: params
  })
}

// GET /user/trusted-devices - list trusted devices (requires auth)
export function getTrustedDevices() {
  return request({
    method: 'get',
    url: urls.getTrustedDevices
  })
}

// POST /user/trusted-devices/revoke - revoke a trusted device (requires auth)
export function revokeTrustedDevice(deviceId: number) {
  return request({
    method: 'post',
    url: urls.revokeTrustedDevice,
    data: { deviceId }
  })
}
