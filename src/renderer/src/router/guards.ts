import { getUserInfo } from '@/utils/permission'
import { dataSyncService } from '@/services/dataSyncService'

export const beforeEach = async (to, _from, next) => {
  const token = localStorage.getItem('ctm-token')
  const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
  const isDev = import.meta.env.MODE === 'development'
  if (to.path === '/login') {
    if (isSkippedLogin) {
      localStorage.removeItem('login-skipped')
      localStorage.removeItem('ctm-token')
      localStorage.removeItem('jms-token')
      localStorage.removeItem('userInfo')
    }
    next()
    return
  }

  if (isSkippedLogin && token === 'guest_token') {
    try {
      const api = window.api as any
      const dbResult = await api.initUserDatabase({ uid: 999999999 })
      console.log('Database initialization result:', dbResult)

      if (dbResult.success) {
        if (to.path === '/') {
          next()
        } else {
          next('/')
        }
      } else {
        console.error('Database initialization failed, redirecting to login page')
        localStorage.removeItem('login-skipped')
        localStorage.removeItem('ctm-token')
        localStorage.removeItem('jms-token')
        localStorage.removeItem('userInfo')
        next('/login')
      }
    } catch (error) {
      console.error('Database initialization failed:', error)
      localStorage.removeItem('login-skipped')
      localStorage.removeItem('ctm-token')
      localStorage.removeItem('jms-token')
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
          // After database initialization succeeds, asynchronously initialize data sync service (non-blocking UI display)
          dataSyncService.initialize().catch((error) => {
            console.error('Data sync service initialization failed:', error)
          })
          next()
        } else {
          console.error('Database initialization failed, redirecting to login page')
          next('/login')
        }
      } else {
        next('/login')
      }
    } catch (error) {
      console.error('Processing failed:', error)

      const message = error instanceof Error ? error.message : String(error)

      // In the development environment, bypass the relevant errors (usually caused by hot updates)
      if (isDev && (message.includes('nextSibling') || message.includes('getUserInfo'))) {
        next()
        return
      }
      next('/login')
    }
  } else {
    next('/login')
  }
}

export const afterEach = () => {}
