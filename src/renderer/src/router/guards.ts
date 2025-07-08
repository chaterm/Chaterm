import { getUserInfo } from '@/utils/permission'

export const beforeEach = async (to, from, next) => {
  const token = localStorage.getItem('ctm-token')
  const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'

  if (to.path === '/login') {
    if (isSkippedLogin) {
      localStorage.removeItem('login-skipped')
      localStorage.removeItem('ctm-token')
      localStorage.removeItem('userInfo')
    }
    next()
    return
  }

  if (isSkippedLogin && token === 'guest_token') {
    try {
      const api = window.api as any
      const dbResult = await api.initUserDatabase({ uid: 999999999 })
      console.log('数据库初始化结果:', dbResult)

      if (dbResult.success) {
        if (to.path === '/') {
          next()
        } else {
          next('/')
        }
      } else {
        console.error('数据库初始化失败，重定向到登录页')
        localStorage.removeItem('login-skipped')
        localStorage.removeItem('ctm-token')
        localStorage.removeItem('userInfo')
        next('/login')
      }
    } catch (error) {
      console.error('数据库初始化失败:', error)
      localStorage.removeItem('login-skipped')
      localStorage.removeItem('ctm-token')
      localStorage.removeItem('userInfo')
      next('/login')
    }
    return
  }

  if (token && !isSkippedLogin) {
    try {
      const userInfo = getUserInfo()
      if (userInfo && userInfo.uid) {
        const api = window.api as any
        const dbResult = await api.initUserDatabase({ uid: userInfo.uid })

        if (dbResult.success) {
          next()
        } else {
          console.error('数据库初始化失败，重定向到登录页')
          next('/login')
        }
      } else {
        next('/login')
      }
    } catch (error) {
      console.error('处理失败:', error)
      next('/login')
    }
  } else {
    next('/login')
  }
}

export const afterEach = () => {}
