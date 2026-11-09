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
