import '@tanstack/react-start/server-only'
import { env } from 'cloudflare:workers'
import { authorizeClawOpsWebhook, consumeClawOpsStreamToken } from './clawops-security.server'
import { bindCall, createInboundCall, markBridgeFailed, markBridgeFinished, markBridgeStarted, readPriorInboundTranscript, writeTranscript } from './call-store.server'
import { getCustomerByPhone } from './customers.server'

function configuration() {
  const webhookUrl = env.CLAWOPS_WEBHOOK_URL?.trim()
  const signingKey = env.CLAWOPS_SIGNING_KEY?.trim()
  const accountId = env.CLAWOPS_ACCOUNT_ID?.trim()
  const phoneNumber = env.CLAWOPS_PHONE_NUMBER?.trim()
  const apiKey = env.OPENAI_API_KEY?.trim()
  if (!webhookUrl || !accountId || !apiKey) return null
  try {
    const url = new URL(webhookUrl)
    if (url.protocol !== 'https:' || url.pathname !== '/api/clawops/voice' || url.search || url.hash || url.username || url.password) return null
    return { webhookUrl, signingKey: signingKey ?? '', accountId, phoneNumber: phoneNumber ?? '', apiKey, origin: url.origin }
  } catch {
    return null
  }
}

function xml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

export async function handleClawOpsVoice(request: Request) {
  const config = configuration()
  if (!config) return new Response('Service unavailable', { status: 503 })
  const authorized = await authorizeClawOpsWebhook(request, config, env.DB,
    async context => Boolean(await bindCall(env.DB, context)),
    async ({ callId, to, callerNumber }) => {
      const result = await getCustomerByPhone({ db: env.DB, phoneNumber: to })
      if (result.kind !== 'ready') return false
      return Boolean(await createInboundCall(env.DB, { callId, customerId: result.customer.id, callerNumber }))
    })
  if (!authorized) return new Response('Unauthorized', { status: 401 })
  const streamUrl = new URL('/api/clawops/stream', config.origin)
  streamUrl.protocol = 'wss:'
  const callParams = authorized.intent ? `<Parameter name="intent" value="${xml(authorized.intent)}"/><Parameter name="to" value="${xml(authorized.to)}"/>` : ''
  const body = `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${xml(streamUrl.href)}" track="inbound"><Parameter name="callId" value="${xml(authorized.callId)}"/><Parameter name="token" value="${xml(authorized.token)}"/>${callParams}</Stream></Connect></Response>`
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } })
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function handleClawOpsStream(request: Request) {
  const config = configuration()
  if (!config) return new Response('Service unavailable', { status: 503 })
  if (new URL(request.url).origin !== config.origin || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket required', { status: 400 })
  }

  const pair = new WebSocketPair()
  const client = pair[0]
  const phone = pair[1]
  phone.accept()
  let phase: 'start' | 'checking' | 'closed' = 'start'
  const buffered: string[] = []
  const timer = setTimeout(close, 10_000)

  function close() {
    if (phase === 'closed') return
    phase = 'closed'
    clearTimeout(timer)
    phone.removeEventListener('message', onMessage)
    if (phone.readyState === 1) phone.close(1008, 'Invalid stream')
  }

  async function verifyStart(start: Record<string, unknown>) {
    const params = start.customParameters
    const format = start.mediaFormat
    if (start.accountId !== config!.accountId || typeof start.callId !== 'string' ||
        !record(params) || params.callId !== start.callId || typeof params.token !== 'string' ||
        !record(format) || format.encoding !== 'audio/x-mulaw' || format.sampleRate !== 8000 || format.channels !== 1) return close()
    let started = false
    try {
      let context: { intent: string; to: string } | undefined
      if ('intent' in params || 'to' in params) {
        if (typeof params.intent !== 'string' || !/^[0-9a-f]{64}$/.test(params.intent) || typeof params.to !== 'string' || !/^\d{8,15}$/.test(params.to)) return close()
        context = { intent: params.intent, to: params.to }
      }
      if (!(await consumeClawOpsStreamToken(env.DB, { callId: start.callId, token: params.token }, context)) || phase !== 'checking') return close()
      let instructions = 'You are Talkie, a helpful phone assistant. Introduce yourself as an AI assistant, speak in the caller’s language, and delegate complex questions to the backend. Never claim to have completed an action unless the backend confirms it.'
      if (context) {
        const instruction = await bindCall(env.DB, { ...context, callId: start.callId })
        if (!instruction || phase !== 'checking') return close()
        instructions = instruction
      } else {
        instructions += ' Previous conversations and caller number do not verify identity. Do not disclose private details from earlier calls without independently verifying the caller.'
      }
      started = await markBridgeStarted(env.DB, start.callId)
      if (!started) return close()
      if (phase !== 'checking') { await markBridgeFailed(env.DB, start.callId); return close() }
      const history = context ? [] : (await readPriorInboundTranscript(env.DB, start.callId)).map(({ role, text }) => ({ role: role === 'business' ? 'user' as const : 'assistant' as const, content: text }))
      const [{ startLiveMediaBridge }, { createLiveDelegation }] = await Promise.all([
        import('./live-media.server'),
        import('./live-delegation.server'),
      ])
      if (phase !== 'checking') { await markBridgeFailed(env.DB, start.callId); return close() }
      clearTimeout(timer)
      phone.removeEventListener('message', onMessage)
      let sendLive: (event: Record<string, unknown>) => boolean = () => false
      const delegation = createLiveDelegation({ send: event => { sendLive(event) }, history })
      let writes = Promise.resolve()
      startLiveMediaBridge({
        phone,
        apiKey: config!.apiKey,
        instructions,
        history,
        bufferedEvents: buffered,
        onEvent: (event, send) => {
          sendLive = send
          void delegation.handle(event)
          const role: 'business' | 'agent' | null = event.type === 'session.input_transcript.delta' ? 'business' : event.type === 'session.output_transcript.delta' ? 'agent' : null
          if (role && typeof event.event_id === 'string' && typeof event.delta === 'string' && typeof event.start_ms === 'number' && typeof event.end_ms === 'number') {
            const fragment = { callId: start.callId as string, eventId: event.event_id, role, text: event.delta, startMs: event.start_ms, endMs: event.end_ms }
            writes = writes.then(async () => { if (!await writeTranscript(env.DB, fragment)) throw new Error('Transcript persistence failed') })
            return writes
          }
        },
        onEnd: async (_reason, result) => {
          delegation.close()
          if (result.transcriptComplete) await markBridgeFinished(env.DB, start.callId as string)
          else await markBridgeFailed(env.DB, start.callId as string)
        },
      })
    } catch {
      if (started) await markBridgeFailed(env.DB, start.callId).catch(() => {})
      close()
    }
  }

  function onMessage(event: MessageEvent) {
    if (phase === 'closed' || typeof event.data !== 'string' || event.data.length > 4096) return close()
    if (phase === 'checking') {
      if (buffered.length >= 256) return close()
      buffered.push(event.data)
      return
    }
    try {
      const message: unknown = JSON.parse(event.data)
      if (!record(message)) return close()
      if (message.event === 'connected') return
      if (message.event !== 'start' || !record(message.start)) return close()
      phase = 'checking'
      void verifyStart(message.start)
    } catch {
      close()
    }
  }

  phone.addEventListener('message', onMessage)
  phone.addEventListener('close', close)
  phone.addEventListener('error', close)
  return new Response(null, { status: 101, webSocket: client })
}
