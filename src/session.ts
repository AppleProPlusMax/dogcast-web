import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRoomStore } from '@/stores/room'
import { useWebrtcStore } from '@/stores/webrtc'

let routerRef: Router | null = null

export function installSession(router: Router) {
  routerRef = router
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
