import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { newClientId } from '@/utils/id'

export interface ToastItem {
  id: string
  text: string
  tone: 'info' | 'warn' | 'error'
}

interface StoredPrefs {
  uploadBudgetKbps?: number
  preferredMaxBitrateKbps?: number
  forceRelay?: boolean
  remoteMuted?: boolean
  remoteVolume?: number
  showAudioShareHint?: boolean
}

export const UPLOAD_PRESETS = [
  { id: 'balanced', label: '均衡', kbps: 24_000 },
  { id: 'sharp', label: '清晰', kbps: 36_000 },
  { id: 'max', label: '极致', kbps: 48_000 },
] as const

export const UPLOAD_BUDGET_MIN_KBPS = 12_000
export const UPLOAD_BUDGET_MAX_KBPS = 80_000

const DEFAULT_UPLOAD_KBPS = 24_000

function nearestUploadBudget(kbps: number) {
  const inRange = clamp(kbps, UPLOAD_BUDGET_MIN_KBPS, UPLOAD_BUDGET_MAX_KBPS)
  return UPLOAD_PRESETS.reduce((best, preset) =>
    Math.abs(preset.kbps - inRange) < Math.abs(best.kbps - inRange) ? preset : best,
  ).kbps
}

const STORAGE_KEY = 'dogcast.ui'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<ToastItem[]>([])
  const uploadBudgetKbps = ref(DEFAULT_UPLOAD_KBPS)
  const forceRelay = ref(false)
  const remoteMuted = ref(false)
  const remoteVolume = ref(1)
  const showAudioShareHint = ref(true)

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as StoredPrefs
      const savedBudget = data.uploadBudgetKbps
      if (typeof savedBudget === 'number' && savedBudget >= UPLOAD_BUDGET_MIN_KBPS && savedBudget <= UPLOAD_BUDGET_MAX_KBPS) {
        uploadBudgetKbps.value = Math.round(savedBudget)
      } else if (typeof data.preferredMaxBitrateKbps === 'number') {
        uploadBudgetKbps.value = nearestUploadBudget(data.preferredMaxBitrateKbps)
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
      uploadBudgetKbps: uploadBudgetKbps.value,
      forceRelay: forceRelay.value,
      remoteMuted: remoteMuted.value,
      remoteVolume: remoteVolume.value,
      showAudioShareHint: showAudioShareHint.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  load()

  watch([uploadBudgetKbps, forceRelay, remoteMuted, remoteVolume, showAudioShareHint], save)

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
    uploadBudgetKbps,
    forceRelay,
    remoteMuted,
    remoteVolume,
    showAudioShareHint,
    notify,
    dismiss,
  }
})
