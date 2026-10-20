const PER_VIEWER_MIN_KBPS = 3_000
const PER_VIEWER_MAX_KBPS = 20_000

export function perViewerBitrateKbps(totalKbps: number, viewerCount: number) {
  const viewers = Math.max(1, viewerCount)
  const share = Math.round(totalKbps / viewers)
  return Math.min(PER_VIEWER_MAX_KBPS, Math.max(PER_VIEWER_MIN_KBPS, share))
}

export interface BitratePlan {
  profile: VideoEncodeProfile
  ceilingKbps: number
  targetKbps: number
}

export function planVideoBitrate(requested: VideoEncodeProfile, viewerCount: number): BitratePlan {
  const ceilingKbps = perViewerBitrateKbps(requested.uploadBudgetKbps, viewerCount)
  const targetKbps = Math.min(requested.bitrateKbps, ceilingKbps)
  return {
    profile: { ...requested, bitrateKbps: targetKbps },
    ceilingKbps,
    targetKbps,
  }
}

// Chrome 对屏幕分享默认从大约 0.3 Mbps 起步，不写进 SDP 时经常停在这个起点。
export function withVideoBitrate(sdp: string, ceilingKbps: number, targetKbps: number) {
  const max = Math.max(300, Math.round(ceilingKbps))
  const start = Math.max(300, Math.min(max, Math.round(targetKbps)))
  const min = Math.max(300, Math.min(start, Math.round(start * 0.25)))
  const hint = `x-google-max-bitrate=${max};x-google-start-bitrate=${start};x-google-min-bitrate=${min}`
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n'
  const trailing = /\r?\n$/.test(sdp)
  const lines = sdp.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  const out: string[] = []
  let video = false
  let addedBandwidth = false
  const payloads: string[] = []
  const fmtpPayloads = new Set<string>()

  for (const line of lines) {
    if (line.startsWith('m=')) {
      if (video) appendMissingFmtp(out, payloads, fmtpPayloads, hint)
      video = line.startsWith('m=video')
      addedBandwidth = false
      payloads.length = 0
      fmtpPayloads.clear()
      out.push(line)
      continue
    }
    if (!video) {
      out.push(line)
      continue
    }
    if (line.startsWith('b=AS:') || line.startsWith('b=TIAS:')) continue
    const payload = line.match(/^a=rtpmap:(\d+)\s/)
    if (payload?.[1]) payloads.push(payload[1])
    if (line.startsWith('a=fmtp:')) {
      const id = line.slice('a=fmtp:'.length).split(/\s/)[0]
      if (id) fmtpPayloads.add(id)
      out.push(withFmtpHint(line, hint))
      continue
    }
    out.push(line)
    if (line.startsWith('c=') && !addedBandwidth) {
      out.push(`b=AS:${max}`)
      addedBandwidth = true
    }
  }
  if (video) appendMissingFmtp(out, payloads, fmtpPayloads, hint)
  return out.join(eol) + (trailing ? eol : '')
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
  uploadBudgetKbps: number
  degradation: 'maintain-resolution' | 'balanced' | 'maintain-framerate'
}

function stripGoogleBitrate(value: string) {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !/^x-google-(max|start|min)-bitrate=/.test(part))
    .join(';')
}

function withFmtpHint(line: string, hint: string) {
  const match = line.match(/^a=fmtp:(\d+)\s*(.*)$/)
  if (!match?.[1]) return line
  const rest = stripGoogleBitrate(match[2] ?? '')
  return rest ? `a=fmtp:${match[1]} ${rest};${hint}` : `a=fmtp:${match[1]} ${hint}`
}

function appendMissingFmtp(out: string[], payloads: string[], seen: Set<string>, hint: string) {
  for (const id of payloads) {
    if (seen.has(id)) continue
    out.push(`a=fmtp:${id} ${hint}`)
    seen.add(id)
  }
}

export async function setVideoMaxBitrate(pc: RTCPeerConnection, profile: VideoEncodeProfile) {
  const maxBitrate = Math.round(profile.bitrateKbps * 1000)
  await Promise.all(
    pc.getSenders().map(async (sender) => {
      if (sender.track?.kind !== 'video') return
      const settings = sender.track.getSettings()
      const scale = scaleDown(
        settings.width || profile.width,
        settings.height || profile.height,
        profile.width,
        profile.height,
      )
      const applied = await writeEncoding(sender, profile, {
        maxBitrate,
        maxFramerate: profile.fps,
        scaleResolutionDownBy: scale,
        priority: 'high',
        networkPriority: 'high',
      })
      if (!applied) await writeEncoding(sender, null, { maxBitrate })
    }),
  )
}

async function writeEncoding(
  sender: RTCRtpSender,
  profile: VideoEncodeProfile | null,
  patch: RTCRtpEncodingParameters,
) {
  try {
    const params = sender.getParameters()
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
    const encoding = params.encodings[0]
    if (!encoding) return false
    Object.assign(encoding, patch)
    if (profile) params.degradationPreference = profile.degradation
    await sender.setParameters(params)
    return true
  } catch {
    return false
  }
}

export function serializeCandidate(candidate: RTCIceCandidate): RTCIceCandidateInit {
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  }
}
