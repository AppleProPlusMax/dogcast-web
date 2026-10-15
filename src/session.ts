import { watch } from 'vue'
import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRoomStore } from '@/stores/room'
import { useWebrtcStore } from '@/stores/webrtc'

let routerRef: Router | null = null
let dropping = false

export function installSession(router: Router) {
  routerRef = router
  const auth = useAuthStore()
  watch(
    () => auth.status,
    (status, previous) => {
      if (status !== 'idle' || previous !== 'authenticated') return
      const current = router.currentRoute.value
      if (current.meta.public) return
      if (dropping) return
      dropping = true
      useWebrtcStore().shutdown()
      useRoomStore().leave()
      const reason = sessionStorage.getItem('dogcast.replaced') === '1' ? 'replaced' : ''
      void router.push(reason ? { path: '/login', query: { reason } } : '/login').finally(() => {
        dropping = false
      })
    },
  )
  router.afterEach((to) => {
    if (to.meta.public) return
    const auth = useAuthStore()
    if (auth.status !== 'authenticated') return
    const room = useRoomStore()
    const rtc = useWebrtcStore()
    room.bind()
    rtc.attach()
    void room.joinDefault()
  })
}

export async function signOut() {
  const rtc = useWebrtcStore()
  const room = useRoomStore()
  const auth = useAuthStore()
  rtc.shutdown()
  room.leave()
  await auth.logout()
  await routerRef?.push('/login')
}
