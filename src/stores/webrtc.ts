import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api/http'
import { shareDenyText, shareEndText } from '@/api/errors'
import { signaling } from '@/api/ws'
import { useRoomStore } from '@/stores/room'
import { useUiStore } from '@/stores/ui'
import type { IceServer, IceServersResponse, SignalPayload } from '@/types/protocol'
import { isUserCancel, type CaptureProfile } from '@/webrtc/constraints'
import { captureBlockReason } from '@/utils/browser-capability'
import { type VideoEncodeProfile } from '@/webrtc/bitrate'
import { PublisherMesh } from '@/webrtc/publisher'
import { ViewerSession } from '@/webrtc/viewer'

function toIceServers(servers: IceServer[]): RTCIceServer[] {
  return servers.map((server) => ({
    urls: server.urls,
    username: server.username,
    credential: server.credential,
  }))
}

function captureProfile(ui: ReturnType<typeof useUiStore>): CaptureProfile {
  return {
    width: ui.qualityWidth,
    height: ui.qualityHeight,
    fps: ui.qualityFps,
    degradation: ui.qualityDegradation,
    systemAudio: ui.systemAudio,
    microphone: ui.microphone,
  }
}

function videoProfile(ui: ReturnType<typeof useUiStore>): VideoEncodeProfile {
  return {
    width: ui.qualityWidth,
    height: ui.qualityHeight,
    fps: ui.qualityFps,
    bitrateKbps: ui.qualityBitrateKbps,
    uploadBudgetKbps: ui.uploadBudgetKbps,
    degradation: ui.qualityDegradation,
  }
}
function asSignal(payload: unknown): SignalPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const body = payload as SignalPayload
  if (typeof body.roomId !== 'string' || typeof body.toConnId !== 'string') return null
  return body
}

export const useWebrtcStore = defineStore('webrtc', () => {
  const room = useRoomStore()
  const ui = useUiStore()

  const role = ref<'idle' | 'publishing' | 'viewing'>('idle')
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const hasAudioTrack = ref(false)
  const remoteHasAudio = ref(false)
  const captureSurface = ref('')
  const busy = ref(false)
  const linkVersion = ref(0)
  const bitrateLabel = ref('')

  let bound = false
  let active = false
  let seenReady = false
  let captureGen = 0
  let claimBlocked = false
  let viewStarting = false
  let pendingOffer: SignalPayload | null = null
  let iceServers: RTCIceServer[] = []
  let iceExpiry = 0
  let iceWarned = false
  let statsTimer = 0
  let lastBytes = 0
  let lastTs = 0
  let suppressEndToast = false

  function refreshLink() {
    linkVersion.value += 1
  }

  function send(type: 'signal.offer' | 'signal.answer' | 'signal.ice-candidate' | 'signal.renegotiate-ask', payload: SignalPayload) {
    signaling.send(type, payload)
  }

  const meshOptions = {
    roomId: () => room.room?.id ?? '',
    selfConnId: () => room.connId ?? '',
    iceServers: () => iceServers,
    forceRelay: () => ui.forceRelay,
    captureProfile: () => captureProfile(ui),
    videoProfile: () => videoProfile(ui),
    send,
    onChange: refreshLink,
  }
  const mesh = new PublisherMesh(meshOptions)
  const relay = new PublisherMesh(meshOptions)

  function childIds() {
    if (!room.connId) return []
    return room.viewers.filter((item) => item.parentConnId === room.connId).map((item) => item.connId)
  }

  function parentId() {
    const self = room.viewers.find((item) => item.connId === room.connId)
    return self?.parentConnId || room.share.publisherConnId || null
  }

  const viewer = new ViewerSession({
    roomId: () => room.room?.id ?? '',
    selfConnId: () => room.connId ?? '',
    publisherConnId: () => parentId(),
    iceServers: () => iceServers,
    forceRelay: () => ui.forceRelay,
    send,
    onStream: (stream) => {
      remoteStream.value = stream
      remoteHasAudio.value = stream.getAudioTracks().length > 0
      stream.onaddtrack = () => {
        remoteHasAudio.value = stream.getAudioTracks().length > 0
      }
    },
    onChange: refreshLink,
  })

  const linkLabel = computed(() => {
    linkVersion.value
    if (role.value === 'publishing') return mesh.connectionLabel()
    if (role.value === 'viewing') return viewer.label()
    return '空闲'
  })

  const iceFailed = computed(() => {
    linkVersion.value
    if (role.value === 'viewing') return viewer.pc?.iceConnectionState === 'failed'
    if (role.value === 'publishing') {
      return mesh.peerConnections().some((pc) => pc.iceConnectionState === 'failed')
    }
    return false
  })

  async function ensureIce() {
    if (iceServers.length > 0 && Date.now() < iceExpiry - 60_000) return
    try {
      const data = await api<IceServersResponse>('/api/ice/servers')
      iceServers = toIceServers(data.iceServers ?? [])
      iceExpiry = Date.now() + (data.ttlSeconds ?? 3600) * 1000
      iceWarned = false
    } catch {
      if (iceServers.length === 0 && !iceWarned) {
        iceWarned = true
        ui.notify('没拿到中继配置，将只尝试直接连接', 'warn')
      }
    }
  }

  function rememberRemote(stream: MediaStream | null) {
    remoteStream.value = stream
    remoteHasAudio.value = Boolean(stream && stream.getAudioTracks().length > 0)
    if (role.value === 'viewing' && stream) void syncRelay()
  }

  async function syncRelay() {
    if (role.value !== 'viewing' || !remoteStream.value) {
      relay.releaseLinks()
      return
    }
    relay.useForward(remoteStream.value)
    await relay.syncViewers(childIds())
  }

  function readCaptureSurface(stream: MediaStream | null) {
    const settings = stream?.getVideoTracks()[0]?.getSettings() as MediaTrackSettings & { displaySurface?: string }
    return settings?.displaySurface ?? ''
  }

  function releaseLocal() {
    captureGen += 1
    mesh.release()
    relay.releaseLinks()
    localStream.value = null
    hasAudioTrack.value = false
    captureSurface.value = ''
    if (role.value === 'publishing') role.value = 'idle'
    refreshLink()
  }

  async function beginViewing() {
    if (!active || claimBlocked || viewStarting) return
    if (role.value === 'viewing' || role.value === 'publishing') return
    viewStarting = true
    try {
      await ensureIce()
      role.value = 'viewing'
      viewer.prepare()
      const queued = pendingOffer
      pendingOffer = null
      if (queued?.sdp && queued.fromConnId) {
        await viewer.acceptOffer(queued.sdp, queued.fromConnId)
      }
      signaling.send('viewer.claim', {})
      refreshLink()
    } catch {
      viewer.close()
      role.value = 'idle'
      ui.notify('现在没法开始观看', 'error')
    } finally {
      viewStarting = false
    }
  }

  async function reconcile() {
    if (!active || !room.joined || !room.connId) return
    const share = room.share
    const self = room.connId
    const publishingSelf = share.status === 'someone_sharing' && share.publisherConnId === self
    const someoneElse = share.status === 'someone_sharing' && share.publisherConnId !== self

    if (publishingSelf) {
      claimBlocked = false
      if (role.value === 'viewing') {
        viewer.close()
        rememberRemote(null)
        role.value = 'idle'
      }
      if (role.value === 'publishing' && mesh.localStream) {
        await mesh.syncViewers(childIds())
      }
      return
    }

    if (someoneElse) {
      if (!room.audience) return
      if (role.value === 'publishing') {
        releaseLocal()
        ui.notify(shareEndText(room.shareEndedReason), 'warn')
      } else if (busy.value) {
        captureGen += 1
        ui.notify('已经有人在分享', 'warn')
      }
      const max = room.room?.maxViewers ?? 4
      if (claimBlocked && room.viewerCount < max) claimBlocked = false
      if (role.value !== 'viewing' && !claimBlocked) await beginViewing()
      if (role.value === 'viewing') await syncRelay()
      return
    }

    const suppress = suppressEndToast
    if (role.value === 'viewing') {
      viewer.close()
      rememberRemote(null)
      role.value = 'idle'
      if (!suppress) ui.notify(shareEndText(room.shareEndedReason))
      refreshLink()
    } else if (role.value === 'publishing') {
      releaseLocal()
      if (!suppress) ui.notify(shareEndText(room.shareEndedReason), 'warn')
    } else if (busy.value && room.shareEndedReason) {
      captureGen += 1
      if (!suppress) ui.notify('分享位已经释放', 'warn')
    }
    if (suppress) suppressEndToast = false
  }

  async function onOffer(payload: unknown) {
    const signal = asSignal(payload)
    if (!signal?.sdp || signal.sdp.type !== 'offer') return
    if (role.value === 'publishing') return
    const parent = parentId()
    const from = signal.fromConnId
    if (parent && from && from !== parent) return
    if (role.value === 'viewing' && viewer.ready && from) {
      try {
        await viewer.acceptOffer(signal.sdp, from)
      } catch {
        ui.notify('没能接上画面', 'error')
      }
      return
    }
    pendingOffer = signal
  }

  async function onAnswer(payload: unknown) {
    const signal = asSignal(payload)
    if (!signal?.sdp || !signal.fromConnId) return
    try {
      if (role.value === 'publishing') await mesh.acceptAnswer(signal.fromConnId, signal.sdp)
      else if (role.value === 'viewing') await relay.acceptAnswer(signal.fromConnId, signal.sdp)
    } catch {
      ui.notify('某一路观众没有接上', 'warn')
    }
  }

  async function onIce(payload: unknown) {
    const signal = asSignal(payload)
    if (!signal) return
    try {
      if (role.value === 'publishing' && signal.fromConnId) {
        await mesh.acceptIce(signal.fromConnId, signal.candidate ?? null)
      } else if (role.value === 'viewing' && signal.fromConnId && childIds().includes(signal.fromConnId)) {
        await relay.acceptIce(signal.fromConnId, signal.candidate ?? null)
      } else if (role.value === 'viewing') {
        await viewer.acceptIce(signal.candidate ?? null)
      }
    } catch {
      // 迟到的候选丢弃即可。
    }
  }

  async function onRenegotiateAsk(payload: unknown) {
    const signal = asSignal(payload)
    if (!signal?.fromConnId) return
    try {
      if (role.value === 'publishing') await mesh.renegotiate(signal.fromConnId)
      else if (role.value === 'viewing') await relay.renegotiate(signal.fromConnId)
    } catch {
      ui.notify('重新协商失败', 'error')
    }
  }

  function onViewerDenied() {
    claimBlocked = true
    if (role.value === 'viewing') {
      viewer.close()
      rememberRemote(null)
      role.value = 'idle'
      refreshLink()
    }
    ui.notify('观看人数已满（最多 4 人）', 'warn')
  }

  function onSocketReady() {
    const reconnect = seenReady
    seenReady = true
    if (!reconnect || !active) return
    const wasPublishing = role.value === 'publishing' || Boolean(mesh.localStream)
    pendingOffer = null
    claimBlocked = false
    viewer.close()
    rememberRemote(null)
    if (wasPublishing) {
      releaseLocal()
      ui.notify('连接已恢复。浏览器不允许自动继续分享，请再点一次开始分享。', 'warn')
    } else if (role.value === 'viewing') {
      role.value = 'idle'
    }
    refreshLink()
  }

  function startStats() {
    if (statsTimer) return
    lastBytes = 0
    lastTs = 0
    statsTimer = window.setInterval(() => {
      void sampleBitrate()
    }, 2000)
  }

  function stopStats() {
    window.clearInterval(statsTimer)
    statsTimer = 0
    bitrateLabel.value = ''
    lastBytes = 0
    lastTs = 0
  }

  async function sampleBitrate() {
    const pcs = role.value === 'publishing' ? mesh.peerConnections() : viewer.pc ? [viewer.pc] : []
    if (pcs.length === 0) {
      bitrateLabel.value = ''
      return
    }
    let bytes = 0
    let ts = 0
    for (const pc of pcs) {
      const stats = await pc.getStats()
      stats.forEach((report) => {
        if (report.type !== 'outbound-rtp' && report.type !== 'inbound-rtp') return
        const sample = report as RTCStats & {
          kind?: string
          bytesSent?: number
          bytesReceived?: number
        }
        if (sample.kind !== 'video') return
        if (report.type === 'outbound-rtp') bytes += sample.bytesSent ?? 0
        if (report.type === 'inbound-rtp') bytes += sample.bytesReceived ?? 0
        ts = Math.max(ts, report.timestamp)
      })
    }
    if (lastTs && ts > lastTs && bytes >= lastBytes) {
      const mbps = ((bytes - lastBytes) * 8) / ((ts - lastTs) / 1000) / 1_000_000
      bitrateLabel.value = `${mbps.toFixed(1)} Mbps`
    }
    lastBytes = bytes
    lastTs = ts
  }

  function attach() {
    active = true
    if (bound) return
    bound = true
    signaling.on('auth.ok', () => onSocketReady())
    signaling.on('signal.offer', (envelope) => {
      void onOffer(envelope.payload)
    })
    signaling.on('signal.answer', (envelope) => {
      void onAnswer(envelope.payload)
    })
    signaling.on('signal.ice-candidate', (envelope) => {
      void onIce(envelope.payload)
    })
    signaling.on('signal.renegotiate-ask', (envelope) => {
      void onRenegotiateAsk(envelope.payload)
    })
    signaling.on('viewer.denied', () => onViewerDenied())

    watch(() => room.stateVersion, () => {
      void reconcile()
    })
    watch(
      () => [ui.uploadBudgetKbps, ui.qualityBitrateKbps, ui.qualityFps, ui.qualityWidth, ui.qualityHeight, ui.qualityDegradation],
      () => {
        if (role.value === 'publishing') void mesh.applyBitrate()
        else if (role.value === 'viewing') void relay.applyBitrate()
      },
    )
    watch(() => ui.forceRelay, () => {
      void onRelayChange()
    })
    watch(role, (next) => {
      if (next === 'idle') stopStats()
      else startStats()
    })
  }

  async function onRelayChange() {
    if (!active) return
    if (role.value === 'publishing') {
      mesh.closeAll()
      await ensureIce()
      await mesh.syncViewers(childIds())
      ui.notify(ui.forceRelay ? '已改为强制走中继，正在重连观众' : '已改回自动连接，正在重连观众')
      return
    }
    if (role.value === 'viewing') {
      const publisher = room.share.publisherConnId
      if (!publisher || !room.connId || !room.room) return
      viewer.close()
      await ensureIce()
      viewer.prepare()
      signaling.send('signal.renegotiate-ask', {
        roomId: room.room.id,
        toConnId: publisher,
        fromConnId: room.connId,
      })
      ui.notify('已请求按新的网络方式重连')
    }
  }

  async function startPublish() {
    if (!active || busy.value || role.value === 'publishing') return
    if (!room.joined || !room.connId) {
      ui.notify('还没有进入房间', 'warn')
      return
    }
    if (room.share.status === 'someone_sharing' && room.share.publisherConnId !== room.connId) {
      ui.notify('已经有人在分享', 'warn')
      return
    }
    const blocked = captureBlockReason()
    if (blocked) {
      ui.notify(blocked, 'error')
      return
    }

    const my = ++captureGen
    busy.value = true
    pendingOffer = null
    suppressEndToast = false
    try {
      const response = await signaling.request('share.request', {}, ['share.granted', 'share.denied', 'error'])
      if (my !== captureGen) {
        if (response.type === 'share.granted') {
          try {
            signaling.send('share.stop', {})
          } catch {
            // 没能占住的分享位要放开。
          }
        }
        return
      }
      if (response.type === 'share.denied') {
        const reason = (response.payload as { reason?: string }).reason
        ui.notify(shareDenyText(reason), 'warn')
        return
      }
      if (response.type !== 'share.granted') {
        ui.notify('没有拿到分享位', 'error')
        return
      }

      let hasAudio = false
      try {
        hasAudio = await mesh.capture(() => {
          void onBrowserStoppedShare()
        })
      } catch (error) {
        mesh.stopCapture()
        if (my === captureGen) {
          suppressEndToast = true
          try {
            signaling.send('share.stop', {})
          } catch {
            // 槽位可能已经被服务端释放。
          }
        }
        if (isUserCancel(error)) ui.notify('已取消屏幕分享')
        else ui.notify(error instanceof Error ? error.message : '无法捕获屏幕', 'error')
        return
      }

      if (my !== captureGen) {
        mesh.stopCapture()
        try {
          signaling.send('share.stop', {})
        } catch {
          // 服务端可能已经结束这次分享。
        }
        return
      }

      await ensureIce()
      role.value = 'publishing'
      hasAudioTrack.value = hasAudio
      localStream.value = mesh.localStream
      captureSurface.value = readCaptureSurface(mesh.localStream)
      if (!hasAudio) ui.notify('这次分享没有音频，其他人只能看到画面', 'warn')
      await mesh.syncViewers(childIds())
      refreshLink()
    } catch (error) {
      ui.notify(error instanceof Error ? error.message : '开始分享失败', 'error')
    } finally {
      busy.value = false
    }
  }

  async function onBrowserStoppedShare() {
    if (role.value !== 'publishing') return
    await stopPublish()
  }

  async function stopPublish() {
    if (role.value !== 'publishing' && !mesh.localStream) return
    suppressEndToast = true
    releaseLocal()
    try {
      signaling.send('share.stop', {})
    } catch {
      // 断线时服务端会自己结束分享。
    }
  }

  async function switchSource() {
    if (role.value !== 'publishing' || busy.value) return
    busy.value = true
    try {
      const hasAudio = await mesh.replaceSource(() => {
        void onBrowserStoppedShare()
      })
      hasAudioTrack.value = hasAudio
      localStream.value = mesh.localStream
      captureSurface.value = readCaptureSurface(mesh.localStream)
      if (!hasAudio) ui.notify('这次更换后没有音频', 'warn')
    } catch (error) {
      if (!isUserCancel(error)) ui.notify('没能更换分享内容', 'error')
    } finally {
      busy.value = false
    }
  }

  function kickShare() {
    try {
      signaling.send('share.kick', {})
    } catch {
      ui.notify('现在发不出结束指令', 'error')
    }
  }

  function watchShare() {
    claimBlocked = false
    void beginViewing()
  }

  function askRenegotiate() {
    const publisher = room.share.publisherConnId
    if (role.value !== 'viewing' || !publisher || !room.connId || !room.room) return
    signaling.send('signal.renegotiate-ask', {
      roomId: room.room.id,
      toConnId: publisher,
      fromConnId: room.connId,
    })
    ui.notify('已请求重新连接')
  }

  function shutdown() {
    active = false
    seenReady = false
    claimBlocked = false
    pendingOffer = null
    viewStarting = false
    busy.value = false
    stopStats()
    if (role.value === 'publishing' || mesh.localStream) {
      try {
        signaling.send('share.stop', {})
      } catch {
        // 退出时连接可能已经关闭。
      }
    } else if (role.value === 'viewing') {
      try {
        signaling.send('viewer.release', {})
      } catch {
        // 同上。
      }
    }
    captureGen += 1
    mesh.release()
    viewer.close()
    localStream.value = null
    rememberRemote(null)
    hasAudioTrack.value = false
    captureSurface.value = ''
    role.value = 'idle'
    refreshLink()
  }

  return {
    role,
    localStream,
    remoteStream,
    hasAudioTrack,
    remoteHasAudio,
    captureSurface,
    busy,
    linkLabel,
    iceFailed,
    bitrateLabel,
    attach,
    startPublish,
    stopPublish,
    switchSource,
    kickShare,
    watchShare,
    askRenegotiate,
    shutdown,
  }
})
