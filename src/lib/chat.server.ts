import '@tanstack/react-start/server-only'

import { env } from 'cloudflare:workers'
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { getOpenAiChat } from './ai.server'
import { prepareCallResult } from './call-result.server'
import { CALL_ENDED_MARKER, callBusinessDef, getCallResultDef, issueKoreanNumberDef } from './chat-tools'
import { callsConfigured, fromCallReference, getCallReport, normalizeKoreanNumber, placeCall, toCallReference } from './clawops.server'

const MODEL = 'gpt-6.1-terra'
// The endpoint is public, so cap what a single request can cost.
const MAX_REQUEST_CHARS = 24_000
const MAX_REPLY_TOKENS = 600

const SYSTEM_PROMPT = `You are Tokie, a friendly bunny concierge for travelers visiting Korea. You chat with them inside the Tokie app.

What Tokie does
- Travelers often cannot book Korean clinics, restaurants, salons or hotels because the business asks for a Korean phone number or only speaks Korean. Tokie removes that barrier.
- You can give the traveler a Korean phone number with the ${issueKoreanNumberDef.name} tool. They use it when they book online or by message. When the business calls that number, Tokie answers in Korean and reports back in this chat.
- You can also explain how booking in Korea usually works, and write short Korean messages the traveler can paste to a business, each with a translation.

How to reply
- Use the language the traveler writes in. Keep it to one to three short sentences, like a chat message. Plain text only: the app does not render markdown, lists or headings.
- When the traveler needs a Korean number, call ${issueKoreanNumberDef.name} once and then say in a sentence or two how to use it. The app shows the number as a card, so do not repeat the digits. If this chat already has a number, do not issue another one.
- Never make up phone numbers, bookings, prices, availability, or what happened on a call.
- Do not give medical advice; suggest they ask the clinic.
- If the traveler asks about something unrelated to visiting or booking in Korea, answer briefly and steer back.`

const CALLS_PROMPT = `Calling a business
- You can phone a Korean business for the traveler with ${callBusinessDef.name}. A Korean-speaking voice agent makes the call; you are not on it.
- Only call a number the traveler typed in this chat. If you do not have the number, ask for it. Before calling, make sure you know what to ask or book and every detail the business will need (date, time, party size, name to book under). Ask the traveler for whatever is missing first.
- The app asks the traveler to approve each call, so do not ask "shall I call?" yourself: call the tool once you have what you need.
- In instructionsKo give only the traveler's actual request, supplied details, questions, and any explicit conditions. Call approval authorizes the requested booking; do not invent a requirement for further approval, a booking number, or a particular booking procedure.
- When the tool returns status "calling", tell the traveler in one sentence that the call is on its way and that you will report back. For "invalid-number", ask them to check the number. For "failed", say the call could not be placed and offer to try again.
- A message starting with ${CALL_ENDED_MARKER} comes from the app, not the traveler: the call it names has ended. Call ${getCallResultDef.name} with that reference, then tell the traveler what happened in their language. The transcript is in Korean; lines are labelled "Tokie agent" (the voice agent) and "Business", or unlabelled with the agent speaking first. The traveler may have watched the Korean lines appear live, so focus on what they mean. Report only what the transcript shows; say clearly whether the booking was confirmed, refused or left open, and what the traveler should do next. If there is no transcript, say how the call ended (for example nobody answered) and offer to try again. If the traveler asks about a call that is still going (state "calling"), say it is still in progress. Never mention the marker or the reference.
- Summarize the actual outcome in one or two sentences. Treat availability as distinct from a completed booking; if the transcript is ambiguous, say confirmation is unclear. When ${getCallResultDef.name} returns a result, the app shows a link to the booking and call details under your reply, so point the traveler to it without writing a link yourself. If no result is returned, do not mention a result link.`

const NO_CALLS_PROMPT = `Calling a business
- You cannot place calls yet. If the traveler asks you to call a business, say that for now you answer incoming calls to their Tokie number, and offer to write a message they can send instead.`

const issueKoreanNumber = issueKoreanNumberDef.server(async () => {
  // Placeholder: number provisioning is not built yet, so every chat gets the sample number from the design.
  return { number: '+82 10-5821-0420', activeUntil: 'Nov 30' }
})

const getCallResult = getCallResultDef.server(async ({ call, businessName, language }) => {
  const callId = await fromCallReference(call)
  if (!callId) return { state: 'unknown' as const, outcome: 'unknown' }
  const report = await getCallReport(callId)
  const { state, outcome, transcript } = report
  // The page is a bonus: a failure to build it must not cost the traveler the report itself.
  const result = await prepareCallResult(callId, report, businessName, language).catch(() => null)
  if (!result) return { state, outcome, transcript }
  const { id, status, business, headline, when } = result
  return { state, outcome, transcript, result: { id, status, business, headline, when } }
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
    tools: calls ? [issueKoreanNumber, callBusiness, getCallResult] : [issueKoreanNumber],
    modelOptions: { max_output_tokens: MAX_REPLY_TOKENS },
    abortController,
  })
  return toServerSentEventsResponse(stream, { abortController })
}
