<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import { ApiError } from '@/api/errors'
import { readLobby } from '@/lobby'
import { UPLOAD_BUDGET_MAX_KBPS, UPLOAD_BUDGET_MIN_KBPS, UPLOAD_PRESETS, useUiStore } from '@/stores/ui'
import { detectCapability, isPhone } from '@/utils/browser-capability'
import { formatMbps, measureSustainedUpload } from '@/utils/upload-test'

const ui = useUiStore()
const capability = detectCapability()
const phone = isPhone()
const testingUpload = ref(false)
const uploadElapsedMs = ref(0)
const uploadLiveMbps = ref(0)
const uploadResult = ref<{ measured: string; suggested: number; seconds: string; local: boolean } | null>(null)
const uploadTestError = ref('')

const volumePercent = computed({
  get: () => Math.round(ui.remoteVolume * 100),
  set: (value: number) => {
    ui.remoteVolume = value / 100
  },
})
const customMbps = computed({
  get: () => Math.round(ui.uploadBudgetKbps / 1000),
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    const mbps = Math.min(UPLOAD_BUDGET_MAX_KBPS / 1000, Math.max(UPLOAD_BUDGET_MIN_KBPS / 1000, Math.round(value)))
    ui.uploadBudgetKbps = mbps * 1000
  },
})

const uploadProgress = computed(() => Math.min(100, Math.round((uploadElapsedMs.value / 5000) * 100)))

function isLocalServer() {
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

async function measureUpload() {
  if (phone || testingUpload.value) return
  testingUpload.value = true
  uploadElapsedMs.value = 0
  uploadLiveMbps.value = 0
  uploadResult.value = null
  uploadTestError.value = ''
  const onSample = (sample: { elapsedMs: number; mbps: number }) => {
    uploadElapsedMs.value = sample.elapsedMs
    uploadLiveMbps.value = sample.mbps
  }
  const token = readLobby()?.accessToken ?? null
  if (!token) {
    uploadTestError.value = '先开始一次分享，再测上行'
    testingUpload.value = false
    return
  }
  try {
    const result = await measureSustainedUpload({ token, onSample })
    const local = isLocalServer()
    const suggested = Math.min(80, Math.max(12, Math.round(result.mbps * 0.7)))
    if (!local) ui.uploadBudgetKbps = suggested * 1000
    uploadElapsedMs.value = result.elapsedMs
    uploadResult.value = {
      measured: formatMbps(result.mbps),
      suggested,
      seconds: (result.elapsedMs / 1000).toFixed(1),
      local,
    }
  } catch (error) {
    uploadResult.value = null
    uploadTestError.value = error instanceof ApiError ? error.message : '测速失败'
  } finally {
    testingUpload.value = false
  }
}

</script>

<template>
  <main class="settings">
    <header class="topbar">
      <RouterLink class="brand" to="/">
        <BrandMark />
        <span>Dogcast</span>
      </RouterLink>
      <RouterLink to="/">返回首页</RouterLink>
    </header>

    <div class="settings-grid">
      <section class="panel">
        <p class="eyebrow">观看与分享</p>
        <h2>偏好</h2>
        <div v-if="!phone" class="upload-block">
          <div class="upload-head">
            <span>画质</span>
            <small>分享端只上传这一路。第二个人起，由已经连上的观众转发。</small>
          </div>
          <div class="preset-row">
            <button
              v-for="preset in (['720p30', '1080p30', '1080p60'] as const)"
              :key="preset"
              class="btn"
              :class="{ primary: ui.qualityPreset === preset }"
              type="button"
              @click="ui.applyQualityPreset(preset)"
            >
              {{ preset }}
            </button>
          </div>
          <label class="upload-custom">
            <span>卡的时候</span>
            <select v-model="ui.qualityDegradation" @change="ui.markQualityCustom">
              <option value="maintain-resolution">保清晰</option>
              <option value="balanced">均衡</option>
              <option value="maintain-framerate">保帧数</option>
            </select>
          </label>
          <label class="check">
            <input v-model="ui.systemAudio" type="checkbox" />
            <span>系统声音</span>
          </label>
          <label class="check">
            <input v-model="ui.microphone" type="checkbox" />
            <span>麦克风，和系统声音分开</span>
          </label>
        </div>
        <div v-if="!phone" class="upload-block">
          <div class="upload-head">
            <span>上传预算</span>
            <small>按当前观众人数平分，每一路限制在 3–20 Mbps。</small>
          </div>
          <div class="preset-row">
            <button
              v-for="preset in UPLOAD_PRESETS"
              :key="preset.id"
              class="btn"
              :class="{ primary: ui.uploadBudgetKbps === preset.kbps }"
              type="button"
              @click="ui.uploadBudgetKbps = preset.kbps"
            >
              {{ preset.label }} {{ preset.kbps / 1000 }}
            </button>
          </div>
          <label class="upload-custom">
            <span>自定义</span>
            <input v-model.number="customMbps" type="number" min="12" max="80" step="1" />
            <span>Mbps</span>
          </label>
          <div class="upload-test">
            <button class="btn ghost" type="button" :disabled="testingUpload" @click="measureUpload">
              {{ testingUpload ? '正在测 5 秒上行…' : '测 5 秒上行' }}
            </button>
            <div v-if="testingUpload" class="upload-meter" aria-hidden="true">
              <span :style="{ width: `${uploadProgress}%` }"></span>
            </div>
            <p v-if="testingUpload" class="upload-live">
              {{ (uploadElapsedMs / 1000).toFixed(1) }} / 5.0 秒
              <strong v-if="uploadLiveMbps > 0">{{ formatMbps(uploadLiveMbps) }} Mbps</strong>
            </p>
            <p v-else-if="uploadResult" class="upload-result">
              <strong>{{ uploadResult.measured }} Mbps</strong>
              <span v-if="uploadResult.local">这是访问本机服务器的速度，不是宽带上行，预算没有改。</span>
              <span v-else>{{ uploadResult.seconds }} 秒中位上行，已按七成填入 {{ uploadResult.suggested }} Mbps</span>
            </p>
            <p v-if="uploadTestError" class="form-error">{{ uploadTestError }}</p>
            <p class="hint">本机打开时，测的是电脑访问自己。要估外网观众能用的上行，请在部署后的网站上再测一次。</p>
          </div>
        </div>
        <label class="field">
          <span>远程音量 {{ volumePercent }}%</span>
          <input v-model.number="volumePercent" type="range" min="0" max="100" step="1" />
        </label>
        <label class="check">
          <input v-model="ui.remoteMuted" type="checkbox" />
          <span>静音远程声音</span>
        </label>
        <label v-if="!phone" class="check">
          <input v-model="ui.showAudioShareHint" type="checkbox" />
          <span>开始分享前提示勾选音频</span>
        </label>
      </section>

      <section class="panel">
        <p class="eyebrow">能力</p>
        <h2>{{ capability.browser }} · {{ capability.os }}</h2>
        <p>{{ capability.summary }}</p>
        <p>{{ capability.audioAdvice }}</p>
        <p v-if="!capability.canCapture" class="hint">这台浏览器目前不能发起屏幕分享，仍然可以观看。</p>
        <p v-else-if="capability.recommended" class="hint">这是系统音频的验收路径：Windows 上的 Chrome 或 Edge。</p>
      </section>
    </div>
  </main>
</template>
