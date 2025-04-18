export const CtmTokenKey: string = 'Ctm-Token'
// 认证情况
export const isAuthenticated = async () => {
  // 认证逻辑
  return window.api
    .getCookie(CtmTokenKey)
    .then((res) => {
      console.log(res, '获取token')
      if (res && res.success) {
        return true
      }
      return false
    })
    .catch(() => {
      return false
    })
}
