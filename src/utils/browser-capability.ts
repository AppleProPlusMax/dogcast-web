export interface BrowserCapability {
  browser: string
  os: string
  secure: boolean
  canCapture: boolean
  recommended: boolean
  summary: string
  audioAdvice: string
}

export function detectCapability(): BrowserCapability {
  const ua = navigator.userAgent
  const isEdge = ua.includes('Edg/')
  const isChrome = ua.includes('Chrome/') && !isEdge && !ua.includes('OPR/')
  const isFirefox = ua.includes('Firefox/')
  const isSafari = ua.includes('Safari/') && !ua.includes('Chrome/') && !ua.includes('Chromium')
  const isWindows = ua.includes('Windows')
  const isMac = /Mac OS|Macintosh/.test(ua)
  const browser = isEdge ? 'Edge' : isChrome ? 'Chrome' : isFirefox ? 'Firefox' : isSafari ? 'Safari' : '当前浏览器'
  const os = isWindows ? 'Windows' : isMac ? 'macOS' : '当前系统'
  const chromium = isChrome || isEdge
  const recommended = chromium && isWindows
  const canCapture = typeof navigator.mediaDevices?.getDisplayMedia === 'function' && window.isSecureContext

  let audioAdvice = '分享时请在浏览器弹窗里勾选「分享音频」。没勾选时，其他人只能看到画面。'
  if (recommended) {
    audioAdvice = '推荐路径：用 Chrome 或 Edge 分享整个屏幕或窗口，并勾选「分享系统音频」。'
  } else if (chromium && isMac) {
    audioAdvice = '在 Mac 上，分享某个标签页并勾选标签页音频更稳。整个屏幕的系统声音不一定能采到。'
  } else if (isFirefox || isSafari) {
    audioAdvice = '这个浏览器可以尝试观看。用它分享时，系统音频不保证能采到。'
  }

  const summary = recommended
    ? `${browser} · ${os}，适合作为分享端`
    : `${browser} · ${os}`

  return {
    browser,
    os,
    secure: window.isSecureContext,
    canCapture,
    recommended,
    summary,
    audioAdvice,
  }
}
