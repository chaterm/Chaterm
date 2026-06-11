import axios from 'axios'
import config from '@/config'
import { getUserInfo, removeToken } from '@/utils/permission'
import { dataSyncService } from '@/services/dataSyncService'
import { mark, reportMarksToMainAsync } from '@/utils/perf'

const logger = createRendererLogger('router')
let aiModelWarmupScheduled = false

// 独立 axios 实例，仅用于启动时 token 验证，不挂任何全局 401 跳转拦截器
const authCheckRequest = axios.create({ baseURL: config.api, timeout: 5000 })
authCheckRequest.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('ctm-token')
  if (token) cfg.headers['Authorization'] = `Bearer ${token}`
  return cfg
})

function scheduleAiModelWarmup(): void {
  if (aiModelWarmupScheduled) {
    return
  }
  aiModelWarmupScheduled = true

  const runWarmup = () => {
    void import('@/views/components/AiTab/composables/useModelConfiguration')
      .then(({ useModelConfiguration }) => {
        void useModelConfiguration()
          .initModelOptions()
          .catch((error) => {
            logger.warn('Failed to warm up AI model options', { error })
          })
      })
      .catch((error) => {
        logger.warn('Failed to load AI model configuration warmup', { error })
      })
  }

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  }

  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(runWarmup, { timeout: 5_000 })
    return
  }

  window.setTimeout(runWarmup, 1_500)
}

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
  mark('chaterm/renderer/willRouteAuth')
  function finish(location?: any): void {
    mark('chaterm/renderer/didRouteAuth')
    void reportMarksToMainAsync()
    if (typeof location === 'undefined') {
      next()
      return
    }
    next(location)
  }

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
    finish()
    return
  }

  if (isSkippedLogin && token === 'guest_token') {
    try {
      const api = window.api as any
      mark('chaterm/renderer/willInitUserDatabase')
      const dbResult = await api.initUserDatabase({ uid: 999999999 })
      mark('chaterm/renderer/didInitUserDatabase')
      logger.info('Database initialization result', { success: dbResult.success })

      if (dbResult.success) {
        if (to.path === '/') {
          finish()
        } else {
          finish('/')
        }
      } else {
        logger.error('Database initialization failed, redirecting to login page')
        localStorage.removeItem('login-skipped')
        localStorage.removeItem('ctm-token')
        localStorage.removeItem('jms-token')
        localStorage.removeItem('userInfo')
        finish('/login')
      }
    } catch (error) {
      mark('chaterm/renderer/didFailInitUserDatabase')
      logger.error('Database initialization failed', { error: error })
      localStorage.removeItem('login-skipped')
      localStorage.removeItem('ctm-token')
      localStorage.removeItem('jms-token')
      localStorage.removeItem('userInfo')
      finish('/login')
    }
    return
  }

  if (token && !isSkippedLogin) {
    try {
      const userInfo = getUserInfo()
      if (userInfo && userInfo.uid) {
        const api = window.api as any
        mark('chaterm/renderer/willInitUserDatabase')
        const dbResult = await api.initUserDatabase({ uid: userInfo.uid })
        mark('chaterm/renderer/didInitUserDatabase')

        if (dbResult.success) {
          // Verify token against server before starting sync services.
          // Only redirect on explicit 401; network errors are ignored to allow offline use.
          mark('chaterm/renderer/willVerifyToken')
          const tokenStatus = await verifyTokenWithServer()
          mark('chaterm/renderer/didVerifyToken')
          if (tokenStatus === 'unauthorized') {
            logger.warn('Token expired on startup, redirecting to login')
            await dataSyncService.disableDataSync().catch((error) => {
              logger.error('Failed to disable data sync after token expiry', { error })
            })
            dataSyncService.reset()
            removeToken()
            finish('/login')
            return
          }

          // After database initialization succeeds, asynchronously initialize data sync service (non-blocking UI display)
          mark('chaterm/renderer/willScheduleDataSync')
          dataSyncService.initialize().catch((error) => {
            logger.error('Data sync service initialization failed', { error: error })
          })
          mark('chaterm/renderer/didScheduleDataSync')
          if (tokenStatus === 'ok') {
            scheduleAiModelWarmup()
          }
          finish()
        } else {
          logger.error('Database initialization failed, redirecting to login page')
          finish('/login')
        }
      } else {
        finish('/login')
      }
    } catch (error) {
      mark('chaterm/renderer/didFailRouteAuth')
      logger.error('Processing failed', { error: error })

      const message = error instanceof Error ? error.message : String(error)

      // In the development environment, bypass the relevant errors (usually caused by hot updates)
      if (isDev && (message.includes('nextSibling') || message.includes('getUserInfo'))) {
        finish()
        return
      }
      finish('/login')
    }
  } else {
    finish('/login')
  }
}

export const afterEach = () => {}
