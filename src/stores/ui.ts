import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { newClientId } from '@/utils/id'

export interface ToastItem {
  id: string
  text: string
  tone: 'info' | 'warn' | 'error'
}

interface StoredPrefs {
  preferredMaxBitrateKbps?: number
  forceRelay?: boolean
  remoteMuted?: boolean
  remoteVolume?: number
  showAudioShareHint?: boolean
}

const STORAGE_KEY = 'dogcast.ui'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<ToastItem[]>([])
  const preferredMaxBitrateKbps = ref(8000)
  const forceRelay = ref(false)
  const remoteMuted = ref(false)
  const remoteVolume = ref(1)
  const showAudioShareHint = ref(true)

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as StoredPrefs
      if (typeof data.preferredMaxBitrateKbps === 'number') {
        preferredMaxBitrateKbps.value = clamp(data.preferredMaxBitrateKbps, 8000, 12000)
      }
      if (typeof data.forceRelay === 'boolean') forceRelay.value = data.forceRelay
      if (typeof data.remoteMuted === 'boolean') remoteMuted.value = data.remoteMuted
      if (typeof data.remoteVolume === 'number') remoteVolume.value = clamp(data.remoteVolume, 0, 1)
      if (typeof data.showAudioShareHint === 'boolean') showAudioShareHint.value = data.showAudioShareHint
    } catch {
      // 本地偏好损坏时继续用默认值。
    }
  }

  function save() {
    const data: StoredPrefs = {
      preferredMaxBitrateKbps: preferredMaxBitrateKbps.value,
      forceRelay: forceRelay.value,
      remoteMuted: remoteMuted.value,
      remoteVolume: remoteVolume.value,
      showAudioShareHint: showAudioShareHint.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  load()

  watch([preferredMaxBitrateKbps, forceRelay, remoteMuted, remoteVolume, showAudioShareHint], save)

  function dismiss(id: string) {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }

  function notify(text: string, tone: ToastItem['tone'] = 'info') {
    const id = newClientId()
    const next = [...toasts.value, { id, text, tone }]
    toasts.value = next.slice(-4)
    window.setTimeout(() => dismiss(id), 4600)
  }

  return {
    toasts,
    preferredMaxBitrateKbps,
    forceRelay,
    remoteMuted,
    remoteVolume,
    showAudioShareHint,
    notify,
    dismiss,
  }
})
