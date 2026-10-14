import type { SignalPayload } from '@/types/protocol'
import { serializeCandidate } from '@/webrtc/bitrate'

type ViewerOutbound = 'signal.answer' | 'signal.ice-candidate'

export interface ViewerOptions {
  roomId: () => string
  selfConnId: () => string
  publisherConnId: () => string | null
  iceServers: () => RTCIceServer[]
  forceRelay: () => boolean
  send: (type: ViewerOutbound, payload: SignalPayload) => void
  onStream: (stream: MediaStream) => void
  onChange: () => void
}

export class ViewerSession {
  pc: RTCPeerConnection | null = null
  remoteStream = new MediaStream()
  private pending: RTCIceCandidateInit[] = []
  private remoteReady = false
  private answering = false

  constructor(private opts: ViewerOptions) {}

  get ready() {
    return Boolean(this.pc && this.pc.connectionState !== 'closed')
  }

  label() {
    const state = this.pc?.iceConnectionState
    switch (state) {
      case 'checking':
        return '正在连接'
      case 'connected':
      case 'completed':
        return '已连接'
      case 'disconnected':
        return '连接中断'
      case 'failed':
        return '连接失败'
      case 'closed':
        return '已关闭'
      default:
        return '等待画面'
    }
  }

  prepare() {
    this.close()
    const pc = new RTCPeerConnection({
      iceServers: this.opts.iceServers(),
      iceTransportPolicy: this.opts.forceRelay() ? 'relay' : 'all',
    })
    this.pc = pc
    this.remoteReady = false
    this.pending = []
    this.remoteStream = new MediaStream()

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? this.remoteStream
      if (!event.streams[0]) stream.addTrack(event.track)
      this.remoteStream = stream
      this.opts.onStream(stream)
    }
    pc.onicecandidate = (event) => {
      const publisher = this.opts.publisherConnId()
      if (!publisher) return
      this.opts.send('signal.ice-candidate', {
        roomId: this.opts.roomId(),
        toConnId: publisher,
        fromConnId: this.opts.selfConnId(),
        candidate: event.candidate ? serializeCandidate(event.candidate) : null,
      })
    }
    pc.onconnectionstatechange = () => this.opts.onChange()
    pc.oniceconnectionstatechange = () => this.opts.onChange()
    this.opts.onChange()
  }

  async acceptOffer(sdp: RTCSessionDescriptionInit, fromConnId: string) {
    if (!this.ready) this.prepare()
    const pc = this.pc
    if (!pc) return
    if (this.answering) return
    this.answering = true
    try {
      await pc.setRemoteDescription(sdp)
      this.remoteReady = true
      const queued = this.pending.splice(0)
      for (const candidate of queued) await pc.addIceCandidate(candidate)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.opts.send('signal.answer', {
        roomId: this.opts.roomId(),
        toConnId: fromConnId,
        fromConnId: this.opts.selfConnId(),
        sdp: { type: 'answer', sdp: pc.localDescription?.sdp ?? answer.sdp ?? '' },
      })
      this.opts.onChange()
    } finally {
      this.answering = false
    }
  }

  async acceptIce(candidate: RTCIceCandidateInit | null) {
    if (!candidate) return
    const pc = this.pc
    if (!pc || !this.remoteReady) {
      this.pending.push(candidate)
      return
    }
    await pc.addIceCandidate(candidate)
  }

  close() {
    const pc = this.pc
    this.pc = null
    this.remoteReady = false
    this.pending = []
    if (!pc) return
    pc.ontrack = null
    pc.onicecandidate = null
    pc.onconnectionstatechange = null
    pc.oniceconnectionstatechange = null
    pc.close()
    this.opts.onChange()
  }
}
