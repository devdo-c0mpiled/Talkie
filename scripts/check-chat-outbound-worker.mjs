import { placeCall, getCallResult, handleCallStatus, toCallReference } from '../src/lib/clawops.server'
import { bindCall } from '../src/lib/call-store.server'

globalThis.fetch = async (url, options) => {
  if (options.method === 'GET') {
    if (globalThis.__mode === 'status-failure') return Response.json({ error: 'unavailable' }, { status: 503 })
    if (globalThis.__mode === 'status-malformed') return Response.json({ status: 'unexpected' })
    return Response.json({ status: globalThis.__mode === 'status-completed' ? 'completed' : globalThis.__mode === 'status-no-answer' ? 'no-answer' : 'queued' })
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
    if (body.type === 'events') return Response.json(globalThis.__outbound)
    if (body.type === 'status') return handleCallStatus(await toCallReference(body.callId))
    if (body.type === 'result') return Response.json(await getCallResult(body.callId))
    return Response.json(await placeCall(body.to ?? '0212345678', body.instruction ?? '합성 예약 요청', body.action))
  },
}
