export type IceRoute = 'publish' | 'relay' | 'viewer' | 'ignore'

export function routeSignalIce(input: {
  role: 'idle' | 'publishing' | 'viewing'
  fromConnId?: string
  parentConnId: string | null
  childConnIds: readonly string[]
}): IceRoute {
  const from = input.fromConnId
  if (input.role === 'publishing') return from ? 'publish' : 'ignore'
  if (input.role !== 'viewing' || !from) return 'ignore'
  if (input.childConnIds.includes(from)) return 'relay'
  if (!input.parentConnId || from === input.parentConnId) return 'viewer'
  return 'ignore'
}
