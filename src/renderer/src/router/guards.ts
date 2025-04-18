// 全局前置导航守卫
export const beforeEach = async (to, _, next) => {
  const token = localStorage.getItem('ctm-token')
  if (to.path == '/login') {
    next()
  } else {
    if (token) {
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
