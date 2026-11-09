import { z } from 'zod'
export const callResultSchema = z.object({
  intent: z.enum(['booking', 'change_dates', 'change_checkout', 'cancel', 'luggage', 'unknown']),
  status: z.enum(['inquiry', 'requested', 'confirmed', 'changed', 'cancelled', 'declined', 'unknown']),
  checkIn: z.string().nullable(), checkOut: z.string().nullable(),
  guests: z.number().int().positive().nullable(), roomType: z.string().nullable(),
  guestName: z.string().nullable(), reservationNumber: z.string().nullable(),
  evidence: z.string().nullable(),
  durationDays: z.number().int().positive().nullable().optional(),
  nights: z.number().int().positive().nullable().optional(),
  durationText: z.string().nullable().optional(),
  needsDateConfirmation: z.boolean().optional(),
})
export type ReservationResult = z.infer<typeof callResultSchema>
export type ConversationMode = 'business_call' | 'hotel_roleplay'
export function validateCallResult(result: ReservationResult, mode: ConversationMode, businessLines: string[]): ReservationResult {
  const next = {...result}
  if(mode==='hotel_roleplay' && next.guestName && !businessLines.some(text=>text.replace(/\s/g,'').includes(next.guestName!.replace(/\s/g,''))))next.guestName=null
  const committed = ['confirmed', 'changed', 'cancelled'].includes(next.status)
  if (committed && (mode === 'hotel_roleplay' || !next.evidence || !businessLines.some(text => text.includes(next.evidence!)))) {
    next.status = mode === 'hotel_roleplay' ? 'requested' : 'unknown'
    next.reservationNumber = null
  }
  if(next.checkIn && /^\d{4}-\d{2}-\d{2}$/.test(next.checkIn)) {
    if(next.nights && !next.checkOut) {
      const date=new Date(next.checkIn+'T00:00:00Z')
      if(!Number.isNaN(date.getTime())) {date.setUTCDate(date.getUTCDate()+next.nights);next.checkOut=date.toISOString().slice(0,10)}
    }
    if(next.checkOut && /^\d{4}-\d{2}-\d{2}$/.test(next.checkOut) && next.checkOut<=next.checkIn)next.checkOut=null
  }
  // Explicit corrected endpoints supersede a duration from an earlier turn.
  const start=parseStayDate(next.checkIn), end=parseStayDate(next.checkOut)
  if(start!==null && end!==null && end>start){
    next.nights=Math.round((end-start)/86400000)
    next.durationDays=next.nights+1
    next.durationText=`${next.nights}박 ${next.durationDays}일`
    next.needsDateConfirmation=false
  } else if(next.durationDays && !next.nights && !next.checkOut)next.needsDateConfirmation=true
  return next
}

export const callResultExtractionSchema=callResultSchema.extend({
 durationDays:z.number().int().positive().nullable(),nights:z.number().int().positive().nullable(),durationText:z.string().nullable(),needsDateConfirmation:z.boolean(),
})

function parseStayDate(value:string|null):number|null {
 if(!value)return null
 const iso=value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
 const korean=value.match(/^(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일$/)
 const match=iso??korean
 if(!match)return null
 const year=Number(match[1]??2000), month=Number(match[2]),day=Number(match[3])
 const date=new Date(Date.UTC(year,month-1,day))
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date.getTime():null
}
export function formatStayDate(value:string|null):string {
 if(!value)return '—'
 const iso=value.match(/^\d{4}-(\d{2})-(\d{2})$/)
 return iso?`${Number(iso[1])}월 ${Number(iso[2])}일`:value.replace(/^\d{4}년\s*/,'')
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
  conversationMode?: ConversationMode
  reservation?: ReservationResult
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
