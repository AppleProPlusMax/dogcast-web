import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'
import RoomView from '@/views/RoomView.vue'
import SettingsView from '@/views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/room' },
    { path: '/login', component: LoginView, meta: { public: true } },
    { path: '/register', component: RegisterView, meta: { public: true } },
    { path: '/room', component: RoomView },
    { path: '/settings', component: SettingsView },
  ],
})

let restoring: Promise<void> | null = null

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!restoring) restoring = auth.restoreSession()
  await restoring

  if (!to.meta.public && auth.status !== 'authenticated') {
    return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.meta.public && auth.status === 'authenticated') return { path: '/room' }
  return true
})
