import axios from 'axios'
import config from '@/config'
import { removeToken } from '@/utils/permission'

const request = axios.create({
  baseURL: config.api
})

// 添加请求拦截器
request.interceptors.request.use(
  async function (config) {
    const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
    if (isSkippedLogin) {
      // 跳过登录的用户使用特殊的访客token
      config.headers['Authorization'] = `Bearer guest_token`
    } else {
      const BearerToken = localStorage.getItem('ctm-token')
      config.headers['Authorization'] = `Bearer ${BearerToken}`
    }
    return config
  },
  function (error) {
    // 对请求错误做些什么
    return Promise.reject(error)
  }
)

// 添加响应拦截器
request.interceptors.response.use(
  (res) => {
    return res.data
  },
  function (error) {
    const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'

    // 如果是跳过登录的用户，对于401错误返回空数据
    if (isSkippedLogin && error.response?.status === 401) {
      return Promise.resolve({ data: {} })
    }

    console.log(error, 'error.response')
    if (error.response?.status === 401) {
      const data = error.response.data
      if (!(data.result && data.result.isLogin)) {
        removeToken()
        window.location.hash = '#/login'
      }
    }
    // 超出 2xx 范围的状态码都会触发该函数。
    // 对响应错误做点什么
    return Promise.reject(error)
  }
)

export default request
