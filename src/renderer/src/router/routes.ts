const Home = () => import('@/views/index.vue')
import Login from '@/views/auth/login.vue'

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
