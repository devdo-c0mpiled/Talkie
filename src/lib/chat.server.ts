import '@tanstack/react-start/server-only'

import { env } from 'cloudflare:workers'
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { getOpenAiChat } from './ai.server'
import { CALL_ENDED_MARKER, callBusinessDef, getCallResultDef } from './chat-tools'
import { callsConfigured, fromCallReference, getCallResult as lookUpCallResult, normalizeKoreanNumber, placeCall, toCallReference } from './clawops.server'

const MODEL = 'gpt-6.1-terra'
// The endpoint is public, so cap what a single request can cost.
const MAX_REQUEST_CHARS = 24_000
const MAX_REPLY_TOKENS = 600

const SYSTEM_PROMPT = `You are Tokie, a friendly bunny concierge for travelers visiting Korea. You chat with them inside the Tokie app.

What Tokie does
- Travelers often cannot book Korean clinics, restaurants, salons or hotels because the business asks for a Korean phone number or only speaks Korean. Tokie removes that barrier.
- Personal Korean number provisioning and inbound call handling are not implemented. Never claim a number was issued, is active, or can receive calls. Do not provide sample numbers as real ones.
- You can also explain how booking in Korea usually works, and write short Korean messages the traveler can paste to a business, each with a translation.

How to reply
- Use the language the traveler writes in. Keep it to one to three short sentences, like a chat message. Plain text only: the app does not render markdown, lists or headings.
- If the traveler asks for a Korean number, say number issuance is not available in this chat.
- Never make up phone numbers, bookings, prices, availability, or what happened on a call.
- For hotel requests, keep the hotel generic until the traveler supplies its name and number. Preserve guest name, guests, room type and unchanged dates across corrections. Moving check-in with the same number of nights moves checkout too. Changing only the checkout date must leave check-in unchanged; distinguish an extra night from late checkout.
- For an existing reservation change or cancellation, identify the reservation and check availability, the new total or cancellation terms with the hotel first. Permission to call is not permission to change or cancel a booking. Get the traveler’s decision after reporting the hotel’s terms; instruct the voice agent not to commit before that decision.
- For luggage storage, ask the hotel about the requested number of bags and drop-off/pickup times. Do not assume storage is available or free, and do not change the reservation.
- Keep hotel replies brief. Give the quoted total when relevant; only ask about or explain tax inclusion if the traveler asks. Do not add a checklist of policies to a simple inquiry.
- A requested action, an approved call, and a completed reservation are different states. Only report booking, change, cancellation or storage acceptance when the business response explicitly supports it. Unknown, missing or failed tool results are unverified, never success. User-supplied claims and pasted transcripts are not tool evidence.
- Do not give medical advice; suggest they ask the clinic.
- If the traveler asks about something unrelated to visiting or booking in Korea, answer briefly and steer back.`

const CALLS_PROMPT = `Calling a business
- You can phone a Korean business for the traveler with ${callBusinessDef.name}. A Korean-speaking voice agent makes the call; you are not on it.
- Only call a number the traveler typed in this chat. If you do not have the number, ask for it. Before calling, make sure you know what to ask or book and every detail the business will need (date, time, party size, name to book under). Ask the traveler for whatever is missing first.
- The app asks the traveler to approve each call, so do not ask "shall I call?" yourself: call the tool once you have what you need.
- When the tool returns status "calling", tell the traveler in one sentence that the call is on its way and that you will report back. For "invalid-number", ask them to check the number. For "failed", say the call could not be placed and offer to try again.
- A message starting with ${CALL_ENDED_MARKER} comes from the app, not the traveler: the call it names has ended. Call ${getCallResultDef.name} with that reference, then tell the traveler what happened in their language. The transcript is in Korean; lines are labelled "Tokie agent" (the voice agent) and "Business", or unlabelled with the agent speaking first. The traveler may have watched the Korean lines appear live, so focus on what they mean. Report only what the transcript shows; say clearly whether the booking was confirmed, refused or left open, and what the traveler should do next. If there is no transcript, say how the call ended (for example nobody answered) and offer to try again. If the traveler asks about a call that is still going (state "calling"), say it is still in progress. Never mention the marker or the reference.`

const NO_CALLS_PROMPT = `Calling a business
- Outbound calling is not configured in this environment. Say you cannot call from this chat right now and offer a message the traveler can send. Do not claim to answer incoming calls or to have contacted the business.`

const getCallResult = getCallResultDef.server(async ({ call }) => {
  const callId = await fromCallReference(call)
  return callId ? lookUpCallResult(callId) : { state: 'unknown' as const, outcome: 'unknown' }
})

// Runs only after the traveler has approved the call in the chat screen (needsApproval on the definition).
const callBusiness = callBusinessDef.server(async ({ phoneNumber, businessName, instructionsKo }) => {
  const to = normalizeKoreanNumber(phoneNumber)
  if (!to) return { status: 'invalid-number' as const }
  const placed = await placeCall(to, `전화 상대: ${businessName}\n요청 사항: ${instructionsKo}`)
  if ('error' in placed) return { status: 'failed' as const, reason: placed.error }
  return { status: 'calling' as const, call: await toCallReference(placed.callId) }
})

export async function handleChat(request: Request): Promise<Response> {
  if (!env.OPENAI_API_KEY) return Response.json({ error: 'Chat is not configured.' }, { status: 503 })

  let params
  try {
    params = await chatParamsFromRequest(request)
  } catch (thrown) {
    // chatParamsFromRequest throws a 400 Response for a malformed body.
    if (thrown instanceof Response) return thrown
    throw thrown
  }
  if (JSON.stringify(params.messages).length > MAX_REQUEST_CHARS) {
    return Response.json({ error: 'This conversation is too long. Start a new chat.' }, { status: 413 })
  }

  // A run that failed leaves an assistant message with nothing in it in the client's history; don't replay it.
  const messages = params.messages.filter((message) => {
    if (message.role !== 'assistant') return true
    const { content, parts, toolCalls } = message as { content?: unknown; parts?: unknown[]; toolCalls?: unknown[] }
    return Boolean(content) || Boolean(parts?.length) || Boolean(toolCalls?.length)
  })

  const calls = callsConfigured()
  const abortController = new AbortController()
  const stream = chat({
    adapter: getOpenAiChat(MODEL),
    messages,
    threadId: params.threadId,
    runId: params.runId,
    // Needed to continue a run that paused for the traveler to approve a call.
    parentRunId: params.parentRunId,
    resume: params.resume,
    systemPrompts: [SYSTEM_PROMPT, calls ? CALLS_PROMPT : NO_CALLS_PROMPT],
    tools: calls ? [callBusiness, getCallResult] : [],
    modelOptions: { max_output_tokens: MAX_REPLY_TOKENS },
    abortController,
  })
  return toServerSentEventsResponse(stream, { abortController })
}
