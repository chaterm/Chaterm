// router/index.ts
import { createRouter, createWebHashHistory } from 'vue-router'
import { AppRoutes } from '@/router/routes'
import { beforeEach, afterEach } from '@/router/guards'

// 创建路由实例
const AppRouter = createRouter({
  history: createWebHashHistory(), //哈希模式
  routes: AppRoutes,
  scrollBehavior: () => ({ left: 0, top: 0 })
})

// 添加错误处理
AppRouter.onError((error) => {
  console.error('路由错误:', error)
})

AppRouter.beforeEach(beforeEach)
AppRouter.afterEach(afterEach)

export default AppRouter
