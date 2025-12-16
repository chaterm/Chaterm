import axios from 'axios'
import config from '@/config'
import { removeToken } from '@/utils/permission'

const request = axios.create({
  baseURL: config.api
})

// Add request interceptor
request.interceptors.request.use(
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
request.interceptors.response.use(
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
        removeToken()
        window.location.hash = '#/login'
      }
    }
    // Status codes outside the 2xx range will trigger this function
    // Handle response error
    return Promise.reject(error)
  }
)

export default request
