import Home from '@/views/index.vue'

export const AppRoutes = [
  {
    path: '/',
    name: 'Home',
    meta: {
      requiresAuth: true
    },
    component: Home
  },
  {
    path: '/login',
    name: 'Login',
    meta: {
      requiresAuth: false
    },
    component: () => import('@/views/auth/login.vue')
  }
]
