import type { SignalPayload } from '@/types/protocol'
import { captureDisplay, type CaptureProfile } from '@/webrtc/constraints'
import { planVideoBitrate, serializeCandidate, setVideoMaxBitrate, withVideoBitrate, type VideoEncodeProfile } from '@/webrtc/bitrate'

type OutboundType = 'signal.offer' | 'signal.ice-candidate'

export interface MeshOptions {
  roomId: () => string
  selfConnId: () => string
  iceServers: () => RTCIceServer[]
  forceRelay: () => boolean
  captureProfile: () => CaptureProfile
  videoProfile: () => VideoEncodeProfile
  send: (type: OutboundType, payload: SignalPayload) => void
  onChange: () => void
}

interface Slot {
  pc: RTCPeerConnection
  pending: RTCIceCandidateInit[]
  remoteReady: boolean
}

export class PublisherMesh {
  localStream: MediaStream | null = null
  private slots = new Map<string, Slot>()
  private syncing: Promise<void> = Promise.resolve()
  private ignoreEnded = false

  constructor(private opts: MeshOptions) {}

  get hasAudio() {
    return (this.localStream?.getAudioTracks().length ?? 0) > 0
  }

  connectionLabel() {
    const slots = [...this.slots.values()]
    if (slots.length === 0) return '等待观众'
    const up = slots.filter((slot) => {
      const state = slot.pc.iceConnectionState
      return state === 'connected' || state === 'completed'
    }).length
    const failed = slots.some((slot) => slot.pc.iceConnectionState === 'failed')
    if (failed) return `有观众连接失败 ${up}/${slots.length}`
    return `观众连接 ${up}/${slots.length}`
  }

  peerConnections() {
    return [...this.slots.values()].map((slot) => slot.pc)
  }

  async capture(onEnded: () => void) {
    const stream = await captureDisplay(this.opts.captureProfile())
    this.adopt(stream, onEnded)
    return this.hasAudio
  }

  useForward(stream: MediaStream) {
    this.ignoreEnded = true
    this.localStream = stream
  }

  releaseLinks() {
    this.closeAll()
    this.localStream = null
  }

  stopCapture() {
    this.ignoreEnded = true
    this.localStream?.getTracks().forEach((track) => track.stop())
    this.localStream = null
  }

  closeAll() {
    for (const id of [...this.slots.keys()]) this.closeOne(id)
  }

  release() {
    this.closeAll()
    this.stopCapture()
  }

  syncViewers(connIds: string[]) {
    const ids = connIds.filter((id) => id && id !== this.opts.selfConnId())
    this.syncing = this.syncing.then(() => this.syncNow(ids)).catch(() => undefined)
    return this.syncing
  }

  async acceptAnswer(fromConnId: string, description: RTCSessionDescriptionInit) {
    const slot = this.slots.get(fromConnId)
    if (!slot) return
    // Chrome 用远端 answer 里的 b=AS / x-google-*-bitrate 决定发送起点。
    // 只改本地 offer 时，这些参数不会留在协商结果里，屏幕分享会从约 30 kbps 起爬。
    const plan = this.bitratePlan()
    const sdp = description.sdp
      ? withVideoBitrate(description.sdp, plan.ceilingKbps, plan.targetKbps)
      : description.sdp
    await slot.pc.setRemoteDescription({ type: description.type, sdp })
    slot.remoteReady = true
    const queued = slot.pending.splice(0)
    for (const candidate of queued) await slot.pc.addIceCandidate(candidate)
    await setVideoMaxBitrate(slot.pc, plan.profile)
  }

  async acceptIce(fromConnId: string, candidate: RTCIceCandidateInit | null) {
    if (!candidate) return
    const slot = this.slots.get(fromConnId)
    if (!slot) return
    if (!slot.remoteReady) {
      slot.pending.push(candidate)
      return
    }
    await slot.pc.addIceCandidate(candidate)
  }

  async renegotiate(connId?: string) {
    const targets = connId ? [connId] : [...this.slots.keys()]
    for (const id of targets) {
      const slot = this.slots.get(id)
      if (!slot) continue
      await this.sendOffer(slot.pc, id)
    }
  }

  async applyBitrate() {
    const profile = this.bitratePlan().profile
    await Promise.all([...this.slots.values()].map((slot) => setVideoMaxBitrate(slot.pc, profile)))
  }

  async replaceSource(onEnded: () => void) {
    const next = await captureDisplay(this.opts.captureProfile())
    const previous = this.localStream
    const hadAudio = this.hasAudio
    this.adopt(next, onEnded)
    let audioChanged = hadAudio !== this.hasAudio

    for (const slot of this.slots.values()) {
      const senders = slot.pc.getSenders()
      for (const track of next.getTracks()) {
        const sender = senders.find((item) => item.track?.kind === track.kind)
        if (sender) await sender.replaceTrack(track)
        else {
          slot.pc.addTrack(track, next)
          audioChanged = true
        }
      }
      if (next.getAudioTracks().length === 0) {
        for (const sender of [...slot.pc.getSenders()]) {
          if (sender.track?.kind === 'audio') {
            slot.pc.removeTrack(sender)
            audioChanged = true
          }
        }
      }
    }

    this.ignoreEnded = true
    previous?.getTracks().forEach((track) => track.stop())
    this.ignoreEnded = false

    if (audioChanged) await this.renegotiate()
    else await this.applyBitrate()
    this.opts.onChange()
    return this.hasAudio
  }

  private adopt(stream: MediaStream, onEnded: () => void) {
    this.localStream = stream
    this.ignoreEnded = false
    const video = stream.getVideoTracks()[0]
    video?.addEventListener('ended', () => {
      if (this.ignoreEnded) return
      if (this.localStream !== stream) return
      onEnded()
    })
  }

  private async syncNow(ids: string[]) {
    if (!this.localStream) return
    const want = new Set(ids)
    for (const id of [...this.slots.keys()]) {
      if (!want.has(id)) this.closeOne(id)
    }
    for (const id of want) {
      if (!this.slots.has(id)) await this.offerTo(id)
    }
    await this.applyBitrate()
  }

  private async offerTo(viewerConnId: string) {
    const stream = this.localStream
    if (!stream || this.slots.has(viewerConnId)) return
    const pc = this.makePc()
    const slot: Slot = { pc, pending: [], remoteReady: false }
    this.slots.set(viewerConnId, slot)
    this.watchPc(pc)

    try {
      for (const track of stream.getTracks()) pc.addTrack(track, stream)
      pc.onicecandidate = (event) => {
        this.opts.send('signal.ice-candidate', {
          roomId: this.opts.roomId(),
          toConnId: viewerConnId,
          fromConnId: this.opts.selfConnId(),
          candidate: event.candidate ? serializeCandidate(event.candidate) : null,
        })
      }
      await this.sendOffer(pc, viewerConnId)
      this.opts.onChange()
    } catch (error) {
      this.closeOne(viewerConnId)
      throw error
    }
  }

  private closeOne(id: string) {
    const slot = this.slots.get(id)
    if (!slot) return
    slot.pc.onicecandidate = null
    slot.pc.onconnectionstatechange = null
    slot.pc.oniceconnectionstatechange = null
    slot.pc.close()
    this.slots.delete(id)
    this.opts.onChange()
  }

  private bitratePlan() {
    return planVideoBitrate(this.opts.videoProfile(), this.slots.size)
  }

  private async sendOffer(pc: RTCPeerConnection, viewerConnId: string) {
    const offer = await pc.createOffer()
    const plan = this.bitratePlan()
    const sdp = withVideoBitrate(offer.sdp ?? '', plan.ceilingKbps, plan.targetKbps)
    await pc.setLocalDescription({ type: 'offer', sdp })
    await setVideoMaxBitrate(pc, plan.profile)
    this.opts.send('signal.offer', {
      roomId: this.opts.roomId(),
      toConnId: viewerConnId,
      fromConnId: this.opts.selfConnId(),
      sdp: { type: 'offer', sdp: pc.localDescription?.sdp ?? sdp },
    })
  }

  private makePc() {
    return new RTCPeerConnection({
      iceServers: this.opts.iceServers(),
      iceTransportPolicy: this.opts.forceRelay() ? 'relay' : 'all',
    })
  }

  private watchPc(pc: RTCPeerConnection) {
    const bump = () => {
      this.opts.onChange()
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        void setVideoMaxBitrate(pc, this.bitratePlan().profile)
      }
    }
    pc.onconnectionstatechange = bump
    pc.oniceconnectionstatechange = bump
  }
}
