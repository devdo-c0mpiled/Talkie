import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import {callResultSchema} from './call-result'

// Tool definitions shared by the chat endpoint (which runs them) and the chat screen (which renders
// their results and asks the traveler to approve a call).

export const issueKoreanNumberDef = toolDefinition({
  name: 'issue_korean_number',
  description: 'Give the traveler a Korean phone number to use when a Korean business asks for one. Tokie answers the calls that come in on it.',
  inputSchema: z.object({}),
  outputSchema: z.object({ number: z.string(), activeUntil: z.string() }),
})
export type KoreanNumber = z.infer<typeof issueKoreanNumberDef.outputSchema>

const callRequest = z.object({
  phoneNumber: z.string().meta({ description: 'The Korean phone number the traveler gave, e.g. 02-555-0193. Never guess or look up a number.' }),
  businessName: z.string().meta({ description: 'Name of the business as the traveler gave it, or a short description such as "the clinic"' }),
  purpose: z.string().meta({ description: 'One short sentence in the traveler’s language saying what the call is for. Shown to the traveler before they approve.' }),
  conversationMode: z.enum(['business_call', 'hotel_roleplay']).default('business_call').meta({ description: 'hotel_roleplay when the user asks the agent to act as hotel staff at their supplied number; business_call when calling actual staff on their behalf. Preserve this mode on subsequent call-first requests.' }),
  instructionsKo: z.string().meta({ description: 'Instructions in Korean for the voice agent that makes the call: the purpose, known details, requested conversation role and questions to ask. Dates, guest count, room type and booking name may be unknown; never invent them or require them before an inquiry call.' }),
})
export type CallRequest = z.infer<typeof callRequest>

export const callBusinessDef = toolDefinition({
  name: 'call_business',
  description: 'Phone a Korean business for the traveler. A Korean-speaking voice agent makes the call. The traveler has to approve every call first.',
  inputSchema: callRequest,
  outputSchema: z.object({
    status: z.enum(['calling', 'invalid-number', 'failed']),
    /** Opaque reference to the call, for get_call_result. Only present when the call was placed. */
    call: z.string().optional(),
    reason: z.string().optional(),
  }),
  needsApproval: true,
})
export type CallPlaced = z.infer<typeof callBusinessDef.outputSchema>

export const getCallResultDef = toolDefinition({
  name: 'get_call_result',
  description: 'Get what happened on a call placed with call_business: whether it is over, how it ended and, if someone answered, what was said.',
  inputSchema: z.object({ call: z.string().meta({ description: 'The call reference returned by call_business' }) }),
  outputSchema: z.object({
    state: z.enum(['calling', 'done', 'unknown']),
    /** How the call ended: completed (it connected), no-answer, busy, rejected, canceled or failed. */
    outcome: z.string(),
    /** Korean. Lines are labelled "Tokie agent" and "Business" when the live transcript is available; otherwise unlabelled, with the agent speaking first. */
    transcript: z.string().optional(),
    reservation: callResultSchema.optional(),
    conversationMode: z.enum(['business_call','hotel_roleplay']).optional(),
  }),
})

/** One thing said on a call, as shown live in the chat. `final` is false while the speaker is still mid-sentence. */
export type CallLine = { id: string; role: 'agent' | 'business'; text: string; final: boolean }

/** Prefix of the hidden message the chat screen sends when a call has ended, followed by the call reference. */
export const CALL_ENDED_MARKER = '[call-ended]'
/** sessionStorage key for the number typed on the landing page. */
export const CALL_NUMBER_STORAGE_KEY = 'tokie.call-number'
