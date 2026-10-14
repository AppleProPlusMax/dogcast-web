<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  stream: MediaStream | null
  muted: boolean
  volume: number
}>()

const video = ref<HTMLVideoElement | null>(null)
const frame = ref<HTMLElement | null>(null)
const blocked = ref(false)
let unmuteTrack: MediaStreamTrack | null = null

function detachUnmute() {
  unmuteTrack?.removeEventListener('unmute', onTrackUnmute)
  unmuteTrack = null
}

function onTrackUnmute() {
  void tryPlay()
}

async function tryPlay() {
  const element = video.value
  if (!element) return
  element.srcObject = props.stream
  element.muted = props.muted
  element.volume = props.muted ? 0 : props.volume
  detachUnmute()
  const track = props.stream?.getVideoTracks()[0]
  if (track?.muted) {
    unmuteTrack = track
    track.addEventListener('unmute', onTrackUnmute)
  }
  if (!props.stream) {
    blocked.value = false
    return
  }
  try {
    await element.play()
    blocked.value = false
  } catch {
    blocked.value = !props.muted
  }
}

function unlock() {
  if (video.value) video.value.muted = false
  void tryPlay()
}

watch(
  () => [props.stream, props.muted, props.volume] as const,
  () => {
    void tryPlay()
  },
)

onMounted(() => {
  void tryPlay()
})

onBeforeUnmount(() => {
  detachUnmute()
  if (video.value) video.value.srcObject = null
})

defineExpose({
  toggleFullscreen() {
    const element = frame.value
    if (!element) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void element.requestFullscreen()
  },
})
</script>

<template>
  <div ref="frame" class="stage-frame">
    <video ref="video" autoplay playsinline :muted="muted" />
    <button v-if="blocked" class="unblock" type="button" @click="unlock">点击开启声音</button>
  </div>
</template>
