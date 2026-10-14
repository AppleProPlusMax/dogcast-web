<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const displayName = ref('')
const inviteCode = ref('')
const pending = ref(false)
const formError = ref('')

async function submit() {
  formError.value = ''
  const name = username.value.trim()
  const shown = displayName.value.trim()
  const code = inviteCode.value.trim()
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(name)) {
    formError.value = '用户名需要 3–32 位字母、数字或下划线'
    return
  }
  if (shown.length < 1 || shown.length > 32) {
    formError.value = '显示名需要 1–32 个字'
    return
  }
  if (password.value.length < 8) {
    formError.value = '密码至少 8 位'
    return
  }
  if (!code) {
    formError.value = '请填写邀请码'
    return
  }
  pending.value = true
  try {
    await auth.register({
      username: name,
      password: password.value,
      displayName: shown,
      inviteCode: code,
    })
    await router.push('/room')
  } catch (error) {
    formError.value = error instanceof ApiError ? error.message : '注册失败'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="auth-shell">
    <section class="auth-brand">
      <BrandMark />
      <p class="eyebrow">邀请制</p>
      <h1>加入 Dogcast</h1>
      <p class="lead">公开注册是关着的。向管理员要一个邀请码，注册后会进入房间。</p>
    </section>
    <section class="auth-card">
      <h2>注册</h2>
      <form @submit.prevent="submit">
        <label class="field">
          <span>用户名</span>
          <input v-model="username" name="username" autocomplete="username" required />
        </label>
        <label class="field">
          <span>显示名</span>
          <input v-model="displayName" name="displayName" autocomplete="nickname" required />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" name="password" type="password" autocomplete="new-password" required />
        </label>
        <label class="field">
          <span>邀请码</span>
          <input v-model="inviteCode" name="inviteCode" autocomplete="off" required />
        </label>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <button class="btn primary wide" type="submit" :disabled="pending">
          {{ pending ? '正在注册…' : '注册并进入' }}
        </button>
      </form>
      <p class="switch">
        已有账号？
        <RouterLink to="/login">返回登录</RouterLink>
      </p>
    </section>
  </main>
</template>
