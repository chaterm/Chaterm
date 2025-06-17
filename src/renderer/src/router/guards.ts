import { getUserInfo } from '@/utils/permission'

// 全局前置导航守卫
export const beforeEach = async (to, _, next) => {
  const token = localStorage.getItem('ctm-token')
  if (to.path == '/login') {
    next()
  } else {
    if (token) {
      try {
        const userInfo = getUserInfo()
        if (userInfo && userInfo.uid) {
          const api = window.api as any
          await api.initUserDatabase({ uid: userInfo.uid })
        }
      } catch (error) {
        console.error('数据库初始化失败:', error)
      }
      next()
    } else {
      next('/login')
    }
  }
}

// 全局后置钩子
export const afterEach = () => {
  // console.log(to, from)
  // 可以用于统计、日志等
  // console.log('Navigation completed')
}
