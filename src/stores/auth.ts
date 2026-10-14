import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api, bindAuth } from '@/api/http'
import { apiUrl } from '@/api/env'
import { ApiError } from '@/api/errors'
import type { AuthResponse, User } from '@/types/protocol'

function unwrapUser(data: User | { user?: User } | null | undefined): User | null {
  if (!data) return null
  if ('username' in data && 'id' in data) return data
  return data.user ?? null
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(null)
  const status = ref<'idle' | 'restoring' | 'authenticated'>('idle')
  let refreshFlight: Promise<string | null> | null = null

  function failSession() {
    accessToken.value = null
    user.value = null
    status.value = 'idle'
  }

  async function refreshOnce() {
    try {
      const response = await fetch(apiUrl('/api/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) return null
      const data = (await response.json()) as AuthResponse
      if (!data.accessToken) return null
      accessToken.value = data.accessToken
      const nextUser = unwrapUser(data.user)
      if (nextUser) user.value = nextUser
      return data.accessToken
    } catch {
      return null
    }
  }

  async function refresh() {
    if (!refreshFlight) {
      refreshFlight = refreshOnce().finally(() => {
        refreshFlight = null
      })
    }
    return refreshFlight
  }

  async function fetchMe() {
    const data = await api<User | { user?: User }>('/api/auth/me')
    const next = unwrapUser(data)
    if (!next) throw new ApiError('INTERNAL', '没有读到当前用户', 500)
    user.value = next
    return next
  }

  function applySession(data: AuthResponse) {
    accessToken.value = data.accessToken
    const next = unwrapUser(data.user)
    if (next) user.value = next
    status.value = 'authenticated'
  }

  async function login(username: string, password: string) {
    const data = await api<AuthResponse>('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, password }),
    })
    applySession(data)
    if (!user.value) await fetchMe()
  }

  async function register(input: {
    username: string
    password: string
    displayName: string
    inviteCode: string
  }) {
    const data = await api<AuthResponse>('/api/auth/register', {
      method: 'POST',
      auth: false,
      body: JSON.stringify(input),
    })
    applySession(data)
    if (!user.value) await fetchMe()
  }

  async function logout() {
    try {
      await api<void>('/api/auth/logout', { method: 'POST' })
    } catch {
      // 本地会话仍然清掉，避免卡在失效 token 上。
    }
    failSession()
  }

  async function restoreSession() {
    if (status.value === 'authenticated' && accessToken.value) return
    status.value = 'restoring'
    const token = await refresh()
    if (!token) {
      failSession()
      return
    }
    try {
      if (!user.value) await fetchMe()
      status.value = 'authenticated'
    } catch {
      failSession()
    }
  }

  bindAuth({
    getToken: () => accessToken.value,
    refresh,
    onLostSession: failSession,
  })

  return {
    user,
    accessToken,
    status,
    login,
    register,
    logout,
    refresh,
    restoreSession,
    failSession,
  }
})
