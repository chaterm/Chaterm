import axios from 'axios'
import config from '@/config'
import { removeToken } from '@/utils/permission'
const request = axios.create({
  baseURL: config.api
})

// 添加请求拦截器
request.interceptors.request.use(
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
request.interceptors.response.use(
  (res) => {
    return res.data
  },
  function (error) {
    console.log(error,'error.response')
    const data = error.response.data
    if (error.response.status === 401 && !(data.result && data.result.isLogin)) {
      removeToken()
    }
    // 超出 2xx 范围的状态码都会触发该函数。
    // 对响应错误做点什么
    return Promise.reject(error)
  }
)

export default request
