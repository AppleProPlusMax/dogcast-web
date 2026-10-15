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

async function raiseCaptureQuality(stream: MediaStream) {
  const video = stream.getVideoTracks()[0]
  if (!video) return

  const strictFps: MediaTrackConstraints = { frameRate: { min: 45, ideal: 60, max: 60 } }
  const looseFps: MediaTrackConstraints = { frameRate: { ideal: 60, max: 60 } }
  let fps: MediaTrackConstraints = {}
  if (await tryApply(video, strictFps)) fps = strictFps
  else if (await tryApply(video, looseFps)) fps = looseFps

  const strictSize: MediaTrackConstraints = {
    width: { min: 1920, ideal: 1920 },
    height: { min: 1080, ideal: 1080 },
  }
  const looseSize: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  }
  if (!(await tryApply(video, { ...fps, ...strictSize }))) {
    await tryApply(video, { ...fps, ...looseSize })
  }
}

async function captureOnce(audio: boolean) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio,
  })
  await raiseCaptureQuality(stream)
  return stream
}

export async function captureDisplay(): Promise<MediaStream> {
  const blocked = captureBlockReason()
  if (blocked) throw new Error(blocked)

  // 弹窗里不带分辨率和帧率，避免勾选系统音频时 Chrome 整次失败。
  // 拿到画面后再分别提高帧率和分辨率，一项失败不会把另一项一起丢掉。
  try {
    return await captureOnce(true)
  } catch (error) {
    if (isUserCancel(error)) throw error
    if (!isAudioSourceFailure(error)) {
      throw error instanceof Error ? error : new Error('无法捕获屏幕')
    }
  }

  // 系统音频打不开时，再要一次只有画面的分享，不取消整次分享。
  try {
    return await captureOnce(false)
  } catch (error) {
    if (isUserCancel(error)) throw error
    throw error instanceof Error ? error : new Error('无法捕获屏幕')
  }
}
