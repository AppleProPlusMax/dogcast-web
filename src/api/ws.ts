import { ref } from 'vue'
import { wsUrl } from '@/api/env'
import type { Envelope } from '@/types/protocol'
import { newClientId } from '@/utils/id'

type Handler = (envelope: Envelope) => void

interface Pending {
  accepts: string[]
  resolve: (envelope: Envelope) => void
  reject: (error: Error) => void
  timer: number
}

export const signalingState = ref<'idle' | 'connecting' | 'open' | 'reconnecting'>('idle')

class SignalingClient {
  private ws: WebSocket | null = null
  private shouldRun = false
  private authed = false
  private backoff = 1000
  private connectAttempt = 0
  private retryTimer = 0
  private pingTimer = 0
  private queue: Envelope[] = []
  private handlers = new Map<string, Set<Handler>>()
  private pending = new Map<string, Pending>()
  private tokenGetter: (() => string | null) | null = null

  start(getToken: () => string | null) {
    this.tokenGetter = getToken
    if (this.shouldRun && this.ws && this.ws.readyState !== WebSocket.CLOSED) return
    this.shouldRun = true
    this.backoff = 1000
    this.connect()
  }

  stop() {
    this.shouldRun = false
    this.authed = false
    window.clearTimeout(this.retryTimer)
    this.stopPing()
    this.failPending(new Error('连接已关闭'))
    this.queue = []
    const socket = this.ws
    this.ws = null
    socket?.close()
    signalingState.value = 'idle'
  }

  isReady() {
    return this.authed && this.ws?.readyState === WebSocket.OPEN
  }

  on(type: string, handler: Handler) {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler)
    return () => set.delete(handler)
  }

  send(type: string, payload: unknown, requestId?: string) {
    const envelope: Envelope = { v: 1, type, payload, requestId }
    if (this.authed && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope))
      return
    }
    if (!this.shouldRun) throw new Error('信令未连接')
    this.queue.push(envelope)
  }

  request(type: string, payload: unknown, accepts: string[], timeoutMs = 12000) {
    const requestId = newClientId()
    return new Promise<Envelope>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('信令超时'))
      }, timeoutMs)
      this.pending.set(requestId, { accepts, resolve, reject, timer })
      try {
        this.send(type, payload, requestId)
      } catch (error) {
        window.clearTimeout(timer)
        this.pending.delete(requestId)
        reject(error instanceof Error ? error : new Error('发送失败'))
      }
    })
  }

  private connect() {
    if (!this.shouldRun) return
    this.connectAttempt += 1
    signalingState.value = this.connectAttempt > 1 ? 'reconnecting' : 'connecting'
    const socket = new WebSocket(wsUrl())
    this.ws = socket

    socket.onopen = () => {
      const token = this.tokenGetter?.()
      if (!token) {
        socket.close()
        return
      }
      const envelope: Envelope = {
        v: 1,
        type: 'auth',
        requestId: newClientId(),
        payload: { accessToken: token },
      }
      socket.send(JSON.stringify(envelope))
    }

    socket.onmessage = (event) => {
      this.onMessage(String(event.data))
    }

    socket.onerror = () => {
      socket.close()
    }

    socket.onclose = () => {
      if (this.ws !== socket) return
      this.onClose()
    }
  }

  private onMessage(raw: string) {
    let envelope: Envelope
    try {
      envelope = JSON.parse(raw) as Envelope
    } catch {
      return
    }

    this.settlePending(envelope)

    if (envelope.type === 'auth.ok') {
      this.authed = true
      this.backoff = 1000
      this.connectAttempt = 1
      signalingState.value = 'open'
      this.flush()
      this.startPing()
    }

    if (envelope.type === 'auth.error') {
      this.shouldRun = false
      this.ws?.close()
    }

    this.handlers.get(envelope.type)?.forEach((handler) => handler(envelope))
    this.handlers.get('*')?.forEach((handler) => handler(envelope))
  }

  private settlePending(envelope: Envelope) {
    if (envelope.requestId && this.pending.has(envelope.requestId)) {
      this.finishPending(envelope.requestId, envelope)
      return
    }
    for (const [id, pending] of this.pending) {
      if (pending.accepts.includes(envelope.type)) {
        this.finishPending(id, envelope)
        return
      }
    }
  }

  private finishPending(id: string, envelope: Envelope) {
    const pending = this.pending.get(id)
    if (!pending) return
    window.clearTimeout(pending.timer)
    this.pending.delete(id)
    pending.resolve(envelope)
  }

  private flush() {
    const queued = this.queue.splice(0)
    for (const envelope of queued) {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(envelope))
    }
  }

  private startPing() {
    this.stopPing()
    this.pingTimer = window.setInterval(() => {
      if (!this.authed) return
      try {
        this.send('ping', {})
      } catch {
        // 连接刚断开时忽略这一次心跳。
      }
    }, 20_000)
  }

  private stopPing() {
    window.clearInterval(this.pingTimer)
  }

  private onClose() {
    this.authed = false
    this.ws = null
    this.stopPing()
    this.failPending(new Error('连接已断开'))
    this.handlers.get('connection.closed')?.forEach((handler) => {
      handler({ v: 1, type: 'connection.closed', payload: {} })
    })
    if (!this.shouldRun) {
      signalingState.value = 'idle'
      return
    }
    signalingState.value = 'reconnecting'
    const wait = this.backoff
    this.backoff = Math.min(this.backoff * 2, 30_000)
    this.retryTimer = window.setTimeout(() => this.connect(), wait)
  }

  private failPending(error: Error) {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

export const signaling = new SignalingClient()
