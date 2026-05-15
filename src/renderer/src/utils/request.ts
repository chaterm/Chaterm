import axios, { type AxiosInstance } from 'axios'
import config from '@/config'
import { notifyTokenExpired } from '@/utils/authEvents'

function attachAuthInterceptors(instance: AxiosInstance): AxiosInstance {
  // Add request interceptor
  instance.interceptors.request.use(
    async function (config) {
      const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
      if (isSkippedLogin) {
        config.headers['Authorization'] = `Bearer guest_token`
      } else {
        const BearerToken = localStorage.getItem('ctm-token')
        config.headers['Authorization'] = `Bearer ${BearerToken}`
      }
      return config
    },
    function (error) {
      // Handle request error
      return Promise.reject(error)
    }
  )

  // Add response interceptor
  instance.interceptors.response.use(
    (res) => {
      return res.data
    },
    function (error) {
      const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'

      if (isSkippedLogin && error.response?.status === 401) {
        return Promise.resolve({ data: {} })
      }
      if (error.response?.status === 401) {
        const data = error.response.data
        if (!(data.result && data.result.isLogin)) {
          notifyTokenExpired()
        }
      }
      // Status codes outside the 2xx range will trigger this function
      // Handle response error
      return Promise.reject(error)
    }
  )

  return instance
}

export function createAuthedRequest(baseURL: string): AxiosInstance {
  const instance = axios.create({ baseURL })
  return attachAuthInterceptors(instance)
}

const request = createAuthedRequest(config.api)

export default request
