import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'
import RoomView from '@/views/RoomView.vue'
import SettingsView from '@/views/SettingsView.vue'
import WatchView from '@/views/WatchView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/room' },
    { path: '/login', component: LoginView, meta: { public: true } },
    { path: '/register', component: RegisterView, meta: { public: true } },
    { path: '/room', component: RoomView },
    { path: '/watch/:code', component: WatchView, meta: { public: true, guest: true } },
    { path: '/settings', component: SettingsView },
  ],
})

let restoring: Promise<void> | null = null
let skipPublicRestoreUntil = 0

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const signedIn = auth.status === 'authenticated' && !!auth.accessToken
  const skipRestore = !signedIn && to.meta.public && Date.now() < skipPublicRestoreUntil
  if (!signedIn && !skipRestore) {
    if (!restoring) {
      restoring = auth.restoreSession().finally(() => {
        restoring = null
      })
    }
    await restoring
    if (auth.status === 'authenticated' && auth.accessToken) skipPublicRestoreUntil = 0
    else skipPublicRestoreUntil = Date.now() + 5_000
  }

  if (!to.meta.public && auth.status !== 'authenticated') {
    return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.meta.public && auth.status === 'authenticated' && !to.meta.guest) return { path: '/room' }
  return true
})
