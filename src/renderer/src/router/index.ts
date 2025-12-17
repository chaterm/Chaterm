// router/index.ts
import { createRouter, createWebHashHistory } from 'vue-router'
import { AppRoutes } from '@/router/routes'
import { beforeEach, afterEach } from '@/router/guards'

// Create router instance
const AppRouter = createRouter({
  history: createWebHashHistory(), // Hash mode
  routes: AppRoutes,
  scrollBehavior: () => ({ left: 0, top: 0 })
})

// Add error handling
AppRouter.onError((error) => {
  console.error('Router error:', error)
})

AppRouter.beforeEach(beforeEach)
AppRouter.afterEach(afterEach)

export default AppRouter
