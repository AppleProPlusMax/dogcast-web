import { captureBlockReason } from '@/utils/browser-capability'

export function isUserCancel(error: unknown) {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')
}

function isAudioSourceFailure(error: unknown) {
  if (!(error instanceof DOMException)) return false
  return error.name === 'NotReadableError' || /audio source/i.test(error.message)
}

async function tryApply(video: MediaStreamTrack, constraints: MediaTrackConstraints) {
  try {
    await video.applyConstraints(constraints)
    return true
  } catch {
    return false
  }
}

async function applyProfile(stream: MediaStream, profile: CaptureProfile) {
  const video = stream.getVideoTracks()[0]
  if (!video) return
  video.contentHint = profile.degradation === 'maintain-framerate' ? 'motion' : 'detail'
  await tryApply(video, {
    width: { ideal: profile.width, max: profile.width },
    height: { ideal: profile.height, max: profile.height },
    frameRate: { ideal: profile.fps, max: profile.fps },
  })
}

async function captureOnce(audio: boolean, profile: CaptureProfile) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio,
  })
  await applyProfile(stream, profile)
  return stream
}

export interface CaptureProfile {
  width: number
  height: number
  fps: number
  degradation: 'maintain-resolution' | 'balanced' | 'maintain-framerate'
  systemAudio: boolean
  microphone: boolean
}

export async function captureDisplay(profile: CaptureProfile): Promise<MediaStream> {
  const blocked = captureBlockReason()
  if (blocked) throw new Error(blocked)

  let stream: MediaStream
  if (!profile.systemAudio) {
    stream = await captureOnce(false, profile)
  } else {
    try {
      stream = await captureOnce(true, profile)
    } catch (error) {
      if (isUserCancel(error)) throw error
      if (!isAudioSourceFailure(error)) throw error instanceof Error ? error : new Error('无法捕获屏幕')
      stream = await captureOnce(false, profile)
    }
  }

  if (profile.microphone) {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      for (const track of mic.getAudioTracks()) stream.addTrack(track)
    } catch (error) {
      if (isUserCancel(error)) throw error
    }
  }
  return stream
}
