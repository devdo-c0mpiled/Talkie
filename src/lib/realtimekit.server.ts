import '@tanstack/react-start/server-only'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { getAuth } from './auth.server'

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
const uuid = z.string().uuid()
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create') }),
  z.object({ action: z.literal('token'), id: uuid }),
  z.object({ action: z.literal('guest'), id: uuid, secret: z.string().regex(/^[a-f0-9]{64}$/) }),
])
const meetingResponse = z.object({ success: z.literal(true), data: z.object({ id: uuid }) })
const participantResponse = z.object({ success: z.literal(true), data: z.object({ id: uuid, token: z.string().min(1), custom_participant_id: z.string(), preset_name: z.string(), expires_on: z.iso.datetime({ offset: true }) }) })
const error = (message: string, status: number) => Response.json({ error: message }, { status, headers })

type VoiceSession = { id: string; meeting_id: string | null; expires_at: number }

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) return null
  const reader = request.body.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2048) { await reader.cancel(); return null }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch { return null } finally { reader.releaseLock() }
}

function config() {
  const { REALTIMEKIT_ACCOUNT_ID: account, REALTIMEKIT_APP_ID: app, REALTIMEKIT_API_TOKEN: token, REALTIMEKIT_VOICE_PRESET: preset } = env
  if (!account || !app || !token || !preset || !/^[A-Za-z0-9_-]{1,64}$/.test(account) || !/^[A-Za-z0-9_-]{1,64}$/.test(app)) return null
  return { base: `https://api.cloudflare.com/client/v4/accounts/${account}/realtime/kit/${app}/meetings`, token, preset }
}

async function providerPost(url: string, token: string, body: object): Promise<unknown> {
  try {
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return null
    return await response.json()
  } catch { return null }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function handleRealtimeKit(request: Request): Promise<Response> {
  if (request.method !== 'POST') return error('Method not allowed', 405)
  if (request.headers.get('Origin') !== new URL(env.BETTER_AUTH_URL).origin) return error('Forbidden', 403)
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) return error('Invalid request', 400)
  const parsed = bodySchema.safeParse(await readBody(request))
  if (!parsed.success) return error('Invalid request', 400)
  const body = parsed.data
  const auth = body.action === 'guest' ? null : await getAuth().api.getSession({ headers: request.headers })
  if (body.action !== 'guest' && !auth) return error('Unauthorized', 401)
  const cfg = config()
  if (!cfg) return error('Voice service unavailable', 503)
  const now = Date.now()
  if (body.action === 'create' && auth) {
    const id = crypto.randomUUID()
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const guestHash = await sha256(secret)
    // ponytail: One session per minute per account bounds abuse; replace with a shared rate limiter for higher-volume calling.
    const created = await env.DB.prepare(`INSERT INTO realtimekit_sessions (id, caller_id, guest_hash, state, created_at, expires_at)
      SELECT ?, ?, ?, 'creating', ?, ? WHERE NOT EXISTS (SELECT 1 FROM realtimekit_sessions WHERE caller_id = ? AND created_at > ?)`)
      .bind(id, auth.user.id, guestHash, now, now + 10 * 60_000, auth.user.id, now - 60_000).run()
    if (created.meta.changes !== 1) return error('Try later', 429)
    const meeting = meetingResponse.safeParse(await providerPost(cfg.base, cfg.token, { title: 'Voice call', record_on_start: false, transcribe_on_end: false, summarize_on_end: false, live_stream_on_start: false }))
    if (!meeting.success) {
      await env.DB.prepare("UPDATE realtimekit_sessions SET state = 'failed' WHERE id = ? AND state = 'creating'").bind(id).run()
      return error('Voice service unavailable', 502)
    }
    await env.DB.prepare("UPDATE realtimekit_sessions SET state = 'ready', meeting_id = ? WHERE id = ? AND state = 'creating'").bind(meeting.data.data.id, id).run()
    return Response.json({ id, secret }, { headers })
  }
  if (body.action === 'create') return error('Unauthorized', 401)
  const guestHash = body.action === 'guest' ? await sha256(body.secret) : null
  const invitation = await env.DB.prepare(`SELECT id, meeting_id, expires_at FROM realtimekit_sessions
    WHERE id = ? AND state = 'ready' AND expires_at > ? AND ((? IS NOT NULL AND caller_id = ?) OR (? IS NOT NULL AND guest_hash = ?))`)
    .bind(body.id, now, auth?.user.id ?? null, auth?.user.id ?? null, guestHash, guestHash).first<VoiceSession>()
  if (!invitation || !invitation.meeting_id) return error('Session unavailable', 404)
  const claimed = body.action === 'guest'
    ? await env.DB.prepare("UPDATE realtimekit_sessions SET guest_hash = NULL WHERE id = ? AND state = 'ready' AND expires_at > ? AND guest_hash = ?").bind(body.id, now, guestHash).run()
    : await env.DB.prepare("UPDATE realtimekit_sessions SET caller_issued = 1 WHERE id = ? AND state = 'ready' AND expires_at > ? AND caller_id = ? AND caller_issued = 0").bind(body.id, now, auth?.user.id ?? null).run()
  if (claimed.meta.changes !== 1) return error('Session unavailable', 404)
  const expiry = new Date(Math.min(invitation.expires_at, now + 5 * 60_000)).toISOString()
  const customId = crypto.randomUUID()
  const result = participantResponse.safeParse(await providerPost(`${cfg.base}/${invitation.meeting_id}/participants`, cfg.token, { custom_participant_id: customId, preset_name: cfg.preset, token: { expires_on: expiry } }))
  if (!result.success || result.data.data.custom_participant_id !== customId || result.data.data.preset_name !== cfg.preset || Date.parse(result.data.data.expires_on) > Date.parse(expiry) || Date.parse(result.data.data.expires_on) <= Date.now()) return error('Voice service unavailable', 502)
  return Response.json({ token: result.data.data.token, expiresOn: result.data.data.expires_on }, { headers })
}
