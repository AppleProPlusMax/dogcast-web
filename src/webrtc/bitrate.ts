export async function setVideoMaxBitrate(pc: RTCPeerConnection, kbps: number) {
  const maxBitrate = Math.round(kbps * 1000)
  await Promise.all(
    pc.getSenders().map(async (sender) => {
      if (sender.track?.kind !== 'video') return
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
      const encoding = params.encodings[0]
      if (!encoding) return
      encoding.maxBitrate = maxBitrate
      params.degradationPreference = 'balanced'
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
