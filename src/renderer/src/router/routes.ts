import Home from '@/views/index.vue'
import Login from '@/views/auth/login.vue'

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
    component: Login
  }
]
