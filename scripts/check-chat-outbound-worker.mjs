import { placeCall, getCallResult, handleCallStatus, normalizeKoreanNumber, toCallReference } from '../src/lib/clawops.server'
import { bindCall } from '../src/lib/call-store.server'

globalThis.fetch = async (url, options = {}) => {
  const target = typeof url === 'string' ? url : url.url
  if (target.includes('/recordings/')) {
    globalThis.__recordings = (globalThis.__recordings ?? 0) + 1
    globalThis.__recordingModes ??= {}
    globalThis.__recordingModes[globalThis.__mode] = (globalThis.__recordingModes[globalThis.__mode] ?? 0) + 1
    if (globalThis.__mode === 'recording-failure') return new Response(null, { status: 503 })
    const ready = globalThis.__mode === 'recording' || (globalThis.__mode === 'recording-delayed' && globalThis.__recordingModes[globalThis.__mode] >= 3)
    return ready ? new Response('synthetic wav', { headers: { 'Content-Type': 'audio/wav' } }) : new Response(null, { status: 404 })
  }
  if (target.includes('/audio/transcriptions')) {
    globalThis.__transcriptions = (globalThis.__transcriptions ?? 0) + 1
    return Response.json({ text: 'Synthetic recording transcript' })
  }
  if (target.includes('/responses')) {
    if (globalThis.__mode === 'analysis-error') return Response.json({ error: { message: 'synthetic model failure' } }, { status: 400 })
    const result = { summary: ['Live transcript'], reservation: { status: 'confirmed', evidence: ['Live transcript'] }, followUpActions: [] }
    const events = [{ type: 'response.output_text.delta', delta: JSON.stringify(result) }, { type: 'response.completed', response: { id: 'resp_synthetic', model: 'gpt-4o-mini', output: [] } }]
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  }
  if (options.method === 'GET') {
    if (globalThis.__mode === 'status-failure') return Response.json({ error: 'unavailable' }, { status: 503 })
    if (globalThis.__mode === 'status-malformed') return Response.json({ status: 'unexpected' })
    return Response.json({ status: ['status-completed', 'recording', 'recording-delayed', 'recording-failure', 'analysis-error'].includes(globalThis.__mode) ? 'completed' : globalThis.__mode === 'status-no-answer' ? 'no-answer' : globalThis.__mode === 'status-busy' ? 'busy' : 'queued' })
  }
  const payload = JSON.parse(options.body)
  globalThis.__outbound.push({ url, payload })
  if (globalThis.__mode === 'unknown') throw new Error('synthetic network failure')
  if (globalThis.__mode === 'rejected') return Response.json({ code: 'invalid_request' }, { status: 400 })
  if (globalThis.__mode === 'webhook-first') {
    const intent = new URL(payload.Url).searchParams.get('intent')
    await bindCall(globalThis.__testEnv.DB, { intent, callId: 'CA_webhook', to: payload.To })
    return Response.json({ callId: 'CA_webhook' }, { status: 201 })
  }
  return Response.json({ callId: `CA_${globalThis.__outbound.length}` }, { status: 201 })
}
export default {
  async fetch(request, env) {
    Object.assign(globalThis.__testEnv, env, { CLAWOPS_API_KEY: 'synthetic', CLAWOPS_ACCOUNT_ID: 'AC_TEST', CLAWOPS_FROM_NUMBER: '07012340000', CLAWOPS_PHONE_NUMBER: '07012340000', CLAWOPS_WEBHOOK_URL: 'https://example.test/api/clawops/voice', OPENAI_API_KEY: 'synthetic', CLAWOPS_SIGNING_KEY: 'synthetic', BETTER_AUTH_SECRET: 'synthetic-secret-for-outbound-test-only' })
    globalThis.__outbound ??= []
    const body = await request.json()
    globalThis.__mode = body.mode
    if (body.type === 'normalize') return Response.json(normalizeKoreanNumber(body.number))
    if (body.type === 'events') return Response.json(globalThis.__outbound)
    if (body.type === 'recording-counts') return Response.json({ recordings: globalThis.__recordings ?? 0, transcriptions: globalThis.__transcriptions ?? 0 })
    if (body.type === 'status') return handleCallStatus(await toCallReference(body.callId))
    if (body.type === 'result') return Response.json(await getCallResult(body.callId))
    return Response.json(await placeCall(body.to ?? '0212345678', body.instruction ?? '합성 예약 요청', body.action))
  },
}
