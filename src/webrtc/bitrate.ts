const PER_VIEWER_MIN_KBPS = 3_000
const PER_VIEWER_MAX_KBPS = 20_000
const MIN_BITRATE_BPS = 1_000_000

export function perViewerBitrateKbps(totalKbps: number, viewerCount: number) {
  const viewers = Math.max(1, viewerCount)
  const share = Math.round(totalKbps / viewers)
  return Math.min(PER_VIEWER_MAX_KBPS, Math.max(PER_VIEWER_MIN_KBPS, share))
}

function scaleDown(width: number, height: number, targetWidth: number, targetHeight: number) {
  const factor = Math.min(width / targetWidth, height / targetHeight)
  return Math.max(factor, 1)
}

export interface VideoEncodeProfile {
  width: number
  height: number
  fps: number
  bitrateKbps: number
  degradation: 'maintain-resolution' | 'balanced' | 'maintain-framerate'
}

export async function setVideoMaxBitrate(pc: RTCPeerConnection, profile: VideoEncodeProfile) {
  const maxBitrate = Math.round(profile.bitrateKbps * 1000)
  await Promise.all(
    pc.getSenders().map(async (sender) => {
      if (sender.track?.kind !== 'video') return
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
      const encoding = params.encodings[0] as RTCRtpEncodingParameters & { minBitrate?: number }
      if (!encoding) return
      const settings = sender.track.getSettings()
      encoding.maxBitrate = maxBitrate
      encoding.minBitrate = Math.min(MIN_BITRATE_BPS, maxBitrate)
      encoding.maxFramerate = profile.fps
      encoding.scaleResolutionDownBy = scaleDown(
        settings.width ?? profile.width,
        settings.height ?? profile.height,
        profile.width,
        profile.height,
      )
      params.degradationPreference = profile.degradation
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
