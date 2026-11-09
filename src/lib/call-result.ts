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
  if(next.durationDays && !next.nights && !next.checkOut)next.needsDateConfirmation=true
  return next
}

export const callResultExtractionSchema=callResultSchema.extend({
 durationDays:z.number().int().positive().nullable(),nights:z.number().int().positive().nullable(),durationText:z.string().nullable(),needsDateConfirmation:z.boolean(),
})
