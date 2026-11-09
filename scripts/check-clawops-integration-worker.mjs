import { handleClawOpsStream, handleClawOpsVoice } from '../src/lib/clawops-routes.server.ts'

const seen = []
globalThis.fetch = async (url, init) => {
  if (url !== 'https://api.openai.com/v1/live/sessions' || init?.headers?.Upgrade !== 'websocket') throw Error('Unexpected upstream request')
  const pair = new WebSocketPair()
  const peer = pair[1]
  peer.accept()
  peer.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data)
    seen.push(event)
    if (event.type === 'session.start') peer.send(JSON.stringify({ type: 'session.started' }))
    if (event.type === 'session.input_audio.append') peer.send(JSON.stringify({ type: 'session.output_audio.delta', delta: event.audio }))
  })
  return new Response(null, { status: 101, webSocket: pair[0] })
}

export default {
  async fetch(request, bindings) {
    Object.assign(globalThis.__testEnv, bindings, {
      CLAWOPS_WEBHOOK_URL: 'https://example.test/api/clawops/voice',
      CLAWOPS_SIGNING_KEY: 'synthetic-signing-key',
      CLAWOPS_ACCOUNT_ID: 'AC_TEST',
      CLAWOPS_PHONE_NUMBER: '07012340000',
      OPENAI_API_KEY: 'synthetic-openai-key',
    })
    const path = new URL(request.url).pathname
    if (path === '/api/clawops/voice') return handleClawOpsVoice(request)
    if (path === '/api/clawops/stream') return handleClawOpsStream(request)
    if (path === '/test/events') return Response.json(seen)
    return new Response('Not found', { status: 404 })
  },
}
