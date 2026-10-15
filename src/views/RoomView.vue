<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AudioShareHint from '@/components/AudioShareHint.vue'
import BrandMark from '@/components/BrandMark.vue'
import MemberList from '@/components/MemberList.vue'
import ShareControls from '@/components/ShareControls.vue'
import VideoStage from '@/components/VideoStage.vue'
import { signalingState } from '@/api/ws'
import { useAuthStore } from '@/stores/auth'
import { useRoomStore } from '@/stores/room'
import { useUiStore } from '@/stores/ui'
import { useWebrtcStore } from '@/stores/webrtc'
import { signOut } from '@/session'
import { captureBlockReason, detectCapability, isPhone, localhostShareUrl } from '@/utils/browser-capability'

const auth = useAuthStore()
const room = useRoomStore()
const rtc = useWebrtcStore()
const ui = useUiStore()
const capability = detectCapability()
const phone = isPhone()
const shareBlock = captureBlockReason()
const localhostUrl = localhostShareUrl()
const hintOpen = ref(false)
const stage = ref<{ toggleFullscreen: () => void } | null>(null)
const signingOut = ref(false)

const viewerConnIds = computed(() => room.viewers.map((item) => item.connId))
const someoneElse = computed(
  () => room.share.status === 'someone_sharing' && room.share.publisherConnId !== room.connId,
)
const publisherName = computed(() => {
  const userId = room.share.publisherUserId
  return (
    room.share.displayName ||
    room.membersOnline.find((member) => member.userId === userId)?.displayName ||
    '成员'
  )
})
const stageTitle = computed(() => {
  if (rtc.role === 'publishing') return '正在分享'
  if (rtc.role === 'viewing') return `${publisherName.value} 的画面`
  if (someoneElse.value) return `${publisherName.value} 正在分享`
  return '房间空闲'
})
const stageNote = computed(() => {
  if (rtc.role === 'publishing') return rtc.hasAudioTrack ? '本地预览 · 含音频' : '本地预览 · 无音频'
  if (rtc.role === 'viewing') return rtc.remoteHasAudio ? '含音频' : '对方没有音频'
  if (!room.joined) return '正在进入房间'
  return '还没有人分享。开始后，最多 4 个人可以同时看。'
})
const activeStream = computed(() => (rtc.role === 'publishing' ? rtc.localStream : rtc.remoteStream))
const previewMuted = computed(() => rtc.role === 'publishing' || ui.remoteMuted)
const volumePercent = computed({
  get: () => Math.round(ui.remoteVolume * 100),
  set: (value: number) => {
    ui.remoteVolume = value / 100
  },
})
const linkText = computed(() => {
  if (signalingState.value === 'connecting') return '正在连接'
  if (signalingState.value === 'reconnecting') return '正在重连'
  if (signalingState.value === 'open') return rtc.linkLabel
  return '未连接'
})
const canStart = computed(
  () => room.joined && signalingState.value === 'open' && !someoneElse.value && !rtc.busy,
)
const canKick = computed(
  () => auth.user?.role === 'admin' && someoneElse.value && signalingState.value === 'open',
)
const showPlayer = computed(() => rtc.role === 'viewing' || (someoneElse.value && rtc.role !== 'publishing'))
const playerDetail = computed(() => {
  const audio = rtc.remoteStream ? (rtc.remoteHasAudio ? '有声音' : '没有声音') : '等待画面'
  return `${audio} · ${linkText.value}`
})
const showNoAudio = computed(
  () =>
    (rtc.role === 'publishing' && !rtc.hasAudioTrack) ||
    (rtc.role === 'viewing' && !rtc.remoteHasAudio && Boolean(rtc.remoteStream)),
)

function requestShare() {
  if (ui.showAudioShareHint) hintOpen.value = true
  else void rtc.startPublish()
}

function confirmHint(dontShowAgain: boolean) {
  if (dontShowAgain) ui.showAudioShareHint = false
  hintOpen.value = false
  void rtc.startPublish()
}

async function logout() {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await signOut()
  } finally {
    signingOut.value = false
  }
}
</script>

<template>
  <div class="room">
    <header class="topbar">
      <RouterLink class="brand" to="/room">
        <BrandMark />
        <span>Dogcast</span>
      </RouterLink>
      <div class="top-meta">
        <strong>{{ room.room?.name ?? '房间' }}</strong>
        <span class="status-dot" :data-state="signalingState">{{ linkText }}</span>
      </div>
      <nav class="top-actions">
        <RouterLink to="/settings">设置</RouterLink>
        <button class="text-btn" type="button" :disabled="signingOut" @click="logout">退出</button>
      </nav>
    </header>

    <div class="room-body">
      <section class="stage" :class="{ 'as-player': showPlayer }">
        <div v-if="!showPlayer" class="stage-copy">
          <p class="eyebrow">{{ room.viewerCount }}/{{ room.room?.maxViewers ?? 4 }} 人在看</p>
          <h1>{{ stageTitle }}</h1>
          <p>{{ stageNote }}</p>
        </div>
        <p v-if="!capability.secure" class="banner warn">当前页面不是安全上下文，浏览器不会允许分享屏幕。</p>
        <p v-else-if="showNoAudio && !showPlayer" class="banner warn">
          当前分享没有音频。可以停止后重试，并在浏览器窗口里勾选分享音频。
        </p>
        <p v-if="rtc.captureSurface === 'window' || rtc.captureSurface === 'browser'" class="banner warn">
          当前分享的是窗口。Windows 上这样采集经常是黑屏，手机也会一起黑。请停止后改选「整个屏幕」。
        </p>
        <VideoStage
          v-if="showPlayer"
          ref="stage"
          player
          :stream="rtc.remoteStream"
          :muted="ui.remoteMuted"
          :volume="ui.remoteVolume"
          :title="stageTitle"
          :detail="playerDetail"
          :bitrate="rtc.bitrateLabel"
          :waiting="rtc.role === 'viewing'"
          @update:muted="ui.remoteMuted = $event"
          @update:volume="ui.remoteVolume = $event"
          @watch="rtc.watchShare()"
        />
        <VideoStage
          v-else-if="activeStream"
          ref="stage"
          :stream="activeStream"
          :muted="previewMuted"
          :volume="ui.remoteVolume"
        />
        <div v-else class="stage-empty">
          <p v-if="room.error">{{ room.error }}</p>
          <button v-if="room.error" class="btn" type="button" @click="room.joinDefault()">重试</button>
          <p v-else-if="!room.joined">正在连接房间…</p>
          <p v-else-if="rtc.role === 'viewing'">正在等待画面…</p>
          <p v-else>等一个人把屏幕共享出来。</p>
        </div>
      </section>

      <aside class="sidebar">
        <div class="side-block">
          <div class="side-head">
            <h2>在线</h2>
            <span>{{ room.membersOnline.length }}</span>
          </div>
          <MemberList
            :members="room.membersOnline"
            :self-conn-id="room.connId"
            :publisher-conn-id="room.share.publisherConnId"
            :viewer-conn-ids="viewerConnIds"
          />
        </div>
        <div class="side-block quiet">
          <h2>这台浏览器</h2>
          <p>{{ capability.summary }}</p>
          <p>{{ capability.audioAdvice }}</p>
        </div>
      </aside>
    </div>

    <footer class="dock">
      <ShareControls
        :sharing="rtc.role === 'publishing'"
        :busy="rtc.busy"
        :can-start="canStart"
        :can-kick="canKick"
        :can-share="!phone"
        @start="requestShare"
        @stop="rtc.stopPublish()"
        @kick="rtc.kickShare()"
        @switch-source="rtc.switchSource()"
      />
      <p v-if="shareBlock && !phone" class="hint">
        {{ shareBlock }}
        <a :href="localhostUrl">打开 localhost</a>
      </p>
      <button
        v-if="someoneElse && rtc.role !== 'viewing' && !showPlayer"
        class="btn"
        type="button"
        :disabled="rtc.busy"
        @click="rtc.watchShare()"
      >
        观看
      </button>
      <label v-if="!showPlayer" class="volume" :class="{ off: rtc.role !== 'viewing' }">
        <input v-model="ui.remoteMuted" type="checkbox" :disabled="rtc.role !== 'viewing'" />
        <span>{{ ui.remoteMuted ? '已静音' : '声音' }}</span>
        <input
          v-model.number="volumePercent"
          type="range"
          min="0"
          max="100"
          step="1"
          :disabled="rtc.role !== 'viewing'"
        />
      </label>
      <button v-if="!showPlayer" class="btn ghost" type="button" :disabled="!activeStream" @click="stage?.toggleFullscreen()">全屏</button>
      <button v-if="rtc.iceFailed" class="btn ghost" type="button" @click="rtc.askRenegotiate()">重新连接</button>
      <span v-if="!showPlayer" class="meter">{{ rtc.bitrateLabel }}</span>
    </footer>

    <AudioShareHint :open="hintOpen" @confirm="confirmHint" @cancel="hintOpen = false" />
  </div>
</template>
