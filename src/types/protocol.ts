export type ShareStatus = 'idle' | 'someone_sharing'
export type UserRole = 'admin' | 'member'
export type RoomMemberRole = 'owner' | 'member'

export type WsType =
  | 'auth'
  | 'auth.ok'
  | 'auth.error'
  | 'session.replaced'
  | 'room.join'
  | 'room.leave'
  | 'room.snapshot'
  | 'presence.joined'
  | 'presence.left'
  | 'share.request'
  | 'share.granted'
  | 'share.denied'
  | 'share.started'
  | 'share.stop'
  | 'share.ended'
  | 'share.kick'
  | 'viewer.claim'
  | 'viewer.release'
  | 'viewer.denied'
  | 'viewer.updated'
  | 'signal.offer'
  | 'signal.answer'
  | 'signal.ice-candidate'
  | 'signal.renegotiate-ask'
  | 'ping'
  | 'pong'
  | 'error'

export interface Envelope<T = unknown> {
  v: 1
  type: WsType | string
  requestId?: string
  ts?: number
  payload: T
}

export interface User {
  id: string
  username: string
  displayName: string
  role: UserRole
}

export interface AuthResponse {
  accessToken: string
  tokenType?: string
  expiresIn?: number
  user?: User
}

export interface Room {
  id: string
  slug: string
  name: string
  maxViewers: number
}

export interface Membership {
  role: RoomMemberRole
}

export interface DefaultRoomResponse {
  room: Room
  membership: Membership
}

export interface MemberOnline {
  userId: string
  connId: string
  displayName: string
}

export interface ViewerRef {
  userId: string
  connId: string
  parentConnId?: string | null
}

export interface ShareState {
  status: ShareStatus
  publisherUserId?: string
  publisherConnId?: string
  displayName?: string
  startedAt?: number
}

export interface RoomSnapshot {
  room: Room
  self: { userId: string; connId: string }
  membersOnline: MemberOnline[]
  share: ShareState
  viewers: ViewerRef[]
  viewerCount: number
}

export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface IceServersResponse {
  iceServers: IceServer[]
  ttlSeconds?: number
}

export interface SignalPayload {
  roomId: string
  toConnId: string
  fromConnId?: string
  sdp?: { type: 'offer' | 'answer'; sdp: string }
  candidate?: RTCIceCandidateInit | null
}

export interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}
