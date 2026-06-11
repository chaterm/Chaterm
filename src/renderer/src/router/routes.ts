import { mark } from '@/utils/perf'
import Login from '@/views/auth/login.vue'

const Home = () => {
  mark('chaterm/renderer/willLoadHomeRoute')
  return import('@/views/index.vue').then((module) => {
    mark('chaterm/renderer/didLoadHomeRoute')
    return module
  })
}
const K8sView = () => import('@/views/k8s/index.vue')
const K8sTerminal = () => import('@/views/k8s/terminal/index.vue')

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
  },
  {
    path: '/k8s',
    name: 'K8s',
    meta: {
      requiresAuth: true
    },
    component: K8sView,
    children: [
      {
        path: '',
        name: 'K8sTerminal',
        component: K8sTerminal
      }
    ]
  }
]
