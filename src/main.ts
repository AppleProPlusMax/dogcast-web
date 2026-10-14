import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { router } from '@/router'
import { installSession } from '@/session'
import { useAuthStore } from '@/stores/auth'
import { useRoomStore } from '@/stores/room'
import { useWebrtcStore } from '@/stores/webrtc'
import '@/styles.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
installSession(router)

const auth = useAuthStore()
watch(
  () => auth.status,
  (status, previous) => {
    if (previous !== 'authenticated' || status !== 'idle') return
    useWebrtcStore().shutdown()
    useRoomStore().leave()
    if (!router.currentRoute.value.meta.public) void router.push('/login')
  },
)

app.mount('#app')
