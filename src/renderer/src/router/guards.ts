import axios from 'axios'
import config from '@/config'
import { getUserInfo, removeToken } from '@/utils/permission'
import { dataSyncService } from '@/services/dataSyncService'

const logger = createRendererLogger('router')

// 独立 axios 实例，仅用于启动时 token 验证，不挂任何全局 401 跳转拦截器
const authCheckRequest = axios.create({ baseURL: config.api, timeout: 5000 })
authCheckRequest.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('ctm-token')
  if (token) cfg.headers['Authorization'] = `Bearer ${token}`
  return cfg
})

async function verifyTokenWithServer(): Promise<'ok' | 'unauthorized' | 'network_error'> {
  try {
    await authCheckRequest.get('/user/info')
    return 'ok'
  } catch (error: any) {
    if (error?.response?.status === 401) return 'unauthorized'
    return 'network_error'
  }
}

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
      logger.info('Database initialization result', { success: dbResult.success })

      if (dbResult.success) {
        if (to.path === '/') {
          next()
        } else {
          next('/')
        }
      } else {
        logger.error('Database initialization failed, redirecting to login page')
        localStorage.removeItem('login-skipped')
        localStorage.removeItem('ctm-token')
        localStorage.removeItem('jms-token')
        localStorage.removeItem('userInfo')
        next('/login')
      }
    } catch (error) {
      logger.error('Database initialization failed', { error: error })
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
          // Verify token against server before starting sync services.
          // Only redirect on explicit 401; network errors are ignored to allow offline use.
          const tokenStatus = await verifyTokenWithServer()
          if (tokenStatus === 'unauthorized') {
            logger.warn('Token expired on startup, redirecting to login')
            await dataSyncService.disableDataSync().catch((error) => {
              logger.error('Failed to disable data sync after token expiry', { error })
            })
            dataSyncService.reset()
            removeToken()
            next('/login')
            return
          }

          // After database initialization succeeds, asynchronously initialize data sync service (non-blocking UI display)
          dataSyncService.initialize().catch((error) => {
            logger.error('Data sync service initialization failed', { error: error })
          })
          next()
        } else {
          logger.error('Database initialization failed, redirecting to login page')
          next('/login')
        }
      } else {
        next('/login')
      }
    } catch (error) {
      logger.error('Processing failed', { error: error })

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
