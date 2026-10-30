<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import { api } from '@/api/http'
import { ApiError } from '@/api/errors'
import { readLobby, saveLobby } from '@/lobby'
import { isPhone } from '@/utils/browser-capability'

const router = useRouter()
const phone = isPhone()
const existing = readLobby()
const starting = ref(false)
const joining = ref(false)
const code = ref('')
const error = ref('')

function normalizeCode(raw: string) {
  const text = raw.trim()
  const part = text.split('/').filter(Boolean).pop() ?? text
  return part.replace(/\s/g, '')
}

async function start() {
  if (starting.value || phone) return
  starting.value = true
  error.value = ''
  try {
    const data = await api<{ accessToken: string; code: string; room: { name: string } }>('/api/lobbies', {
      method: 'POST',
      auth: false,
    })
    saveLobby({ accessToken: data.accessToken, code: data.code, roomName: data.room.name })
    await router.push('/room')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '没能打开房间'
  } finally {
    starting.value = false
  }
}

async function join() {
  const next = normalizeCode(code.value)
  if (!next) {
    error.value = '请填写房间号'
    return
  }
  await router.push(`/watch/${encodeURIComponent(next)}`)
}
</script>

<template>
  <div class="room">
    <header class="topbar">
      <RouterLink class="brand" to="/">
        <BrandMark />
        <span>Dogcast</span>
      </RouterLink>
      <nav class="top-actions">
        <RouterLink v-if="existing" to="/room">回到分享</RouterLink>
        <RouterLink to="/settings">设置</RouterLink>
      </nav>
    </header>
    <main class="room-main">
      <section class="stage">
        <div class="screen-fit">
          <div class="screen">
            <div class="stage-empty">
              <p class="welcome"><span class="spark">✦</span>打开就能分享。朋友凭房间号进来看。</p>
              <div class="entry-actions">
                <button v-if="!phone" class="entry-action primary" type="button" :disabled="starting" @click="start">
                  <i aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8">
                      <rect x="5" y="7" width="22" height="14" rx="2" />
                      <path d="M12 25h8M16 21v4" stroke-linecap="round" />
                    </svg>
                  </i>
                  {{ starting ? '正在打开' : '开始分享' }}
                </button>
                <button class="entry-action" type="button" @click="joining = !joining">
                  <i aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                      <path d="M13 19l6-6" />
                      <path d="M14 11h-1a5 5 0 0 0 0 10h1M18 21h1a5 5 0 0 0 0-10h-1" />
                    </svg>
                  </i>
                  加入房间
                </button>
              </div>
              <p v-if="phone" class="welcome">手机只能观看。请向分享的人要房间号。</p>
            </div>
          </div>
        </div>
        <form v-if="joining" class="join-row on-page" @submit.prevent="join">
          <input v-model="code" placeholder="房间号" autocomplete="off" />
          <button class="btn primary" type="submit">进入</button>
        </form>
        <p v-if="error" class="form-error">{{ error }}</p>
      </section>
    </main>
  </div>
</template>
