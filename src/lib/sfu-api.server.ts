import { z } from 'zod'

const id = z.string().min(1).max(256).refine(value => value !== '.' && value !== '..')
const name = z.string().min(1).max(1024)
const description = z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().min(1).max(1_000_000) })
const track = z.discriminatedUnion('location', [
  z.object({ location: z.literal('local'), mid: name, trackName: name }),
  z.object({ location: z.literal('remote'), sessionId: id, trackName: name }),
])
const endpoint = z.string().max(4096).refine(value => {
  try {
    const url = new URL(value)
    return url.protocol === 'wss:' && !!url.hostname && !url.username && !url.password && !url.hash
  } catch { return false }
})
const adapter = z.discriminatedUnion('location', [
  z.object({ location: z.literal('local'), trackName: name, endpoint }),
  z.object({ location: z.literal('remote'), sessionId: id, trackName: name, endpoint }),
])
const resource = z.object({
  trackName: name.optional(), mid: name.optional(), location: z.enum(['local', 'remote']).optional(),
  sessionId: id.optional(), adapterId: id.optional(), endpoint: z.string().optional(),
  errorCode: z.string().optional(), errorDescription: z.string().optional(),
})
const result = z.object({
  errorCode: z.string().optional(), errorDescription: z.string().optional(),
  tracks: z.array(resource).optional(), sessionDescription: description.optional(),
  requiresImmediateRenegotiation: z.boolean().optional(), sessionId: id.optional(),
})

export class SfuApiError extends Error {
  constructor(message: string, readonly status?: number, readonly adapterId?: string) { super(message) }
}

// Each allocation is requested separately so successful IDs cannot be lost in a partial batch.
export function createSfuApi(options: { appId: string; appSecret: string; fetcher?: typeof fetch }) {
  const appId = id.parse(options.appId)
  if (!options.appSecret.trim()) throw new Error('Invalid SFU app secret')
  const base = `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(appId)}`

  async function request(path: string, method: 'POST' | 'PUT', body?: unknown) {
    const response = await (options.fetcher ?? fetch)(`${base}${path}`, {
      method, headers: { Authorization: `Bearer ${options.appSecret}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(15_000),
    })
    let data: unknown
    try { data = await response.json() } catch { throw new SfuApiError('SFU response is not valid JSON', response.status) }
    const parsed = result.safeParse(data)
    if (!parsed.success) {
      const partial = z.object({ tracks: z.tuple([z.object({ adapterId: id.optional() })]) }).safeParse(data)
      throw new SfuApiError('SFU response is invalid', response.status, partial.success ? partial.data.tracks[0].adapterId : undefined)
    }
    return { status: response.status, ok: response.ok, data: parsed.data }
  }

  return {
    async createSession() {
      const response = await request('/sessions/new', 'POST')
      if (!response.ok || response.data.errorCode || !response.data.sessionId) throw new SfuApiError('SFU session creation failed', response.status)
      return response.data.sessionId
    },
    async createTrack(input: { sessionId: string; track: z.input<typeof track>; sessionDescription?: z.input<typeof description> }) {
      const sessionId = id.parse(input.sessionId)
      const requested = track.parse(input.track)
      const sessionDescription = input.sessionDescription ? description.parse(input.sessionDescription) : undefined
      if (requested.location === 'local' && sessionDescription?.type !== 'offer') throw new Error('Invalid SFU local offer')
      const response = await request(`/sessions/${encodeURIComponent(sessionId)}/tracks/new`, 'POST', { ...(sessionDescription ? { sessionDescription } : {}), tracks: [requested] })
      const item = response.data.tracks?.[0]
      if (!response.ok || response.data.errorCode || response.data.tracks?.length !== 1 || !item || item.errorCode || item.trackName !== requested.trackName || !item.mid ||
          (requested.location === 'remote' && item.sessionId !== requested.sessionId) || !response.data.sessionDescription) {
        throw new SfuApiError('SFU track creation failed', response.status)
      }
      return { track: item, sessionDescription: response.data.sessionDescription, requiresImmediateRenegotiation: response.data.requiresImmediateRenegotiation === true }
    },
    async closeTrack(input: { sessionId: string; mid: string }) {
      const sessionId = id.parse(input.sessionId)
      const mid = name.parse(input.mid)
      const response = await request(`/sessions/${encodeURIComponent(sessionId)}/tracks/close`, 'PUT', { tracks: [{ mid }], force: true })
      const item = response.data.tracks?.[0]
      if (!response.ok || response.data.errorCode || response.data.tracks?.length !== 1 || !item || item.errorCode || item.mid !== mid) {
        throw new SfuApiError('SFU track close failed', response.status)
      }
    },
    async renegotiate(input: { sessionId: string; sessionDescription: { type: 'answer'; sdp: string } }) {
      const sessionId = id.parse(input.sessionId)
      const sessionDescription = description.parse(input.sessionDescription)
      if (sessionDescription.type !== 'answer') throw new Error('Invalid SFU answer')
      const response = await request(`/sessions/${encodeURIComponent(sessionId)}/renegotiate`, 'PUT', { sessionDescription })
      if (!response.ok || response.data.errorCode) throw new SfuApiError('SFU renegotiation failed', response.status)
    },
    async createAdapter(input: z.input<typeof adapter>) {
      const requested = adapter.parse(input)
      const spec = requested.location === 'local' ? { ...requested, inputCodec: 'pcm' } : { ...requested, outputCodec: 'pcm' }
      const response = await request('/adapters/websocket/new', 'POST', { tracks: [spec] })
      const item = response.data.tracks?.[0]
      if (!response.ok || response.data.errorCode || response.data.tracks?.length !== 1 || !item || item.errorCode ||
          item.trackName !== requested.trackName || item.endpoint !== requested.endpoint || !item.adapterId ||
          (requested.location === 'local' && !item.sessionId)) {
        throw new SfuApiError('SFU adapter creation failed', response.status, item?.adapterId)
      }
      return { adapterId: item.adapterId, ...(item.sessionId ? { sessionId: item.sessionId } : {}) }
    },
    async closeAdapter(adapterId: string) {
      const checkedId = id.parse(adapterId)
      const response = await request('/adapters/websocket/close', 'POST', { tracks: [{ adapterId: checkedId }] })
      const item = response.data.tracks?.[0]
      if (!response.ok || response.data.errorCode || response.data.tracks?.length !== 1 || !item || item.errorCode || item.adapterId !== checkedId) {
        throw new SfuApiError('SFU adapter close failed', response.status)
      }
    },
  }
}
