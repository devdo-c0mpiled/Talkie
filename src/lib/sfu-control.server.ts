import { z } from 'zod'
import type { createSfuApi } from './sfu-api.server'

const id = z.string().min(1).max(256).refine(value => value !== '.' && value !== '..')
const name = z.string().min(1).max(1024)
const desc = z.strictObject({ type: z.enum(['offer', 'answer']), sdp: z.string().min(1).max(1_000_000) })
const source = z.strictObject({ sessionId: id, trackName: name })
const local = z.strictObject({ location: z.literal('local'), mid: name, trackName: name })
const remote = z.strictObject({ location: z.literal('remote'), sessionId: id, trackName: name })
const control = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('session/new') }),
  z.strictObject({ operation: z.literal('tracks/new'), sessionId: id, body: z.strictObject({ sessionDescription: desc.optional(), tracks: z.tuple([z.discriminatedUnion('location', [local, remote])]) }) }),
  z.strictObject({ operation: z.literal('renegotiate'), sessionId: id, body: z.strictObject({ sessionDescription: desc }) }),
  z.strictObject({ operation: z.literal('tracks/close'), sessionId: id, body: z.strictObject({ tracks: z.tuple([z.strictObject({ mid: name })]), force: z.literal(true) }) }),
])
const input = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('control'), request: control }),
  z.strictObject({ action: z.literal('start'), source }),
  z.strictObject({ action: z.literal('stop'), source }),
])
const trackResult = source
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers })
const error = (message: string, status: number) => reply({ error: message }, status)
type Context = { db: D1Database; api: ReturnType<typeof createSfuApi>; objects: DurableObjectNamespace; userId: string | null; origin: string; instructions: string; voice?: string }
type Session = { state: string; track_kind: string | null; track_name: string | null; mid: string | null }
type Bridge = { object_name: string; state: string }

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) return null
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1_010_000) { await reader.cancel(); return null }
      parts.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const part of parts) { bytes.set(part, offset); offset += part.length }
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch { return null } finally { reader.releaseLock() }
}

export async function handleSfuControl(request: Request, ctx: Context): Promise<Response> {
  if (request.method !== 'POST') return error('Method not allowed', 405)
  if (request.headers.get('Origin') !== ctx.origin) return error('Forbidden', 403)
  if (!ctx.userId) return error('Unauthorized', 401)
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) return error('Invalid request', 400)
  const parsed = input.safeParse(await readBody(request))
  if (!parsed.success) return error('Invalid request', 400)
  const user = ctx.userId
  const body = parsed.data
  const now = Date.now()
  const expires = now + 60 * 60_000
  const findSession = (sessionId: string, allowExpired = false) => ctx.db.prepare('SELECT state, track_kind, track_name, mid FROM sfu_live_sessions WHERE id = ? AND owner_id = ? AND (? OR expires_at > ?)').bind(sessionId, user, allowExpired ? 1 : 0, now).first<Session>()
  if (body.action === 'control') {
    const op = body.request
    if (op.operation === 'session/new') {
      try {
        const sessionId = await ctx.api.createSession()
        await ctx.db.prepare("INSERT INTO sfu_live_sessions (id, owner_id, state, expires_at) VALUES (?, ?, 'ready', ?)").bind(sessionId, user, expires).run()
        return reply({ sessionId })
      } catch { return error('SFU session creation outcome unknown', 502) }
    }
    const session = await findSession(op.sessionId, op.operation === 'tracks/close')
    if (!session) return error('Session unavailable', 404)
    if (session.state !== 'ready') return error('Session unavailable', 409)
    if (op.operation === 'tracks/new') {
      const track = op.body.tracks[0]
      if (session.mid) return error('Session unavailable', 409)
      if (track.location === 'local' && op.body.sessionDescription?.type !== 'offer') return error('Invalid offer', 400)
      if (track.location === 'remote') {
        if (op.body.sessionDescription) return error('Invalid subscription', 400)
        const bridge = await ctx.db.prepare("SELECT object_name FROM sfu_live_bridges WHERE owner_id = ? AND output_session = ? AND output_track = ? AND state = 'ready' AND expires_at > ?").bind(user, track.sessionId, track.trackName, now).first()
        if (!bridge) return error('Track unavailable', 404)
      }
    }
    if (op.operation === 'renegotiate' && (session.track_kind !== 'remote' || op.body.sessionDescription.type !== 'answer')) return error('Invalid answer', 400)
    if (op.operation === 'tracks/close' && session.mid !== op.body.tracks[0].mid) return error('Track unavailable', 404)
    const claim = await ctx.db.prepare("UPDATE sfu_live_sessions SET state = 'busy' WHERE id = ? AND owner_id = ? AND state = 'ready' AND (? OR expires_at > ?) AND track_kind IS ? AND track_name IS ? AND mid IS ?").bind(op.sessionId, user, op.operation === 'tracks/close' ? 1 : 0, now, session.track_kind, session.track_name, session.mid).run()
    if (claim.meta.changes !== 1) return error('Session unavailable', 409)
    try {
      if (op.operation === 'tracks/new') {
        const track = op.body.tracks[0]
        const result = await ctx.api.createTrack({ sessionId: op.sessionId, track, sessionDescription: op.body.sessionDescription })
        if (!result.track.mid || result.sessionDescription.type !== (track.location === 'local' ? 'answer' : 'offer')) throw new Error('Invalid SFU response')
        await ctx.db.prepare("UPDATE sfu_live_sessions SET state = 'ready', track_kind = ?, track_name = ?, mid = ? WHERE id = ? AND owner_id = ? AND state = 'busy'").bind(track.location, track.trackName, result.track.mid, op.sessionId, user).run()
        return reply({ tracks: [result.track], sessionDescription: result.sessionDescription, requiresImmediateRenegotiation: result.requiresImmediateRenegotiation })
      }
      if (op.operation === 'renegotiate') {
        await ctx.api.renegotiate({ sessionId: op.sessionId, sessionDescription: { type: 'answer', sdp: op.body.sessionDescription.sdp } })
        await ctx.db.prepare("UPDATE sfu_live_sessions SET state = 'ready' WHERE id = ? AND owner_id = ? AND state = 'busy'").bind(op.sessionId, user).run()
        return reply({})
      }
      const mid = op.body.tracks[0].mid
      await ctx.api.closeTrack({ sessionId: op.sessionId, mid })
      await ctx.db.prepare("UPDATE sfu_live_sessions SET state = 'closed' WHERE id = ? AND owner_id = ? AND state = 'busy'").bind(op.sessionId, user).run()
      return reply({ tracks: [{ mid }] })
    } catch {
      await ctx.db.prepare("UPDATE sfu_live_sessions SET state = 'unknown' WHERE id = ? AND owner_id = ? AND state = 'busy'").bind(op.sessionId, user).run()
      return error('SFU operation outcome unknown', 502)
    }
  }
  const session = await findSession(body.source.sessionId, body.action === 'stop')
  if (!session || session.track_kind !== 'local' || session.track_name !== body.source.trackName) return error('Track unavailable', 404)
  if (body.action === 'start') {
    if (session.state !== 'ready') return error('Session unavailable', 409)
    const locked = await ctx.db.prepare("UPDATE sfu_live_sessions SET state = 'busy' WHERE id = ? AND owner_id = ? AND state = 'ready' AND track_kind = 'local' AND track_name = ? AND expires_at > ?").bind(body.source.sessionId, user, body.source.trackName, now).run()
    if (locked.meta.changes !== 1) return error('Session unavailable', 409)
    const objectName = crypto.randomUUID()
    try {
      const inserted = await ctx.db.prepare("INSERT OR IGNORE INTO sfu_live_bridges (source_session, source_track, owner_id, object_name, state, expires_at) VALUES (?, ?, ?, ?, 'starting', ?)").bind(body.source.sessionId, body.source.trackName, user, objectName, expires).run()
      if (inserted.meta.changes !== 1) return error('Bridge unavailable', 409)
      const object = ctx.objects.get(ctx.objects.idFromName(objectName))
      const response = await object.fetch('https://sfu-live.internal/start', { method: 'POST', body: JSON.stringify({ ...body.source, instructions: ctx.instructions, ...(ctx.voice ? { voice: ctx.voice } : {}) }) })
      const result = trackResult.safeParse(await response.json())
      if (!response.ok || !result.success) throw new Error('Bridge start failed')
      const completed = await ctx.db.prepare("UPDATE sfu_live_bridges SET state = 'ready', output_session = ?, output_track = ? WHERE source_session = ? AND owner_id = ? AND state = 'starting'").bind(result.data.sessionId, result.data.trackName, body.source.sessionId, user).run()
      if (completed.meta.changes !== 1) return error('Bridge stopped during startup', 409)
      return reply(result.data)
    } catch {
      await ctx.db.prepare("UPDATE sfu_live_bridges SET state = 'unknown' WHERE source_session = ? AND owner_id = ? AND state = 'starting'").bind(body.source.sessionId, user).run()
      return error('Bridge start outcome unknown', 502)
    } finally {
      await ctx.db.prepare("UPDATE sfu_live_sessions SET state = 'ready' WHERE id = ? AND owner_id = ? AND state = 'busy'").bind(body.source.sessionId, user).run()
    }
  }
  const bridge = await ctx.db.prepare('SELECT object_name, state FROM sfu_live_bridges WHERE source_session = ? AND source_track = ? AND owner_id = ?').bind(body.source.sessionId, body.source.trackName, user).first<Bridge>()
  if (!bridge) return error('Bridge unavailable', 404)
  const claim = await ctx.db.prepare("UPDATE sfu_live_bridges SET state = 'stopping' WHERE source_session = ? AND owner_id = ? AND state IN ('starting', 'ready', 'unknown')").bind(body.source.sessionId, user).run()
  if (claim.meta.changes !== 1) return error('Bridge unavailable', 409)
  try {
    const response = await ctx.objects.get(ctx.objects.idFromName(bridge.object_name)).fetch('https://sfu-live.internal/stop', { method: 'POST' })
    const result = z.object({ stopping: z.literal(true) }).safeParse(await response.json())
    if (!response.ok || !result.success) throw new Error('Stop not accepted')
    return reply({ stopping: true }, 202)
  } catch { return error('Bridge stop outcome unknown', 502) }
}
