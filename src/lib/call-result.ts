import { z } from 'zod'
export const callResultSchema = z.object({
  intent: z.enum(['booking', 'change_dates', 'change_checkout', 'cancel', 'luggage', 'unknown']),
  status: z.enum(['inquiry', 'requested', 'confirmed', 'changed', 'cancelled', 'declined', 'unknown']),
  checkIn: z.string().nullable(), checkOut: z.string().nullable(),
  guests: z.number().int().positive().nullable(), roomType: z.string().nullable(),
  guestName: z.string().nullable(), reservationNumber: z.string().nullable(),
  evidence: z.string().nullable(),
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
  return next
}
