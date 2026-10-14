export function isUserCancel(error: unknown) {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')
}

async function raiseCaptureQuality(stream: MediaStream) {
  const video = stream.getVideoTracks()[0]
  if (!video) return
  video.contentHint = 'detail'
  const fullHd: MediaTrackConstraints = {
    width: { min: 1920, ideal: 1920 },
    height: { min: 1080, ideal: 1080 },
    frameRate: { min: 45, ideal: 60, max: 60 },
  }
  try {
    await video.applyConstraints(fullHd)
  } catch {
    try {
      await video.applyConstraints({
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60, max: 60 },
      })
    } catch {
      // 窗口小于 1080p 或浏览器不接受下限时，保留已经采到的画面。
    }
  }
}

function isAudioSourceFailure(error: unknown) {
  if (!(error instanceof DOMException)) return false
  return error.name === 'NotReadableError' || /audio source/i.test(error.message)
}

export async function captureDisplay(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('这个浏览器不能分享屏幕')
  }
  if (!window.isSecureContext) {
    throw new Error('分享屏幕需要 HTTPS 或 localhost')
  }

  // 弹窗请求里不要带分辨率和帧率，否则勾选系统音频时 Chrome 会整次失败。
  // 画面拿到后再锁定到 1080p，帧率尽量 45 以上、靠近 60。
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    })
    await raiseCaptureQuality(stream)
    return stream
  } catch (error) {
    if (isUserCancel(error)) throw error
    if (isAudioSourceFailure(error)) {
      throw new Error('系统音频打不开。请再点一次分享，并在弹窗里关闭「带系统音频分享」。')
    }
    throw error instanceof Error ? error : new Error('无法捕获屏幕')
  }
}
