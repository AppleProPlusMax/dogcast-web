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
  qualityPreset?: QualityPresetId
  qualityWidth?: number
  qualityHeight?: number
  qualityFps?: number
  qualityBitrateKbps?: number
  qualityDegradation?: DegradationPreference
  systemAudio?: boolean
  microphone?: boolean
}

export type QualityPresetId = '720p30' | '1080p30' | '1080p60' | 'custom'
export type DegradationPreference = 'maintain-resolution' | 'balanced' | 'maintain-framerate'

export const QUALITY_PRESETS: Record<Exclude<QualityPresetId, 'custom'>, { width: number; height: number; fps: number; bitrateKbps: number }> = {
  '720p30': { width: 1280, height: 720, fps: 30, bitrateKbps: 4_000 },
  '1080p30': { width: 1920, height: 1080, fps: 30, bitrateKbps: 8_000 },
  '1080p60': { width: 1920, height: 1080, fps: 60, bitrateKbps: 12_000 },
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
  const qualityPreset = ref<QualityPresetId>('1080p60')
  const qualityWidth = ref(1920)
  const qualityHeight = ref(1080)
  const qualityFps = ref(60)
  const qualityBitrateKbps = ref(12_000)
  const qualityDegradation = ref<DegradationPreference>('balanced')
  const systemAudio = ref(true)
  const microphone = ref(false)

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
      if (typeof data.remoteMuted === 'boolean') remoteMuted.value = data.remoteMuted
      if (typeof data.remoteVolume === 'number') remoteVolume.value = clamp(data.remoteVolume, 0, 1)
      if (typeof data.showAudioShareHint === 'boolean') showAudioShareHint.value = data.showAudioShareHint
      if (data.qualityPreset === '720p30' || data.qualityPreset === '1080p30' || data.qualityPreset === '1080p60' || data.qualityPreset === 'custom') {
        qualityPreset.value = data.qualityPreset
      }
      if (typeof data.qualityWidth === 'number') qualityWidth.value = clamp(Math.round(data.qualityWidth), 640, 3840)
      if (typeof data.qualityHeight === 'number') qualityHeight.value = clamp(Math.round(data.qualityHeight), 360, 2160)
      if (typeof data.qualityFps === 'number') qualityFps.value = clamp(Math.round(data.qualityFps), 15, 60)
      if (typeof data.qualityBitrateKbps === 'number') qualityBitrateKbps.value = clamp(Math.round(data.qualityBitrateKbps), 1000, 20_000)
      if (data.qualityDegradation === 'maintain-resolution' || data.qualityDegradation === 'balanced' || data.qualityDegradation === 'maintain-framerate') {
        qualityDegradation.value = data.qualityDegradation
      }
      if (typeof data.systemAudio === 'boolean') systemAudio.value = data.systemAudio
      if (typeof data.microphone === 'boolean') microphone.value = data.microphone
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
      qualityPreset: qualityPreset.value,
      qualityWidth: qualityWidth.value,
      qualityHeight: qualityHeight.value,
      qualityFps: qualityFps.value,
      qualityBitrateKbps: qualityBitrateKbps.value,
      qualityDegradation: qualityDegradation.value,
      systemAudio: systemAudio.value,
      microphone: microphone.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  load()

  watch(
    [uploadBudgetKbps, forceRelay, remoteMuted, remoteVolume, showAudioShareHint, qualityPreset, qualityWidth, qualityHeight, qualityFps, qualityBitrateKbps, qualityDegradation, systemAudio, microphone],
    save,
  )

  function applyQualityPreset(preset: Exclude<QualityPresetId, 'custom'>) {
    const next = QUALITY_PRESETS[preset]
    qualityPreset.value = preset
    qualityWidth.value = next.width
    qualityHeight.value = next.height
    qualityFps.value = next.fps
    qualityBitrateKbps.value = next.bitrateKbps
  }

  function markQualityCustom() {
    qualityPreset.value = 'custom'
  }

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
    qualityPreset,
    qualityWidth,
    qualityHeight,
    qualityFps,
    qualityBitrateKbps,
    qualityDegradation,
    systemAudio,
    microphone,
    applyQualityPreset,
    markQualityCustom,
    notify,
    dismiss,
  }
})
