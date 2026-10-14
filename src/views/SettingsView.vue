<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import { api } from '@/api/http'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { signOut } from '@/session'
import { detectCapability } from '@/utils/browser-capability'

const INVITE_MAX_USES = 100
const INVITE_HOURS = 1

const auth = useAuthStore()
const ui = useUiStore()
const capability = detectCapability()
const signingOut = ref(false)
const creatingInvite = ref(false)
const inviteError = ref('')
const copied = ref(false)
const invite = ref<{ code: string; expiresAt: string | null } | null>(null)

const isAdmin = computed(() => auth.user?.role === 'admin')
const inviteExpiryText = computed(() => {
  const expiresAt = invite.value?.expiresAt
  if (!expiresAt) return ''
  return new Date(expiresAt).toLocaleString('zh-CN', { hour12: false })
})

const bitrateMbps = computed({
  get: () => ui.preferredMaxBitrateKbps / 1000,
  set: (value: number) => {
    ui.preferredMaxBitrateKbps = Math.round(value * 1000)
  },
})
const volumePercent = computed({
  get: () => Math.round(ui.remoteVolume * 100),
  set: (value: number) => {
    ui.remoteVolume = value / 100
  },
})

async function createInvite() {
  if (!isAdmin.value || creatingInvite.value) return
  creatingInvite.value = true
  inviteError.value = ''
  copied.value = false
  try {
    invite.value = await api<{ code: string; id: string; expiresAt: string | null }>('/api/admin/invites', {
      method: 'POST',
      body: JSON.stringify({ maxUses: INVITE_MAX_USES, expiresInHours: INVITE_HOURS }),
    })
  } catch (error) {
    invite.value = null
    inviteError.value = error instanceof ApiError ? error.message : '邀请码生成失败'
  } finally {
    creatingInvite.value = false
  }
}

async function copyInvite() {
  const code = invite.value?.code
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    copied.value = true
  } catch {
    copied.value = false
    inviteError.value = '复制失败，请手动选择邀请码'
  }
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
  <main class="settings">
    <header class="topbar">
      <RouterLink class="brand" to="/room">
        <BrandMark />
        <span>Dogcast</span>
      </RouterLink>
      <RouterLink to="/room">返回房间</RouterLink>
    </header>

    <div class="settings-grid">
      <section class="panel">
        <p class="eyebrow">账号</p>
        <h1>{{ auth.user?.displayName }}</h1>
        <dl>
          <div>
            <dt>用户名</dt>
            <dd>{{ auth.user?.username }}</dd>
          </div>
          <div>
            <dt>显示名</dt>
            <dd>{{ auth.user?.displayName }}</dd>
          </div>
          <div>
            <dt>身份</dt>
            <dd>{{ auth.user?.role === 'admin' ? '管理员' : '成员' }}</dd>
          </div>
        </dl>
        <p class="hint">显示名在注册时确定。这一版没有修改资料的接口。</p>
        <template v-if="isAdmin">
          <button class="btn" type="button" :disabled="creatingInvite" @click="createInvite">
            {{ creatingInvite ? '正在生成…' : '生成邀请码' }}
          </button>
          <p class="hint">生成后 1 小时内最多可使用 100 次。明文只在这里显示一次。</p>
          <p v-if="inviteError" class="form-error">{{ inviteError }}</p>
          <div v-if="invite" class="invite-result">
            <p class="invite-code">{{ invite.code }}</p>
            <p class="hint">有效期至 {{ inviteExpiryText }}</p>
            <button class="btn ghost" type="button" @click="copyInvite">{{ copied ? '已复制' : '复制邀请码' }}</button>
          </div>
        </template>
        <button class="btn danger" type="button" :disabled="signingOut" @click="logout">退出登录</button>
      </section>

      <section class="panel">
        <p class="eyebrow">观看与分享</p>
        <h2>偏好</h2>
        <label class="field">
          <span>单路视频码率 {{ bitrateMbps.toFixed(0) }} Mbps</span>
          <input v-model.number="bitrateMbps" type="range" min="8" max="12" step="1" />
          <small>1080p 单路不要低于 8 Mbps，否则画面会发糊。</small>
        </label>
        <label class="field">
          <span>远程音量 {{ volumePercent }}%</span>
          <input v-model.number="volumePercent" type="range" min="0" max="100" step="1" />
        </label>
        <label class="check">
          <input v-model="ui.remoteMuted" type="checkbox" />
          <span>静音远程声音</span>
        </label>
        <label class="check">
          <input v-model="ui.forceRelay" type="checkbox" />
          <span>强制走 TURN 中继（只在排障时打开）</span>
        </label>
        <label class="check">
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
