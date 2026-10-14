type CaptureOptions = DisplayMediaStreamOptions & {
  systemAudio?: 'include' | 'exclude'
  selfBrowserSurface?: 'include' | 'exclude'
  surfaceSwitching?: 'include' | 'exclude'
}

const videoConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30, max: 60 },
  displaySurface: 'monitor',
} as MediaTrackConstraints

export function isUserCancel(error: unknown) {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')
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

  // 只请求一次。失败后再调 getDisplayMedia 会再弹一个系统选择框。
  // 不传 systemAudio: 'include'，否则这台电脑会在确认后启动音频设备失败，整次分享被浏览器取消。
  const options: CaptureOptions = {
    video: videoConstraints,
    audio: true,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  }

  try {
    return await navigator.mediaDevices.getDisplayMedia(options)
  } catch (error) {
    if (isUserCancel(error)) throw error
    if (isAudioSourceFailure(error)) {
      throw new Error('系统音频打不开。请再点一次分享，并在弹窗里关闭「带系统音频分享」。')
    }
    throw error instanceof Error ? error : new Error('无法捕获屏幕')
  }
}
