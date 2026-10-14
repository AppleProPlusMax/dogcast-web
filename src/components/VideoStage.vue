<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  stream: MediaStream | null
  muted: boolean
  volume: number
  player?: boolean
  title?: string
  detail?: string
  bitrate?: string
  waiting?: boolean
}>()

const emit = defineEmits<{
  'update:muted': [value: boolean]
  'update:volume': [value: number]
  watch: []
}>()

const video = ref<HTMLVideoElement | null>(null)
const frame = ref<HTMLElement | null>(null)
let unmuteTrack: MediaStreamTrack | null = null
let applying = false

function detachUnmute() {
  unmuteTrack?.removeEventListener('unmute', onTrackUnmute)
  unmuteTrack = null
}

function onTrackUnmute() {
  void tryPlay()
}

function applyElementState() {
  const element = video.value
  if (!element) return
  applying = true
  element.muted = props.muted
  if (!props.muted) element.volume = props.volume
  queueMicrotask(() => {
    applying = false
  })
}

function onMediaVolume() {
  const element = video.value
  if (!element || applying) return
  emit('update:muted', element.muted)
  if (!element.muted) emit('update:volume', element.volume)
}

async function tryPlay(force = false) {
  const element = video.value
  if (!element) return
  const keepPaused = !force && element.srcObject === props.stream && element.paused && Boolean(props.stream)
  element.srcObject = props.stream
  applyElementState()
  detachUnmute()
  const track = props.stream?.getVideoTracks()[0]
  if (track?.muted) {
    unmuteTrack = track
    track.addEventListener('unmute', onTrackUnmute)
  }
  if (!props.stream || keepPaused) return
  try {
    await element.play()
  } catch {
    // 自动播放被拦住时，用播放器上的播放键由用户手势开始。
  }
}

function toggleFullscreen() {
  const element = frame.value
  if (!element) return
  if (document.fullscreenElement) void document.exitFullscreen()
  else void element.requestFullscreen()
}

watch(
  () => props.stream,
  () => {
    void tryPlay()
  },
  { flush: 'post' },
)

watch(
  () => [props.muted, props.volume] as const,
  () => {
    applyElementState()
  },
)

onMounted(() => {
  void tryPlay()
})

onBeforeUnmount(() => {
  detachUnmute()
  if (video.value) video.value.srcObject = null
})

defineExpose({ toggleFullscreen })
</script>

<template>
  <media-controller v-if="player && stream" ref="frame" class="stage-frame player">
    <video
      slot="media"
      ref="video"
      autoplay
      playsinline
      @volumechange="onMediaVolume"
    />
    <div slot="top-chrome" class="player-top">
      <strong>{{ title || '画面' }}</strong>
    </div>
    <media-play-button slot="centered-chrome" noautohide></media-play-button>
    <media-control-bar>
      <media-play-button></media-play-button>
      <media-mute-button></media-mute-button>
      <media-volume-range></media-volume-range>
      <media-live-button></media-live-button>
      <span class="player-meta">{{ detail }}</span>
      <span v-if="bitrate" class="player-meta">{{ bitrate }}</span>
      <span class="player-spacer"></span>
      <media-fullscreen-button></media-fullscreen-button>
    </media-control-bar>
  </media-controller>

  <div v-else-if="player" class="stage-frame player">
    <div class="player-empty">
      <p>{{ detail || '正在等待画面…' }}</p>
      <button class="player-play" type="button" :disabled="waiting" @click="emit('watch')">
        {{ waiting ? '正在连接' : '观看' }}
      </button>
    </div>
  </div>

  <div v-else ref="frame" class="stage-frame">
    <video ref="video" autoplay playsinline />
  </div>
</template>
