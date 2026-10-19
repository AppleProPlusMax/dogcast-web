<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import VideoStage from '@/components/VideoStage.vue'
import { ApiError } from '@/api/errors'
import { api, setTokenOverride } from '@/api/http'
import { useRoomStore } from '@/stores/room'
import { useUiStore } from '@/stores/ui'
import { useWebrtcStore } from '@/stores/webrtc'

const route = useRoute()
const room = useRoomStore()
const rtc = useWebrtcStore()
const ui = useUiStore()
const error = ref('')

onMounted(async () => {
  const code = String(route.params.code ?? '')
  try {
    const data = await api<{ accessToken: string; room: { name: string } }>(`/api/watch/${encodeURIComponent(code)}`, {
      auth: false,
    })
    setTokenOverride(() => data.accessToken)
    rtc.shutdown()
    await room.joinGuest(data.accessToken)
    rtc.attach()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '这个观看链接打不开'
  }
})

onBeforeUnmount(() => {
  setTokenOverride(null)
  rtc.shutdown()
  room.leave()
})
</script>

<template>
  <div class="room watch">
    <header class="topbar">
      <RouterLink class="brand" to="/">
        <BrandMark />
        <span>Dogcast</span>
      </RouterLink>
      <div class="top-meta">
        <strong>{{ room.room?.name ?? '观看' }}</strong>
      </div>
    </header>
    <main class="room-main">
      <section class="stage as-player">
        <p v-if="error" class="banner warn">{{ error }}</p>
        <div v-else class="screen-fit">
          <div class="screen">
        <VideoStage
          player
          :stream="rtc.remoteStream"
          :muted="ui.remoteMuted"
          :volume="ui.remoteVolume"
          :title="room.share.displayName || '画面'"
          :detail="rtc.role === 'viewing' ? '正在观看' : '等待分享'"
          :bitrate="rtc.bitrateLabel"
          :waiting="rtc.role === 'viewing'"
          @update:muted="ui.remoteMuted = $event"
          @update:volume="ui.remoteVolume = $event"
          @watch="rtc.watchShare()"
        />
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
