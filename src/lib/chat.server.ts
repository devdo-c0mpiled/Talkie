import '@tanstack/react-start/server-only'

import { env } from 'cloudflare:workers'
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { getOpenAiChat } from './ai.server'
import { CALL_ENDED_MARKER, callBusinessDef, getCallResultDef } from './chat-tools'
import { resolveConversationMode, callsConfigured, fromCallReference, getCallReport, normalizeKoreanNumber, placeCall, toCallReference } from './clawops.server'

import {hotelInquiryDef, hotelStatusDef} from './hotel-workflow-tools'
import {readWorkflow, queryWorkflow, sandboxEnabled} from './hotel-workflow.server'
import {HOTEL_WORKFLOW_PROMPT} from './hotel-workflow-prompt'
import {prepareCallResult} from './call-result.server'

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
- Only call a number the traveler typed in this chat. If you do not have the number, ask for it. A supplied number and a clear call purpose are enough to call. When the traveler says "call first", "일단 전화해", or repeats a request to dial, invoke call_business immediately without asking for dates, guest count, room type or booking name. Pass known facts only and explain missing details in instructionsKo. Missing reservation details block committing a reservation, not making an inquiry call.
- Set conversationMode to hotel_roleplay for an explicit request to act as hotel staff, including follow-up messages saying only "call first". Preserve the previously supplied phone number, role and business across turns. Never infer a reservation change from a new booking request.
- Do not invent a test, demo, or rehearsal purpose in the call instructions. Carry the customer’s actual request and distinguish availability inquiries from authorized booking. Normally the Korean agent speaks to hotel staff on the traveler’s behalf. If the user explicitly requests a hotel-staff role-play at their supplied number, allow that role-play and pass that requested role to the voice agent instead of refusing. Never represent a role-play reservation as a real hotel booking.
- The app asks the traveler to approve each call, so do not ask "shall I call?" yourself: invoke call_business as soon as a number and purpose are known. Do not repeat a request for booking details after an explicit call-first instruction.
- When the tool returns status "calling", tell the traveler in one sentence that the call is on its way and that you will report back. For "invalid-number", ask them to check the number. For "failed", say the call could not be placed and offer to try again.
- In Korean date summaries omit the year unless needed to distinguish years. Say the final corrected month/day range followed by nights and total days, e.g. a November 3–9 stay is 6박 7일. Ask for "성함", not "예약자 이름". Do not repeat a duration clarification when the persisted result has both final dates and needsDateConfirmation=false.
- Preserve reservation durationText/durationDays even when checkout is unknown. Do not collapse a duration into a date. If needsDateConfirmation, ask once whether the customer means 2 nights/3 days or 3 nights; do not ask the year again when already given.
- The get_call_result reservation object is the persisted outcome. Use its status and fields as the source of truth; never upgrade inquiry/requested/unknown to confirmed.
- In the post-call summary, prioritize the customer’s latest explicit correction in the transcript: "신규 예약" overrides an earlier change assumption. Do not ask for a number already supplied or ask new-versus-change again after that correction. For hotel_roleplay, summarize the collected request without claiming a real hotel confirmation.
- When the business explicitly confirms a reservation, tell the traveler in their language that it is confirmed and summarize the confirmed dates, guests and any reference actually provided. If only availability or a pending request was reported, say so clearly.
- A message starting with ${CALL_ENDED_MARKER} comes from the app, not the traveler: the call it names has ended. Call ${getCallResultDef.name} with that reference, then tell the traveler what happened in their language. The transcript is in Korean; lines are labelled "Tokie agent" (the voice agent) and "Business", or unlabelled with the agent speaking first. The traveler may have watched the Korean lines appear live, so focus on what they mean. Report only what the transcript shows; say clearly whether the booking was confirmed, refused or left open, and what the traveler should do next. If there is no transcript, say how the call ended (for example nobody answered) and offer to try again. If the traveler asks about a call that is still going (state "calling"), say it is still in progress. Never mention the marker or the reference.`

const NO_CALLS_PROMPT = `Calling a business
- Outbound calling is not configured in this environment. Say you cannot call from this chat right now and offer a message the traveler can send. Do not claim to answer incoming calls or to have contacted the business.`

const getCallResult = getCallResultDef.server(async ({ call, businessName, language }) => {
  const callId = await fromCallReference(call)
  if (!callId) return { state: 'unknown' as const, outcome: 'unknown' }
  const report = await getCallReport(callId)
  const { state, outcome, transcript, reservation, conversationMode } = report
  // The page is a bonus: a failure to build it must not cost the traveler the report itself.
  const result = await prepareCallResult(callId, report, businessName, language).catch(() => null)
  if (!result) return { state, outcome, transcript, reservation, conversationMode }
  const { id, status, business, headline, when } = result
  return { state, outcome, transcript, reservation, conversationMode, result: { id, status, business, headline, when } }
})

// Runs only after the traveler has approved the call in the chat screen (needsApproval on the definition).
const callBusiness = callBusinessDef.server(async ({ phoneNumber, businessName, instructionsKo, conversationMode }) => {
  const to = normalizeKoreanNumber(phoneNumber)
  if (!to) return { status: 'invalid-number' as const }
  conversationMode=resolveConversationMode(to,conversationMode)
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const role = conversationMode === 'hotel_roleplay'
    ? '통화 모드: hotel_roleplay. 당신은 호텔 예약 상담원 역할이며 상대는 예약하려는 고객입니다. 고객 대신 호텔에 문의한다는 말을 하지 마세요. 고객이 말하는 신규 예약/변경/취소 의도가 이전 요청보다 우선합니다. 신규 예약을 변경으로 취급하지 마세요. 예약 희망 사항을 한 번에 하나씩 물어보세요.'
    : '통화 모드: business_call. 당신은 고객을 대신해 실제 업장 직원에게 문의하는 AI 전화비서입니다.'
  const placed = await placeCall(to, `${role}\n한국 기준 현재 날짜: ${today}. 명시된 예약 연도를 유지하세요.\n업장명: ${businessName}\n요청 사항: ${instructionsKo}`, conversationMode, businessName)
  if ('error' in placed) return { status: 'failed' as const, reason: placed.error }
  return { status: 'calling' as const, call: await toCallReference(placed.callId) }
})

export async function handleChat(request: Request, {hotelSandbox = false} = {}): Promise<Response> {
  if (hotelSandbox && !sandboxEnabled()) return Response.json({error: 'Hotel sandbox is not enabled.'}, {status:503})
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

  let hotelState
  if (hotelSandbox) {
    try { hotelState = await readWorkflow(params.threadId ?? '') }
    catch { return Response.json({error:'Start a hotel session first.'},{status:409}) }
  }
  const hotelSessionId = params.threadId ?? ''
  const hotelInquiry = hotelInquiryDef.server(async input => {
    try { return {ok:true,state:await queryWorkflow(hotelSessionId,input)} }
    catch(error) { return {ok:false,error:error instanceof Error?error.message:'Hotel lookup failed'} }
  })
  const hotelStatus = hotelStatusDef.server(async () => {
    try { return {ok:true,state:await readWorkflow(hotelSessionId)} }
    catch(error) { return {ok:false,error:error instanceof Error?error.message:'Hotel status failed'} }
  })
  const calls = !hotelSandbox && callsConfigured()
  const abortController = new AbortController()
  const stream = chat({
    adapter: getOpenAiChat(MODEL),
    messages,
    threadId: params.threadId,
    runId: params.runId,
    // Needed to continue a run that paused for the traveler to approve a call.
    parentRunId: params.parentRunId,
    resume: params.resume,
    systemPrompts: hotelSandbox ? [HOTEL_WORKFLOW_PROMPT, `Persisted sandbox state: ${JSON.stringify(hotelState)}`] : [SYSTEM_PROMPT, calls ? CALLS_PROMPT : NO_CALLS_PROMPT],
    tools: hotelSandbox ? [hotelInquiry,hotelStatus] : calls ? [callBusiness, getCallResult] : [],
    modelOptions: { max_output_tokens: MAX_REPLY_TOKENS },
    abortController,
  })
  return toServerSentEventsResponse(stream, { abortController })
}
