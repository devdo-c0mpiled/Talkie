import '@tanstack/react-start/server-only'

import { env } from 'cloudflare:workers'
import { generateTranscription } from '@tanstack/ai'
import { getOpenAiTranscription } from './ai.server'
import type { CallLine } from './chat-tools'
import {saveCall,readCall,finalizeCall} from './call-records.server'
import type {ConversationMode,ReservationResult} from './call-result'

// Outbound calls through ClawOps (https://docs.claw-ops.com): a managed voice agent phones the
// business, and the call recording is transcribed afterwards so the chat agent can report back.

const HOST = 'https://api.claw-ops.com'
const API = `${HOST}/v1/accounts`
const RING_SECONDS = 40
const ENDED = new Set(['completed', 'no-answer', 'busy', 'rejected', 'canceled', 'failed'])
// The recording is uploaded a moment after the hang-up, so a missing one is retried briefly.
const RECORDING_TRIES = 4
const RECORDING_RETRY_MS = 1500
const MAX_TRANSCRIPT_CHARS = 6000
// Live events come 200 to a page; a call long enough to need more pages than this is cut off here.
const MAX_LIVE_EVENT_PAGES = 5

export type CallStatus = { state: 'calling' | 'done'; outcome: string }
export type CallResult = CallStatus & { transcript?: string; reservation?: ReservationResult; conversationMode?:ConversationMode }
/** A finished call as the chat agent and the booking page need it. `lines` is empty when the agent emitted no live transcript. */
export type CallReport = CallResult & { to?: string; endedAt?: string; hasRecording: boolean; lines: CallLine[]; transcript?: string }

export function callsConfigured() {
  return Boolean(env.CLAWOPS_API_KEY && env.CLAWOPS_ACCOUNT_ID && env.CLAWOPS_FROM_NUMBER && env.CLAWOPS_AGENT_ID && env.BETTER_AUTH_SECRET)
}

export function resolveConversationMode(phone:string, requested:ConversationMode):ConversationMode {
  const roleplayNumbers=(env.HOTEL_ROLEPLAY_NUMBERS??'').split(',').map(value=>normalizeKoreanNumber(value.trim())).filter(Boolean)
  return roleplayNumbers.includes(phone)?'hotel_roleplay':requested
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
    signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${env.CLAWOPS_API_KEY}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json().catch(() => ({}))) as T & { code?: string } }
}

/** Queue a call from the Tokie number; `instruction` tells the voice agent what this call is for. */
export async function placeCall(to: string, instruction: string, mode:ConversationMode='business_call', business=''): Promise<{ callId: string } | { error: string }> {
  if (to === env.CLAWOPS_FROM_NUMBER) return { error: 'same-number' }
  const agentId=mode==='hotel_roleplay'?env.CLAWOPS_ROLEPLAY_AGENT_ID:env.CLAWOPS_AGENT_ID
  if(!agentId)return {error:'agent-not-configured'}
  const created = await clawops<{ callId?: string }>('/calls', 'POST', {
    To: to,
    From: env.CLAWOPS_FROM_NUMBER,
    AgentId: agentId,
    CallContext: { Instruction: instruction.slice(0, 4000) },
    Timeout: RING_SECONDS,
  })
  if (created.status !== 201 || !created.body.callId) return { error: created.body.code ?? `http-${created.status}` }
  await saveCall(created.body.callId,mode,business,instruction)
  return { callId: created.body.callId }
}

/** Whether a call is still going, and how it ended: only "completed" means somebody answered. */
export async function getCallStatus(callId: string): Promise<CallStatus & { to?: string; endedAt?: string; hasRecording: boolean }> {
  const call = await clawops<{ status?: string; to?: string; dateUpdated?: string | null; recordingUrl?: string | null }>(`/calls/${callId}`)
  if(call.status!==200 || !call.body.status)throw Error('Call status unavailable')
  const outcome = call.body.status
  const ended = ENDED.has(outcome)
  return { state: ended ? 'done' : 'calling', outcome, to: call.body.to, endedAt: ended ? call.body.dateUpdated ?? undefined : undefined, hasRecording: Boolean(call.body.recordingUrl) }
}

/** When the call was picked up, in ms since the epoch: the zero point of its recording. */
export async function getCallAnsweredAt(callId: string): Promise<number | undefined> {
  const events = await clawops<{ data?: { event: string; timestamp: string }[] }>(`/calls/${callId}/events`)
  const answered = events.body.data?.find(({ event }) => event === 'call.answered')
  return answered ? Date.parse(answered.timestamp) : undefined
}

/** The call's recording (WAV), or null when there is none (yet). */
export async function fetchCallRecording(callId: string): Promise<Response | null> {
  const response = await fetch(`${API}/${env.CLAWOPS_ACCOUNT_ID}/recordings/${callId}`, { headers: { authorization: `Bearer ${env.CLAWOPS_API_KEY}` } })
  return response.ok ? response : null
}

type LiveEvent = { id: string; event: string; timestamp?: string; detail?: { utteranceId?: string; role?: string; text?: string } }

/**
 * What has been said on the call so far, from the voice agent's live transcript events.
 * Empty when the agent was not set up to emit them (see scripts/setup-clawops-agent.mjs) or nobody has spoken yet.
 */
export async function getCallLines(callId: string): Promise<CallLine[]> {
  const lines = new Map<string, CallLine>()
  let after = ''
  for (let page = 0; page < MAX_LIVE_EVENT_PAGES; page++) {
    const events = await clawops<{ data?: LiveEvent[]; hasMore?: boolean }>(`/calls/${callId}/live-events?limit=200${after && `&after=${encodeURIComponent(after)}`}`)
    if(events.status!==200)throw Error('Transcript unavailable')
    for (const { id, event, timestamp, detail } of events.body.data ?? []) {
      after = id
      if ((event !== 'transcript.partial' && event !== 'transcript.final') || !detail?.text) continue
      const key = detail.utteranceId ?? id
      // A partial carries the whole utterance so far and the final replaces it, so the latest event wins;
      // the Map keeps each utterance where it first appeared.
      if(lines.get(key)?.final && event==='transcript.partial')continue
      const startedAt = lines.get(key)?.startedAt ?? (timestamp ? Date.parse(timestamp) : undefined)
      lines.set(key, { id: key, role: detail.role === 'agent' ? 'agent' : 'business', text: detail.text, final: event === 'transcript.final', startedAt })
    }
    if (!events.body.hasMore || !after) break
  }
  return [...lines.values()]
}

// Transcripts already made, so asking about the same call again does not transcribe it twice.
// Per isolate and best effort; a miss only costs one more transcription.
const transcripts = new Map<string, string>()

/**
 * Fallback for a call without live transcript events: transcribe the recording with OpenAI
 * (ClawOps' own transcription takes about a minute per call). Korean, without speaker labels.
 */
async function transcribeCall(callId: string): Promise<string | undefined> {
  const known = transcripts.get(callId)
  if (known) return known

  let recording: Response | undefined
  for (let attempt = 0; attempt < RECORDING_TRIES; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, RECORDING_RETRY_MS))
    const response = await fetchCallRecording(callId)
    if (response) {
      recording = response
      break
    }
  }
  if (!recording) return undefined

  const audio = new File([await recording.arrayBuffer()], 'call.wav', { type: 'audio/wav' })
  const { text } = await generateTranscription({ adapter: getOpenAiTranscription(), audio, language: 'ko', threadId: `call-${callId}` })
  const transcript = text.trim().slice(0, MAX_TRANSCRIPT_CHARS)
  if (!transcript) return undefined
  transcripts.set(callId, transcript)
  return transcript
}

/** How a call ended and, if it was answered, what was said. */
export async function getCallReport(callId: string): Promise<CallReport> {
  const status = await getCallStatus(callId)
  if (status.state !== 'done' || status.outcome !== 'completed') return { ...status, lines: [] }
  const lines = (await getCallLines(callId)).filter(line=>line.final)
  if (!lines.length) return { ...status, lines, transcript: await transcribeCall(callId) }
  const transcript = lines.map(({ role, text }) => `${role === 'agent' ? 'Tokie agent' : 'Business'}: ${text}`).join('\n')
  const reservation=await finalizeCall(callId,status.outcome,lines)
  const stored=await readCall(callId)
  return {...status,lines,transcript:transcript.slice(-MAX_TRANSCRIPT_CHARS),reservation,conversationMode:stored?.mode}
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
  if (!callsConfigured()) return Response.json({ error: 'Calls are not configured.' }, { status: 503 })
  const callId = await fromCallReference(reference)
  if (!callId) return Response.json({ error: 'Unknown call.' }, { status: 404 })
  try {
    const [{ state, outcome }, lines] = await Promise.all([getCallStatus(callId), getCallLines(callId)])
    const stored=await readCall(callId)
    let reservation:ReservationResult|undefined
    let resultPending=false
    if(state==='done') {
      try{reservation=await finalizeCall(callId,outcome,lines)}catch{resultPending=true}
    }
    return Response.json({ state,outcome,lines,reservation,resultPending,conversationMode:stored?.mode })
  }catch{return Response.json({error:'Call status unavailable'},{status:502})}
}
