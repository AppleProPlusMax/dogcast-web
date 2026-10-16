import type { ApiErrorBody } from '@/types/protocol'

const ERROR_TEXT: Record<string, string> = {
  VALIDATION_ERROR: '填写的内容不符合要求',
  UNAUTHORIZED: '账号或密码不正确，或登录已过期',
  FORBIDDEN: '没有权限做这件事',
  NOT_FOUND: '没有找到对应内容',
  CONFLICT: '用户名已经被占用',
  INVITE_INVALID: '邀请码无效、过期或已经用完',
  REGISTER_DISABLED: '现在没有开放注册',
  ROOM_FULL_VIEWERS: '观看人数已满（最多 4 人）',
  RATE_LIMITED: '操作太频繁，请稍后再试',
  SHARE_SLOT_TAKEN: '已经有人在分享',
  NOT_IN_ROOM: '还没有进入房间',
  ALREADY_PUBLISHER: '你已经在分享',
  NETWORK: '连不上服务器',
  INTERNAL: '服务器出错了',
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export function errorText(code: string | null | undefined, fallback?: string) {
  if (code && ERROR_TEXT[code]) return ERROR_TEXT[code]
  return fallback || '请求失败'
}

export function toApiError(body: unknown, status: number) {
  const record = body as ApiErrorBody | null
  const code = record?.error?.code || (status === 401 ? 'UNAUTHORIZED' : 'INTERNAL')
  const message = errorText(code, record?.error?.message)
  return new ApiError(code, message, status)
}

export function shareDenyText(reason: string | null | undefined) {
  switch (reason) {
    case 'SHARE_SLOT_TAKEN':
      return '已经有人在分享'
    case 'NOT_IN_ROOM':
      return '还没有进入房间'
    case 'GUEST':
      return '观看链接不能发起分享'
    default:
      return '现在不能开始分享'
  }
}

export function shareEndText(reason: string | null | undefined) {
  switch (reason) {
    case 'publisher_disconnect':
      return '分享者断开了，画面已停止'
    case 'kicked':
      return '这次分享已被结束'
    case 'replaced_denied':
      return '分享已结束'
    default:
      return '分享已结束'
  }
}
