export function apiUrl(path: string) {
  const base = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalized}`
}

export function wsUrl() {
  const explicit = import.meta.env.VITE_WS_BASE
  if (explicit) {
    const base = explicit.replace(/\/$/, '')
    return base.endsWith('/ws') ? base : `${base}/ws`
  }

  const apiBase = import.meta.env.VITE_API_BASE
  if (apiBase) {
    const url = new URL(apiBase, window.location.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/ws'
    url.search = ''
    url.hash = ''
    return url.toString()
  }

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}
