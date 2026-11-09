import { z } from 'zod'

const quote = z.string().min(2).max(1000)
export const callAnalysisModelSchema = z.object({
  summary: z.array(z.string()),
  reservation: z.object({ status: z.enum(['confirmed', 'declined', 'pending', 'unknown']), evidence: z.array(z.string()) }),
  followUpActions: z.array(z.string()),
})
const callAnalysisOutputSchema = z.object({
  summary: z.array(quote).min(1).max(10),
  reservation: z.object({ status: z.enum(['confirmed', 'declined', 'pending', 'unknown']), evidence: z.array(quote).max(5) }),
  followUpActions: z.array(quote).max(10),
})

export const callAnalysisSchema = z.discriminatedUnion('status', [
  callAnalysisOutputSchema.extend({ status: z.literal('available'), reservation: callAnalysisOutputSchema.shape.reservation.extend({ assessment: z.literal('model-estimate') }) }),
  z.object({ status: z.literal('unavailable'), reason: z.enum(['status-unavailable', 'call-in-progress', 'call-not-connected', 'transcript-unavailable', 'model-unavailable', 'invalid-evidence']) }),
])
export type CallAnalysis = z.infer<typeof callAnalysisSchema>

type Input = {
  state: 'calling' | 'done' | 'unknown'
  outcome: string
  transcript?: string
  complete?: boolean
  lines?: { role: 'agent' | 'business'; text: string }[]
}

/** All returned text is a literal quotation, not a newly generated claim. */
export async function analyzeCall(input: Input, generate: () => Promise<unknown>): Promise<CallAnalysis> {
  if (input.state === 'calling') return { status: 'unavailable', reason: 'call-in-progress' }
  if (input.state !== 'done') return { status: 'unavailable', reason: 'status-unavailable' }
  if (input.outcome !== 'completed') return { status: 'unavailable', reason: 'call-not-connected' }
  if (!input.transcript?.trim()) return { status: 'unavailable', reason: 'transcript-unavailable' }
  let generated: unknown
  try {
    generated = await generate()
  } catch {
    return { status: 'unavailable', reason: 'model-unavailable' }
  }
  const parsed = callAnalysisOutputSchema.safeParse(generated)
  if (!parsed.success) return { status: 'unavailable', reason: 'invalid-evidence' }
  const result = parsed.data
  const quotes = [...result.summary, ...result.reservation.evidence, ...result.followUpActions]
  if (quotes.some((text) => !input.transcript?.includes(text))) return { status: 'unavailable', reason: 'invalid-evidence' }
  if (result.reservation.status !== 'unknown' && !result.reservation.evidence.length) return { status: 'unavailable', reason: 'invalid-evidence' }
  if (!input.complete || !input.lines?.length) return { status: 'available', ...result, reservation: { status: 'unknown', evidence: [], assessment: 'model-estimate' } }
  if (result.reservation.status === 'confirmed' && !result.reservation.evidence.some((text) => input.lines?.some((line) => line.role === 'business' && line.text.includes(text)))) {
    return { status: 'unavailable', reason: 'invalid-evidence' }
  }
  return { status: 'available', ...result, reservation: { ...result.reservation, assessment: 'model-estimate' } }
}

// The record behind a booking page (/b/<id>): what a call Tokie placed ended in, and what was said on it.
// Shared by the server, which builds and stores it, and the page, which shows it.

export type CallResultStatus = 'confirmed' | 'pending' | 'declined' | 'none'

export type CallResultLine = {
  id: string
  role: 'agent' | 'business'
  /** As spoken, in Korean. */
  text: string
  /** In the traveler's language; empty when that language is Korean. */
  translation: string
  /** Seconds into the call (and its recording) when the line began, if known. */
  at: number | null
}

export type CallResult = {
  /** Public id, also the last part of the page's address. Anyone who has it can open the page. */
  id: string
  business: string
  phoneNumber: string
  /** BCP 47 tag of the traveler's language, which every text field below is written in. */
  language: string
  callEndedAt: string
  status: CallResultStatus
  /** One sentence saying what happened on the call. */
  headline: string
  /** Fields the call did not settle are empty. */
  when: string
  /** Start of the booking in Korea time, as YYYY-MM-DDTHH:mm, when a date and time were agreed. */
  startsAt: string
  what: string
  who: string
  addressKo: string
  bring: string[]
  answers: { question: string; answer: string; line: string }[]
  /** Ids of the lines where each detail was settled, for the "from your call" links. */
  sources: { when: string; what: string; who: string }
  lines: CallResultLine[]
  hasRecording: boolean
}

/** What the chat needs to show the link to the page. */
export type CallResultLink = Pick<CallResult, 'id' | 'status' | 'business' | 'headline' | 'when'>

/** Seconds as m:ss. */
export function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
