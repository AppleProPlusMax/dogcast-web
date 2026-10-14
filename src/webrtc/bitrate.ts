const MIN_BITRATE_BPS = 8_000_000

function scaleDownTo1080p(width: number, height: number) {
  const factor = Math.min(width / 1920, height / 1080)
  return Math.max(factor, 1)
}

export async function setVideoMaxBitrate(pc: RTCPeerConnection, kbps: number) {
  const maxBitrate = Math.max(Math.round(kbps * 1000), MIN_BITRATE_BPS)
  await Promise.all(
    pc.getSenders().map(async (sender) => {
      if (sender.track?.kind !== 'video') return
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
      const encoding = params.encodings[0] as RTCRtpEncodingParameters & { minBitrate?: number }
      if (!encoding) return
      const settings = sender.track.getSettings()
      encoding.maxBitrate = maxBitrate
      encoding.minBitrate = Math.min(6_000_000, maxBitrate)
      encoding.maxFramerate = 60
      encoding.scaleResolutionDownBy = scaleDownTo1080p(settings.width ?? 1920, settings.height ?? 1080)
      params.degradationPreference = 'maintain-resolution'
      try {
        await sender.setParameters(params)
      } catch {
        // 连接还没就绪时浏览器会拒绝，连上后再设一次。
      }
    }),
  )
}

export function serializeCandidate(candidate: RTCIceCandidate): RTCIceCandidateInit {
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  }
}
