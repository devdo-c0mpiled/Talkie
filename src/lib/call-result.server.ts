import '@tanstack/react-start/server-only'

import { env } from 'cloudflare:workers'
import { chat } from '@tanstack/ai'
import { z } from 'zod'
import { getOpenAiChat } from './ai.server'
import type { CallResult, CallResultLine } from './call-result'
import { formatClock, formatStayDate } from './call-result'
import { fetchCallRecording, getCallAnsweredAt } from './clawops.server'
import type { CallReport } from './clawops.server'

// The smallest current model with reasoning off: reading a short transcript into fields does not need more,
// and the traveler is waiting on it (about 4 s, against 10 s for the chat model).
const MODEL = 'gpt-6-luna'
const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

// Every field is required so the schema stays valid for strict structured output; what the call did not settle is empty.
const summarySchema = z.object({
  status: z.enum(['confirmed', 'pending', 'declined', 'none']),
  headline: z.string(),
  when: z.string(),
  startsAt: z.string(),
  what: z.string(),
  who: z.string(),
  addressKo: z.string(),
  bring: z.array(z.string()),
  answers: z.array(z.object({ question: z.string(), answer: z.string(), line: z.string() })),
  sources: z.object({ when: z.string(), what: z.string(), who: z.string() }),
})

const translationSchema = z.object({ lines: z.array(z.string()) })

function summaryPrompt(language: string, today: string) {
  return `You turn the transcript of a phone call into a record for a traveler visiting Korea. Tokie's voice agent phoned a Korean business in Korean on the traveler's behalf.

Write every text field in the language with BCP 47 tag "${language}", except addressKo. Today is ${today} in Korea. Use only what the transcript shows: leave a field empty ("" or []) when the call did not settle it, and never guess.

- status: "confirmed" if the business agreed to a booking on the call. "pending" if a booking was requested but the business still has to confirm or call back. "declined" if the business refused or had no availability and nothing else was agreed. "none" if the call was not about a booking, or nothing was decided.
- headline: one short sentence saying what happened, naming the business, e.g. "Saebom Plastic Surgery confirmed your visit."
- when: the agreed date and time, e.g. "Fri, Nov 20 · 3:00 PM (KST)". startsAt: the same moment as YYYY-MM-DDTHH:mm in Korea time, or "" unless both a date and a time were agreed.
- what: what was booked, with its length if said, e.g. "Rhinoplasty consult · 1 hr". who: the name the booking is under.
- addressKo: the address or directions the business gave, in Korean exactly as said.
- bring: things the business said to bring, prepare or keep in mind, one short item each.
- answers: questions the agent asked for the traveler other than the booking itself, each with the business's answer. line is the one line id where the business answered.
- sources: for each of when, what and who, the one line id where it was settled (just the id, such as "u4"), or "".`
}

/** The transcript in the traveler's language, line for line; empty when that language is Korean or the model lost count. */
async function translateLines(callId: string, texts: string[], language: string): Promise<string[]> {
  if (language.toLowerCase().startsWith('ko')) return []
  const { lines } = await chat({
    adapter: getOpenAiChat(MODEL),
    systemPrompts: [`Translate each numbered line of this Korean phone call into the language with BCP 47 tag "${language}". Return exactly ${texts.length} translations in the same order, one per line, without the numbers. Keep names, dates, times and numbers exact.`],
    messages: [{ role: 'user', content: texts.map((text, index) => `${index + 1}. ${text}`).join('\n') }],
    threadId: `call-translation-${callId}`,
    outputSchema: translationSchema,
    reasoning: 'off',
  })
  return lines.length === texts.length ? lines : []
}

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const chars = Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('')
  return `TK-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`
}

async function findByCall(callId: string): Promise<CallResult | null> {
  const row = await env.DB.prepare('SELECT data FROM call_results WHERE call_id = ?').bind(callId).first<{ data: string }>()
  return row ? (JSON.parse(row.data) as CallResult) : null
}

/** The stored result behind a booking page, with the call it came from. */
export async function loadCallResult(id: string): Promise<{ result: CallResult; callId: string } | null> {
  const row = await env.DB.prepare('SELECT data, call_id FROM call_results WHERE id = ?').bind(id).first<{ data: string; call_id: string }>()
  return row ? { result: JSON.parse(row.data) as CallResult, callId: row.call_id } : null
}

function reconcileReservation(page:CallResult,report:CallReport):CallResult {
  const r=report.reservation
  if(!r)return page
  const ko=page.language.toLowerCase().startsWith('ko')
  const status=r.status==='confirmed'||r.status==='changed'?'confirmed':r.status==='requested'?'pending':r.status==='declined'?'declined':'none'
  const labels={confirmed:['예약이 확정되었습니다.','Your reservation is confirmed.'],changed:['예약이 변경되었습니다.','Your reservation was updated.'],cancelled:['예약이 취소되었습니다.','Your reservation was cancelled.'],requested:['예약 요청이 접수되었습니다. 아직 확정되지 않았습니다.','Your reservation request was received; it is not confirmed.'],inquiry:['예약 문의 내용입니다.','Reservation inquiry.'],declined:['예약 요청이 거절되었습니다.','The reservation request was declined.'],unknown:['예약 결과가 확인되지 않았습니다.','The reservation outcome is unconfirmed.']}
  const date=(value:string|null)=>ko?formatStayDate(value):value??'—'
  const duration=r.nights?ko?`${r.nights}박 ${r.nights+1}일`:`${r.nights} nights, ${r.nights+1} days`:r.durationText??''
  return {...page,conversationMode:report.conversationMode,reservation:r,status,headline:labels[r.status][ko?0:1],
    when:r.checkIn?`${date(r.checkIn)} → ${date(r.checkOut)}${duration?` · ${duration}`:''}`:page.when,
    who:r.guestName??'',what:[r.roomType,r.guests?`${r.guests}${ko?'명':' guests'}`:''].filter(Boolean).join(' · ')||page.what,
    startsAt:page.startsAt&&r.checkIn&&page.startsAt.startsWith(r.checkIn)?page.startsAt:'',
    sources:{...page.sources,who:r.guestName?page.sources.who:''},
  }
}

/**
 * The result page for an answered call, made on first use and stored: the booking details a model
 * reads out of the transcript, plus the transcript itself in Korean and in the traveler's language.
 * Null when the call has no line-by-line transcript to build it from.
 */
export async function prepareCallResult(callId: string, report: CallReport, business: string, language: string): Promise<CallResult | null> {
  if (report.outcome !== 'completed' || !report.lines.length) return null
  const [existing, answeredAt] = await Promise.all([findByCall(callId), getCallAnsweredAt(callId)])
  if (existing) {
    const reconciled=reconcileReservation(existing,report)
    await env.DB.prepare('UPDATE call_results SET data=? WHERE call_id=?').bind(JSON.stringify(reconciled),callId).run()
    return reconciled
  }

  const lines = report.lines.map(({ id, role, text, startedAt }): CallResultLine => ({
    id,
    role,
    text,
    translation: '',
    at: answeredAt !== undefined && startedAt !== undefined ? Math.max(0, Math.round((startedAt - answeredAt) / 1000)) : null,
  }))
  const transcript = lines.map(({ id, role, text, at }) => `${id} [${at === null ? '?' : formatClock(at)}] ${role === 'agent' ? 'Tokie agent' : 'Business'}: ${text}`).join('\n')
  const today = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', dateStyle: 'full' }).format(new Date())

  // Side by side, so the page costs the traveler one model call's wait rather than two.
  const translating = translateLines(callId, lines.map(({ text }) => text), language).catch(() => [])
  const summary = await chat({
    adapter: getOpenAiChat(MODEL),
    systemPrompts: [summaryPrompt(language, today),`Conversation mode: ${report.conversationMode??'business_call'}. The authoritative reservation state is ${JSON.stringify(report.reservation??null)}. Follow this state over stale transcript details. In hotel_roleplay the remote speaker is the customer, not hotel staff; never label a roleplay request as an actual hotel confirmation. Omit unverified guest names. For Korean output omit the year and include the corrected date range and nights/days.`],
    messages: [{ role: 'user', content: `Business: ${business}\n\nTranscript (line id, time into the call, speaker):\n${transcript}` }],
    threadId: `call-result-${callId}`,
    outputSchema: summarySchema,
    reasoning: 'off',
  })

  const translations = await translating
  const known = new Set(lines.map(({ id }) => id))
  // Models sometimes answer with several ids or the whole line; keep the first id that exists.
  const knownLine = (line: string) => line.split(/[\s,]+/).find((part) => known.has(part)) ?? ''
  const result: CallResult = {
    id: newId(),
    business,
    phoneNumber: report.to ?? '',
    language,
    callEndedAt: report.endedAt ?? new Date().toISOString(),
    status: summary.status,
    headline: summary.headline,
    when: summary.when,
    // Anything but the agreed shape would break the countdown and the calendar file.
    startsAt: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(summary.startsAt) ? summary.startsAt : '',
    what: summary.what,
    who: summary.who,
    addressKo: summary.addressKo,
    bring: summary.bring,
    answers: summary.answers.map((answer) => ({ ...answer, line: knownLine(answer.line) })),
    sources: { when: knownLine(summary.sources.when), what: knownLine(summary.sources.what), who: knownLine(summary.sources.who) },
    lines: lines.map((line, index) => ({ ...line, translation: translations[index] ?? '' })),
    hasRecording: report.hasRecording,
  }

  // Two lookups of the same call can race; the first one stored wins and both return it.
  await env.DB.prepare('INSERT INTO call_results (id, call_id, created_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(call_id) DO NOTHING').bind(result.id, callId, Date.now(), JSON.stringify(reconcileReservation(result,report))).run()
  return (await findByCall(callId)) ?? reconcileReservation(result,report)
}

/** GET /api/b/$id/recording: the call's recording, for anyone who has the page's address. */
export async function handleRecording(request: Request, id: string): Promise<Response> {
  const stored = await loadCallResult(id)
  const recording = stored && (await fetchCallRecording(stored.callId))
  if (!recording) return new Response('Not found', { status: 404 })

  const audio = new Uint8Array(await recording.arrayBuffer())
  const headers = { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' }
  // Safari only plays audio it can fetch in byte ranges.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (!range || (!range[1] && !range[2])) return new Response(audio, { headers })
  const start = range[1] ? Number(range[1]) : Math.max(0, audio.length - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1
  if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${audio.length}` } })
  return new Response(audio.slice(start, end + 1), { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${audio.length}` } })
}
