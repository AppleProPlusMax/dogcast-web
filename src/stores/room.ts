import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api/http'
import { ApiError, errorText } from '@/api/errors'
import { signaling } from '@/api/ws'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { router } from '@/router'
import type {
  DefaultRoomResponse,
  Envelope,
  MemberOnline,
  Membership,
  Room,
  RoomSnapshot,
  ShareState,
  ViewerRef,
} from '@/types/protocol'

function readRecord(payload: unknown) {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

export const useRoomStore = defineStore('room', () => {
  const room = ref<Room | null>(null)
  const membership = ref<Membership | null>(null)
  const membersOnline = ref<MemberOnline[]>([])
  const share = ref<ShareState>({ status: 'idle' })
  const viewers = ref<ViewerRef[]>([])
  const viewerCount = ref(0)
  const connId = ref<string | null>(null)
  const selfUserId = ref<string | null>(null)
  const joined = ref(false)
  const error = ref('')
  const shareEndedReason = ref<string | null>(null)
  const stateVersion = ref(0)
  let bound = false

  function touch() {
    stateVersion.value += 1
  }

  function applySnapshot(payload: unknown) {
    const snap = payload as RoomSnapshot
    if (!snap?.room || !snap?.self?.connId) return
    room.value = snap.room
    connId.value = snap.self.connId
    selfUserId.value = snap.self.userId
    membersOnline.value = snap.membersOnline ?? []
    share.value = snap.share?.status === 'someone_sharing' ? { ...snap.share } : { status: 'idle' }
    viewers.value = snap.viewers ?? []
    viewerCount.value = snap.viewerCount ?? viewers.value.length
    joined.value = true
    error.value = ''
    if (share.value.status === 'idle') shareEndedReason.value = null
    touch()
  }

  async function loadRoomMeta() {
    const data = await api<DefaultRoomResponse>('/api/rooms/default')
    room.value = data.room
    membership.value = data.membership
  }

  async function onAuthed(envelope: Envelope) {
    const payload = readRecord(envelope.payload)
    if (typeof payload.connId === 'string') connId.value = payload.connId
    if (typeof payload.userId === 'string') selfUserId.value = payload.userId
    const slug = room.value?.slug ?? 'home'
    try {
      const response = await signaling.request('room.join', { slug }, ['room.snapshot', 'error'])
      if (response.type === 'room.snapshot') applySnapshot(response.payload)
      if (response.type === 'error') {
        const body = readRecord(response.payload)
        error.value = errorText(typeof body.code === 'string' ? body.code : null, '进入房间失败')
      }
    } catch (err) {
      if (!joined.value) {
        error.value = err instanceof Error ? err.message : '进入房间失败'
      }
    }
  }

  async function onAuthError() {
    const auth = useAuthStore()
    const token = await auth.refresh()
    if (!token) {
      auth.failSession()
      return
    }
    signaling.start(() => auth.accessToken)
  }

  function onSignedInElsewhere() {
    signaling.stop()
    joined.value = false
    connId.value = null
    membersOnline.value = []
    share.value = { status: 'idle' }
    viewers.value = []
    viewerCount.value = 0
    useAuthStore().failSession()
    useUiStore().notify('这个账号已在另一处登录', 'warn')
    void router.push({ path: '/login', query: { reason: 'replaced' } })
  }

  function onPresenceJoined(payload: unknown) {
    const member = payload as MemberOnline
    if (!member?.connId) return
    if (membersOnline.value.some((item) => item.connId === member.connId)) return
    membersOnline.value = [...membersOnline.value, member]
  }

  function onPresenceLeft(payload: unknown) {
    const body = readRecord(payload)
    const id = typeof body.connId === 'string' ? body.connId : ''
    if (!id) return
    membersOnline.value = membersOnline.value.filter((item) => item.connId !== id)
  }

  function onShareStarted(payload: unknown) {
    const body = readRecord(payload)
    if (typeof body.publisherConnId !== 'string' || typeof body.publisherUserId !== 'string') return
    share.value = {
      status: 'someone_sharing',
      publisherUserId: body.publisherUserId,
      publisherConnId: body.publisherConnId,
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      startedAt: Date.now(),
    }
    shareEndedReason.value = null
    touch()
  }

  function onShareEnded(payload: unknown) {
    const body = readRecord(payload)
    shareEndedReason.value = typeof body.reason === 'string' ? body.reason : 'publisher_stop'
    share.value = { status: 'idle' }
    viewers.value = []
    viewerCount.value = 0
    touch()
  }

  function onViewers(payload: unknown) {
    const body = payload as { viewers?: ViewerRef[]; viewerCount?: number }
    viewers.value = body.viewers ?? []
    viewerCount.value = body.viewerCount ?? viewers.value.length
    touch()
  }

  function onError(payload: unknown) {
    const body = readRecord(payload)
    const code = typeof body.code === 'string' ? body.code : null
    const message = typeof body.message === 'string' ? body.message : undefined
    useUiStore().notify(errorText(code, message), 'error')
  }

  function bind() {
    if (bound) return
    bound = true
    signaling.on('auth.ok', (envelope) => {
      void onAuthed(envelope)
    })
    signaling.on('auth.error', () => {
      void onAuthError()
    })
    signaling.on('session.replaced', () => {
      onSignedInElsewhere()
    })
    signaling.on('room.snapshot', (envelope) => applySnapshot(envelope.payload))
    signaling.on('presence.joined', (envelope) => onPresenceJoined(envelope.payload))
    signaling.on('presence.left', (envelope) => onPresenceLeft(envelope.payload))
    signaling.on('share.started', (envelope) => onShareStarted(envelope.payload))
    signaling.on('share.ended', (envelope) => onShareEnded(envelope.payload))
    signaling.on('viewer.updated', (envelope) => onViewers(envelope.payload))
    signaling.on('error', (envelope) => onError(envelope.payload))
  }

  async function joinDefault() {
    error.value = ''
    try {
      if (!room.value) await loadRoomMeta()
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : '无法读取房间'
      return
    }
    bind()
    const auth = useAuthStore()
    signaling.start(() => auth.accessToken)
    if (signaling.isReady() && !joined.value) {
      await onAuthed({
        v: 1,
        type: 'auth.ok',
        payload: { connId: connId.value, userId: selfUserId.value },
      })
    }
  }

  function leave() {
    try {
      signaling.send('room.leave', {})
    } catch {
      // 连接已经没了就直接停。
    }
    signaling.stop()
    joined.value = false
    connId.value = null
    membersOnline.value = []
    share.value = { status: 'idle' }
    viewers.value = []
    viewerCount.value = 0
    shareEndedReason.value = null
  }

  return {
    room,
    membership,
    membersOnline,
    share,
    viewers,
    viewerCount,
    connId,
    selfUserId,
    joined,
    error,
    shareEndedReason,
    stateVersion,
    joinDefault,
    leave,
    bind,
  }
})
