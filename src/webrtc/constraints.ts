type CaptureOptions = DisplayMediaStreamOptions & {
  systemAudio?: 'include' | 'exclude'
  selfBrowserSurface?: 'include' | 'exclude'
  surfaceSwitching?: 'include' | 'exclude'
}

const videoConstraints: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 60 },
}

export function isUserCancel(error: unknown) {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')
}

export async function captureDisplay(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('这个浏览器不能分享屏幕')
  }
  if (!window.isSecureContext) {
    throw new Error('分享屏幕需要 HTTPS 或 localhost')
  }

  const rich: CaptureOptions = {
    video: videoConstraints,
    audio: true,
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  }

  try {
    return await navigator.mediaDevices.getDisplayMedia(rich)
  } catch (error) {
    if (isUserCancel(error)) throw error
    return navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
      audio: true,
    })
  }
}
