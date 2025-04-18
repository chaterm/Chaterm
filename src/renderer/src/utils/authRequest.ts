import axios from 'axios'
import config from '@/config'
import { removeToken } from '@/utils/permission'
const authRequest = axios.create({
  baseURL: config.api
})
// 添加请求拦截器
authRequest.interceptors.request.use(
  async function (config) {
    const BearerToken = localStorage.getItem('ctm-token')
    config.headers['Authorization'] = `Bearer ${BearerToken}`
    return config
  },
  function (error) {
    // 对请求错误做些什么
    return Promise.reject(error)
  }
)

// 添加响应拦截器
authRequest.interceptors.response.use(
  (res) => {
    return res.data
  },
  function (error) {
    const data = error.response.data
    if (error.response.status === 401 && !(data.result && data.result.isLogin)) {
      removeToken()
    }
    return Promise.reject(error)
  }
)

export default authRequest
