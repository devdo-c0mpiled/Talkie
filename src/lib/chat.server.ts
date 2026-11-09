import '@tanstack/react-start/server-only'

import { env } from 'cloudflare:workers'
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { getOpenAiChat } from './ai.server'
import { prepareCallResult } from './call-result.server'
import { CALL_ENDED_MARKER, callBusinessDef, getCallResultDef } from './chat-tools'
import { callsConfigured, fromCallReference, getCallReport, getCallResult as lookUpCallResult, normalizeKoreanNumber, placeCall, toCallReference } from './clawops.server'

const MODEL = 'gpt-6.1-terra'
// The endpoint is public, so cap what a single request can cost.
const MAX_REQUEST_CHARS = 24_000
const MAX_REPLY_TOKENS = 600

const SYSTEM_PROMPT = `You are Tokie, a friendly bunny concierge for travelers visiting Korea. You chat with them inside the Tokie app.

What Tokie does
- Travelers often cannot book Korean clinics, restaurants, salons or hotels because the business asks for a Korean phone number or only speaks Korean. Tokie removes that barrier.
- Personal Korean numbers are not issued automatically. Customers can see incoming call transcripts when their number is connected.
- You can also explain how booking in Korea usually works, and write short Korean messages the traveler can paste to a business, each with a translation.

How to reply
- Use the language the traveler writes in. Keep it to one to three short sentences, like a chat message. Plain text only: the app does not render markdown, lists or headings.
- Never make up phone numbers, bookings, prices, availability, or what happened on a call.
- Do not give medical advice; suggest they ask the clinic.
- If the traveler asks about something unrelated to visiting or booking in Korea, answer briefly and steer back.`

const CALLS_PROMPT = `Calling a business
- You can phone a Korean business for the traveler with ${callBusinessDef.name}. A Korean-speaking voice agent makes the call; you are not on it.
- Only call a number the traveler typed in this chat. If you do not have the number, ask for it. Before calling, make sure you know what to ask or book and every detail the business will need (date, time, party size, name to book under). Ask the traveler for whatever is missing first.
- The app asks the traveler to approve each call, so do not ask "shall I call?" yourself: call the tool once you have what you need.
- In instructionsKo give only the traveler's actual request, supplied details, questions, and any explicit conditions. Call approval authorizes the requested booking; do not invent a requirement for further approval, a booking number, or a particular booking procedure.
- When the tool returns status "calling", tell the traveler in one sentence that the call is on its way and that you will report back. For "invalid-number", ask them to check the number. For "failed", say the call could not be placed; if the reason is "instruction-too-long", ask the traveler to shorten the request. For "unknown", say the call may have been placed but its status could not be confirmed; do not place another call automatically.
- A message starting with ${CALL_ENDED_MARKER} comes from the app, not the traveler: the call it names has ended. Call ${getCallResultDef.name} with that reference, then tell the traveler what happened in their language. The transcript is in Korean; lines are labelled "Tokie agent" (the voice agent) and "Business", or unlabelled with the agent speaking first. The traveler may have watched the Korean lines appear live, so focus on what they mean. Report only what the transcript shows; say clearly whether the booking was confirmed, refused or left open, and what the traveler should do next. If transcriptIncomplete is true, explain that the transcript may be incomplete, and do not claim nothing was said. If there is no transcript and it is not incomplete, say how the call ended (for example nobody answered). If the traveler asks about a call that is still going (state "calling"), say it is still in progress. Never mention the marker or the reference.
- Summarize the actual outcome in one or two sentences without referring to a result link. Treat availability as distinct from a completed booking; if the transcript is ambiguous, say confirmation is unclear.`

const NO_CALLS_PROMPT = `Calling a business
- You cannot place calls yet. If the traveler asks you to call a business, say that phone calls are not available yet, and offer to write a message they can send instead.`

const getCallResult = getCallResultDef.server(async ({ call, businessName, language }) => {
  const callId = await fromCallReference(call)
  if (!callId) return { state: 'unknown' as const, outcome: 'unknown' }
  const callResult = await lookUpCallResult(callId)
  if (callResult.state !== 'done' || callResult.outcome !== 'completed' || callResult.transcriptIncomplete) return callResult
  // The page is a bonus: a failure to build it must not cost the traveler the report itself.
  const result = await getCallReport(callId)
    .then((report) => report.state === 'done' && !report.transcriptIncomplete && report.transcript === callResult.transcript ? prepareCallResult(callId, report, businessName, language, callResult.analysis) : null)
    .catch(() => null)
  if (!result) return callResult
  const { id, status, business, headline, when } = result
  return { ...callResult, result: { id, status, business, headline, when } }
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
  // The client approval controls the UI flow; it is not an authorization boundary. A stable tool call ID prevents replayed approvals from dialing twice.
  const callBusiness = callBusinessDef.server(async ({ phoneNumber, businessName, instructionsKo }, context) => {
    const to = normalizeKoreanNumber(phoneNumber)
    if (!to) return { status: 'invalid-number' as const }
    if (!context?.toolCallId) return { status: 'failed' as const, reason: 'unavailable' }
    const actionId = `${context.threadId ?? ''}:${context.toolCallId}`
    const placed = await placeCall(to, `당신은 한국어로 전화 예약을 돕는 AI 비서입니다. 통화 시작 시 AI 비서라고 밝히세요. 확인하지 않은 내용을 확정하지 마세요.\n전화 상대: ${businessName}\n요청 사항: ${instructionsKo}`, actionId)
    if ('error' in placed) {
      if (placed.error === 'unknown') return { status: 'unknown' as const }
      return { status: 'failed' as const, reason: placed.error }
    }
    return { status: 'calling' as const, call: await toCallReference(placed.callId) }
  })
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
