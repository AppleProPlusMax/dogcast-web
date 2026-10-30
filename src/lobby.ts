const KEY = 'dogcast.lobby'

export interface LobbySession {
  accessToken: string
  code: string
  roomName: string
}

export function readLobby(): LobbySession | null {
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Partial<LobbySession>
    if (!data.accessToken || !data.code) return null
    return { accessToken: data.accessToken, code: data.code, roomName: data.roomName || data.code }
  } catch {
    return null
  }
}

export function saveLobby(session: LobbySession) {
  sessionStorage.setItem(KEY, JSON.stringify(session))
}

export function watchUrl(code: string) {
  return `${location.origin}/watch/${code}`
}
