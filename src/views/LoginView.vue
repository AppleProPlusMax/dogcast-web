<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const pending = ref(false)
const formError = ref('')

function nextPath() {
  const redirect = route.query.redirect
  if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//')) return '/room'
  return redirect
}

async function submit() {
  formError.value = ''
  const name = username.value.trim()
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(name)) {
    formError.value = '用户名需要 3–32 位字母、数字或下划线'
    return
  }
  if (!password.value) {
    formError.value = '请填写密码'
    return
  }
  pending.value = true
  try {
    await auth.login(name, password.value)
    await router.push(nextPath())
  } catch (error) {
    formError.value = error instanceof ApiError ? error.message : '登录失败'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="auth-shell">
    <section class="auth-brand">
      <BrandMark />
      <p class="eyebrow">dogleaf.cn</p>
      <h1>Dogcast</h1>
      <p class="lead">把屏幕分享给房间里的人。同一时间只有一个人能分享。</p>
    </section>
    <section class="auth-card">
      <h2>登录</h2>
      <form @submit.prevent="submit">
        <label class="field">
          <span>用户名</span>
          <input v-model="username" name="username" autocomplete="username" required />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" name="password" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <button class="btn primary wide" type="submit" :disabled="pending">
          {{ pending ? '正在登录…' : '进入房间' }}
        </button>
      </form>
      <p class="switch">
        有邀请码？
        <RouterLink to="/register">注册一个账号</RouterLink>
      </p>
    </section>
  </main>
</template>
