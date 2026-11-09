import { placeCall, getCallReport, getCallResult, handleCallStatus, normalizeKoreanNumber, toCallReference } from '../src/lib/clawops.server'
import { bindCall } from '../src/lib/call-store.server'

globalThis.fetch = async (url, options = {}) => {
  const target = typeof url === 'string' ? url : url.url
  if (target.startsWith('https://storage.googleapis.com/')) {
    globalThis.__storageRequests = (globalThis.__storageRequests ?? 0) + 1
    if (options.headers || options.redirect !== 'manual') throw new Error('Unsafe recording storage request')
    return globalThis.__mode === 'legacy-double' ? new Response(null, { status: 302, headers: { location: 'https://attacker.example.test/' } }) : new Response('synthetic wav', { headers: { 'Content-Type': 'audio/wav' } })
  }
  if (!target.startsWith('https://api.claw-ops.com/') && !target.includes('/audio/transcriptions') && !target.includes('/responses')) throw new Error('Unexpected remote request')
  if (target.includes('/live-events')) {
    globalThis.__legacyRequests = (globalThis.__legacyRequests ?? 0) + 1
    if (['legacy-404', 'legacy-calling-404', 'legacy-redirect', 'legacy-gcs', 'legacy-port', 'legacy-credentials', 'legacy-no-sign', 'legacy-double'].includes(globalThis.__mode)) return new Response(null, { status: 404 })
    if (globalThis.__mode === 'legacy-forbidden') return new Response(null, { status: 403 })
    if (globalThis.__mode === 'legacy-error') return new Response(null, { status: 503 })
    if (globalThis.__mode === 'legacy-malformed') return Response.json({ data: [], hasMore: 'false' })
    if (globalThis.__mode === 'legacy-empty') return Response.json({ data: [], hasMore: false })
    const previous = new URL(target).searchParams.get('after')
    const id = globalThis.__mode === 'legacy-cap' ? String(Number(previous ?? '0') + 1) : previous ? '2' : '1'
    const event = { id, event: globalThis.__mode === 'legacy-partial' ? 'transcript.partial' : 'transcript.final', detail: { role: globalThis.__mode === 'legacy-role' ? 'unknown' : 'user', text: 'Live transcript', utteranceId: 'u1' } }
    return Response.json({ data: [event], hasMore: globalThis.__mode === 'legacy-cap' || (globalThis.__mode === 'legacy-pages' && id === '1') })
  }
  if (target.includes('/recordings/')) {
    globalThis.__recordings = (globalThis.__recordings ?? 0) + 1
    globalThis.__recordingModes ??= {}
    globalThis.__recordingModes[globalThis.__mode] = (globalThis.__recordingModes[globalThis.__mode] ?? 0) + 1
    if (globalThis.__mode === 'legacy-redirect') {
      if (options.redirect !== 'manual') throw new Error('redirect must be manual')
      return new Response(null, { status: 302, headers: { location: 'https://attacker.example.test/recording' } })
    }
    if (['legacy-gcs', 'legacy-port', 'legacy-credentials', 'legacy-no-sign', 'legacy-double'].includes(globalThis.__mode)) {
      const authority = globalThis.__mode === 'legacy-port' ? 'storage.googleapis.com:443' : globalThis.__mode === 'legacy-credentials' ? 'user@storage.googleapis.com' : 'storage.googleapis.com'
      const query = globalThis.__mode === 'legacy-no-sign' ? '' : '?X-Goog-Signature=synthetic'
      return new Response(null, { status: 302, headers: { location: `https://${authority}/synthetic${query}` } })
    }
    if (globalThis.__mode === 'recording-failure') return new Response(null, { status: 503 })
    const ready = globalThis.__mode === 'recording' || globalThis.__mode === 'legacy-404' || globalThis.__mode === 'legacy-empty' || (globalThis.__mode === 'recording-delayed' && globalThis.__recordingModes[globalThis.__mode] >= 3)
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
    return Response.json({ status: (globalThis.__mode?.startsWith('legacy-') && globalThis.__mode !== 'legacy-calling-404') || ['status-completed', 'recording', 'recording-delayed', 'recording-failure', 'analysis-error'].includes(globalThis.__mode) ? 'completed' : globalThis.__mode === 'status-no-answer' ? 'no-answer' : globalThis.__mode === 'status-busy' ? 'busy' : 'queued' })
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
    if (body.mode === 'legacy-db-error') globalThis.__testEnv.DB = { prepare() { throw new Error('synthetic database failure') } }
    if (body.withoutDialConfig) Object.assign(globalThis.__testEnv, { CLAWOPS_FROM_NUMBER: undefined, CLAWOPS_PHONE_NUMBER: undefined, CLAWOPS_WEBHOOK_URL: undefined, OPENAI_API_KEY: undefined })
    if (body.type === 'normalize') return Response.json(normalizeKoreanNumber(body.number))
    if (body.type === 'events') return Response.json(globalThis.__outbound)
    if (body.type === 'recording-counts') return Response.json({ recordings: globalThis.__recordings ?? 0, transcriptions: globalThis.__transcriptions ?? 0 })
    if (body.type === 'legacy-counts') return Response.json({ events: globalThis.__legacyRequests ?? 0, recordings: globalThis.__recordings ?? 0, storage: globalThis.__storageRequests ?? 0 })
    if (body.type === 'status') return handleCallStatus(body.invalidReference ? 'bad-reference' : await toCallReference(body.callId))
    if (body.type === 'result') return Response.json(await getCallResult(body.callId))
    if (body.type === 'report') { try { return Response.json(await getCallReport(body.callId)) } catch { return Response.json({ error: 'report unavailable' }, { status: 502 }) } }
    return Response.json(await placeCall(body.to ?? '0212345678', body.instruction ?? '합성 예약 요청', body.action))
  },
}
