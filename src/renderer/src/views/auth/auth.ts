export const CtmTokenKey: string = 'Ctm-Token'
// Authentication status
export const isAuthenticated = async () => {
  const api = window.api as any
  // Authentication logic
  return api
    .getCookie(CtmTokenKey)
    .then((res) => {
      console.log(res, 'Get token')
      if (res && res.success) {
        return true
      }
      return false
    })
    .catch(() => {
      return false
    })
}
