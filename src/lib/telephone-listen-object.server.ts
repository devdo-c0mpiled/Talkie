const MAX_IN_FLIGHT = 32
const MAX_PAYLOAD = 10_664
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
type Track = 'phone' | 'agent'

function parseMessage(message: string | ArrayBuffer): unknown {
  if (typeof message !== 'string' || message.length > MAX_PAYLOAD + 100) return null
  try { return JSON.parse(message) } catch { return null }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function isAudio(value: unknown): value is { track: Track; payload: string } {
  return isRecord(value) && (value.track === 'phone' || value.track === 'agent') && typeof value.payload === 'string' &&
    value.payload.length > 0 && value.payload.length <= MAX_PAYLOAD && BASE64.test(value.payload)
}
function isAck(value: unknown) { return isRecord(value) && value.type === 'ack' }

// Only internal Workers may reach /publish; the application authorizes /listen.
export class TelephoneListen {
  constructor(private state: DurableObjectState) {}

  fetch(request: Request): Response {
    const path = new URL(request.url).pathname
    if ((path !== '/listen' && path !== '/publish') || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Not found', { status: 404 })
    const active = this.state.getWebSockets('publisher').some(socket => socket.readyState === 1)
    if ((path === '/listen' && !active) || (path === '/publish' && active)) return new Response('Unavailable', { status: 409 })
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.state.acceptWebSocket(server, [path === '/publish' ? 'publisher' : 'listener'])
    server.serializeAttachment(path === '/publish' ? { role: 'publisher' } : { role: 'listener', count: 0 })
    if (path === '/listen') {
      server.send(JSON.stringify({ type: 'ready' }))
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const data = parseMessage(message)
    if (this.state.getWebSockets('publisher').includes(socket)) {
      if (!isAudio(data)) return socket.close(1008, 'Invalid audio')
      const encoded = JSON.stringify({ track: data.track, payload: data.payload })
      for (const listener of this.state.getWebSockets('listener')) {
        const attachment: unknown = listener.deserializeAttachment()
        if (listener.readyState !== 1 || !isRecord(attachment) || typeof attachment.count !== 'number' || attachment.count >= MAX_IN_FLIGHT) continue
        try { listener.send(encoded); listener.serializeAttachment({ role: 'listener', count: attachment.count + 1 }) } catch { /* A failed listener cannot affect the call. */ }
      }
      try { socket.send(JSON.stringify({ type: 'ack' })) } catch { /* Publisher is already gone. */ }
    } else if (isAck(data)) {
      const attachment: unknown = socket.deserializeAttachment()
      if (isRecord(attachment) && typeof attachment.count === 'number' && attachment.count > 0) socket.serializeAttachment({ role: 'listener', count: attachment.count - 1 })
    } else socket.close(1008, 'Invalid message')
  }

  webSocketClose(socket: WebSocket) { this.endListeners(socket) }
  webSocketError(socket: WebSocket) { this.endListeners(socket) }

  private endListeners(socket: WebSocket) {
    const attachment: unknown = socket.deserializeAttachment()
    if (!isRecord(attachment) || attachment.role !== 'publisher' || this.state.getWebSockets('publisher').some(other => other !== socket && other.readyState === 1)) return
    for (const listener of this.state.getWebSockets('listener')) {
      try { listener.send(JSON.stringify({ type: 'end' })); listener.close(1000, 'Call ended') } catch { /* Already closed. */ }
    }
  }
}

// No audio is queued while connecting or when the Durable Object falls behind.
export function createTelephoneListenPublisher(namespace: DurableObjectNamespace | undefined, callId: string) {
  let socket: WebSocket | undefined
  let ended = false
  let inFlight = 0
  if (namespace) {
    void (async () => {
      try {
        const response = await namespace.get(namespace.idFromName(callId)).fetch('https://telephone-listen.internal/publish', { headers: { Upgrade: 'websocket' } })
        const connected = response.webSocket
        if (!connected) return
        connected.accept()
        if (ended) return connected.close(1000, 'Call ended')
        socket = connected
        connected.addEventListener('message', event => { if (isAck(parseMessage(event.data)) && inFlight > 0) inFlight-- })
        connected.addEventListener('close', () => { socket = undefined })
        connected.addEventListener('error', () => { socket = undefined })
      } catch { /* Listening is best effort. */ }
    })()
  }
  return {
    audio(track: Track, payload: string) {
      if (!socket || socket.readyState !== 1 || !payload || !BASE64.test(payload)) return
      for (let offset = 0; offset < payload.length && inFlight < MAX_IN_FLIGHT; offset += MAX_PAYLOAD) {
        try { socket.send(JSON.stringify({ track, payload: payload.slice(offset, offset + MAX_PAYLOAD) })); inFlight++ }
        catch { try { socket.close(1011, 'Listen unavailable') } catch {} socket = undefined; return }
      }
    },
    end() {
      ended = true
      try { socket?.close(1000, 'Call ended') } catch { /* Already closed. */ }
      socket = undefined
    },
  }
}
