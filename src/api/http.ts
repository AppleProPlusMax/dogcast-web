import { shouldRefreshOnUnauthorized } from '@/api/auth-retry'
import { apiUrl } from '@/api/env'
import { ApiError, toApiError } from '@/api/errors'

interface ApiInit extends Omit<RequestInit, 'body'> {
  body?: BodyInit | null
  auth?: boolean
}

type TokenGetter = () => string | null
type RefreshHandler = () => Promise<string | null>
type LostHandler = () => void

let tokenGetter: TokenGetter | null = null
let tokenOverride: TokenGetter | null = null
let refreshHandler: RefreshHandler | null = null
let lostHandler: LostHandler | null = null

export function setTokenOverride(getter: TokenGetter | null) {
  tokenOverride = getter
}

export function bindAuth(options: {
  getToken: TokenGetter
  refresh: RefreshHandler
  onLostSession: LostHandler
}) {
  tokenGetter = options.getToken
  refreshHandler = options.refresh
  lostHandler = options.onLostSession
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  return request<T>(path, init, true)
}

async function request<T>(path: string, init: ApiInit, allowRefresh: boolean): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')

  if (init.auth !== false) {
    const token = (tokenOverride ?? tokenGetter)?.()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new ApiError('NETWORK', '连不上服务器', 0)
  }

  if (response.status === 401 && init.auth !== false) {
    const guest = tokenOverride !== null
    if (!shouldRefreshOnUnauthorized({ allowRefresh, auth: true, guest })) {
      throw new ApiError('UNAUTHORIZED', guest ? '观看链接失效了' : '登录已过期', 401)
    }
    const token = await refreshHandler?.()
    if (token) return request<T>(path, init, false)
    lostHandler?.()
    throw new ApiError('UNAUTHORIZED', '登录已过期', 401)
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      throw new ApiError('INTERNAL', '服务器返回了无法识别的内容', response.status)
    }
  }

  if (!response.ok) throw toApiError(data, response.status)
  return data as T
}
