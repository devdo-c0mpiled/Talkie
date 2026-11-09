import '@tanstack/react-start/server-only'

import { env } from 'cloudflare:workers'
import { bindCall, readTranscript, reserveCall } from './call-store.server'
import type { CallLine } from './chat-tools'

// ClawOps provides the phone connection; our VoiceML endpoint runs the voice session.

const HOST = 'https://api.claw-ops.com'
const API = `${HOST}/v1/accounts`
const RING_SECONDS = 40
const ENDED = new Set(['completed', 'no-answer', 'busy', 'rejected', 'canceled', 'failed'])
const IN_PROGRESS = new Set(['queued', 'ringing', 'in-progress'])
const MAX_TRANSCRIPT_CHARS = 6000
// ponytail: after 30 seconds without a completed flush, return a clearly incomplete transcript. Longer shutdowns need durable completion tracking.
const TRANSCRIPT_WAIT_MS = 30_000

export type CallStatus = { state: 'calling' | 'done'; outcome: string; transcriptIncomplete?: boolean }
export type CallResult = (CallStatus | { state: 'unknown'; outcome: 'status-unavailable' }) & { transcript?: string }

export function callsConfigured() {
  const from = normalizeKoreanNumber(env.CLAWOPS_FROM_NUMBER ?? '')
  const webhookPhone = normalizeKoreanNumber(env.CLAWOPS_PHONE_NUMBER ?? '')
  if (!from || from !== webhookPhone || !env.CLAWOPS_API_KEY || !env.CLAWOPS_ACCOUNT_ID || !env.OPENAI_API_KEY || !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32 || !env.DB) return false
  try {
    const url = new URL(env.CLAWOPS_WEBHOOK_URL ?? '')
    return url.protocol === 'https:' && url.pathname === '/api/clawops/voice' && !url.username && !url.password && !url.search && !url.hash
  } catch {
    return false
  }
}

function sameText(a: string, b: string) {
  // Compares every character, so a wrong signature is not faster to reject the earlier it differs.
  let diff = a.length ^ b.length
  for (let index = 0; index < Math.max(a.length, b.length); index++) diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0)
  return diff === 0
}

/**
 * Digits ClawOps can dial for an ordinary Korean business line, or null.
 * Accepts landlines, mobiles, 070 and 050x numbers and 15xx–18xx representative numbers;
 * rejects short and emergency codes, premium-rate 060 and anything outside Korea.
 */
export function normalizeKoreanNumber(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '')
  if (digits.startsWith('+82')) digits = `0${digits.slice(3).replace(/^0/, '')}`
  if (digits.includes('+')) return null
  if (/^1[5-8]\d{6}$/.test(digits)) return digits
  if (!/^0\d{8,11}$/.test(digits) || digits.startsWith('060')) return null
  return digits
}

async function clawops<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  const response = await fetch(`${API}/${env.CLAWOPS_ACCOUNT_ID}${path}`, {
    method,
    redirect: 'manual',
    headers: { authorization: `Bearer ${env.CLAWOPS_API_KEY}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json().catch(() => ({}))) as T & { code?: string } }
}

// Hash provider tool call IDs before storing them in D1.
async function digest(value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.BETTER_AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Queue one call per tool action; an ambiguous response is never automatically retried. */
export async function placeCall(to: string, instruction: string, actionId: string): Promise<{ callId: string } | { error: string }> {
  if (!callsConfigured() || !env.BETTER_AUTH_SECRET) return { error: 'unavailable' }
  if (instruction.length > 4000) return { error: 'instruction-too-long' }
  if (to === normalizeKoreanNumber(env.CLAWOPS_FROM_NUMBER ?? '')) return { error: 'same-number' }
  let url: URL
  try {
    url = new URL(env.CLAWOPS_WEBHOOK_URL ?? '')
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return { error: 'unavailable' }
  } catch {
    return { error: 'unavailable' }
  }
  const action = await digest(`tokie-call-action:${actionId}`)
  const intent = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  try {
    if (!await reserveCall(env.DB, { intent, actionId: action, to, instruction })) return { error: 'unknown' }
  } catch {
    return { error: 'unavailable' }
  }
  url.searchParams.set('intent', intent)
  try {
    const created = await clawops<{ callId?: string }>('/calls', 'POST', {
      To: to,
      From: env.CLAWOPS_FROM_NUMBER,
      Url: url.toString(),
      Timeout: RING_SECONDS,
    })
    // A missing/malformed result or provider/server error can occur after the call was queued.
    if (created.status !== 201 || !created.body.callId || !/^[\w-]+$/.test(created.body.callId)) {
      return { error: [400, 401, 403, 404, 409, 410, 422, 429].includes(created.status) ? 'rejected' : 'unknown' }
    }
    const bound = await bindCall(env.DB, { intent, callId: created.body.callId, to })
    return bound ? { callId: created.body.callId } : { error: 'unknown' }
  } catch {
    return { error: 'unknown' }
  }
}

/** Whether a call is still going, and how it ended: only "completed" means somebody answered. */
export async function getCallStatus(callId: string): Promise<CallStatus & { recordingUrl?: string | null }> {
  const call = await clawops<{ status?: string; recordingUrl?: string | null }>(`/calls/${callId}`)
  if (call.status !== 200 || typeof call.body?.status !== 'string') throw new Error('ClawOps call status unavailable')
  const outcome = call.body.status
  if (!ENDED.has(outcome) && !IN_PROGRESS.has(outcome)) throw new Error('ClawOps call status unavailable')
  if (outcome === 'completed') {
    const now = Date.now()
    const bridge = await env.DB.prepare(`UPDATE live_calls SET provider_completed_at = COALESCE(provider_completed_at, ?)
      WHERE call_id = ? RETURNING provider_completed_at, bridge_finished_at`).bind(now, callId)
      .first<{ provider_completed_at: number; bridge_finished_at: number | null }>()
    if (!bridge) throw new Error('Call reservation unavailable')
    if (bridge.bridge_finished_at !== null) return { state: 'done', outcome }
    if (now - bridge.provider_completed_at < TRANSCRIPT_WAIT_MS) return { state: 'calling', outcome }
    return { state: 'done', outcome, transcriptIncomplete: true }
  }
  return { state: ENDED.has(outcome) ? 'done' : 'calling', outcome, recordingUrl: call.body.recordingUrl }
}

/** Live transcript lines from our own GPT-Live bridge. */
export async function getCallLines(callId: string): Promise<CallLine[]> {
  return readTranscript(env.DB, callId)
}

/** For the chat agent: how the call ended and what the live session transcribed. */
export async function getCallResult(callId: string): Promise<CallResult> {
  let status: CallStatus
  try {
    status = await getCallStatus(callId)
  } catch {
    return { state: 'unknown', outcome: 'status-unavailable' }
  }
  const { state, outcome, transcriptIncomplete } = status
  if (state !== 'done' || outcome !== 'completed') return { state, outcome }
  const lines = await getCallLines(callId)
  const transcript = lines.map(({ role, text }) => `${role === 'agent' ? 'Tokie agent' : 'Business'}: ${text}`).join('\n')
  return { state, outcome, transcriptIncomplete, transcript: transcript ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) : undefined }
}

// Call references handed to the browser are signed, so only calls this app placed can be looked up
// (the ClawOps account also carries other calls). Reuses the auth secret under its own label.
async function signature(callId: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.BETTER_AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`tokie-call:${callId}`)))
  return Array.from(mac.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function toCallReference(callId: string) {
  return `${callId}.${await signature(callId)}`
}

export async function fromCallReference(reference: string): Promise<string | null> {
  const [callId, mac, ...rest] = reference.trim().split('.')
  if (!callId || !mac || rest.length || !/^[\w-]+$/.test(callId)) return null
  return sameText(mac, await signature(callId)) ? callId : null
}

/** GET /api/calls/$call: progress for the chat screen, with what has been said so far. */
export async function handleCallStatus(reference: string): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' }
  if (!callsConfigured()) return Response.json({ error: 'Calls are not configured.' }, { status: 503, headers })
  const callId = await fromCallReference(reference)
  if (!callId) return Response.json({ error: 'Unknown call.' }, { status: 404, headers })
  try {
    const status = await getCallStatus(callId)
    const lines = await getCallLines(callId)
    return Response.json({ ...status, lines }, { headers })
  } catch {
    return Response.json({ error: 'Call status unavailable.' }, { status: 502, headers })
  }
}
