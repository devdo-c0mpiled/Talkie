import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const hotelInquiryDef = toolDefinition({
 name: 'hotel_inquiry',
 description: 'Ask the sandbox hotel about available dates (operation availability), booking, date changes, checkout-only changes, cancellation terms or luggage. Returns actual workflow state and hotel evidence. Does not apply changes; a separate customer approval card applies them.',
 inputSchema: z.object({
  operation: z.enum(['availability','book','change_dates','change_checkout','cancel','luggage']),
  guestName:z.string().optional(), checkIn:z.string().optional(),checkOut:z.string().optional(),
  adults:z.number().optional(),rooms:z.number().optional(),roomType:z.enum(['twin','double']).optional(),
  fromDate:z.string().optional().meta({description:'Earliest check-in date to search, YYYY-MM-DD; omit if unspecified'}),
  throughDate:z.string().optional().meta({description:'Latest check-in date to search (inclusive), YYYY-MM-DD; not the checkout date'}),
  stayNights:z.number().int().positive().optional().meta({description:'Number of nights for an availability search; omit to use the current stay length'}),
  bags:z.number().optional(),dropOff:z.string().optional(),pickUp:z.string().optional(),
 }),
 outputSchema: z.object({ok:z.boolean(),state:z.unknown().optional(),error:z.string().optional()}),
})
export const hotelStatusDef = toolDefinition({
 name:'hotel_status',description:'Read the persisted hotel workflow and reservation. Use after a customer decision; never infer a completed change from their message.',
 inputSchema:z.object({}),outputSchema:z.object({ok:z.boolean(),state:z.unknown().optional(),error:z.string().optional()}),
})
