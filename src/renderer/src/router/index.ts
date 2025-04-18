// router/index.ts
import { createRouter, createWebHashHistory } from 'vue-router'
import { AppRoutes } from '@/router/routes'
import { beforeEach, afterEach } from '@/router/guards'

// 创建路由实例
const AppRouter = createRouter({
  history: createWebHashHistory(), //哈希模式
  routes: AppRoutes
})

AppRouter.beforeEach(beforeEach)
AppRouter.afterEach(afterEach)

export default AppRouter
