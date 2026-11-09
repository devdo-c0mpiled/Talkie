import { createLiveToSfuConverter, createSfuToLiveConverter, decodeSfuPacket, encodeSfuPackets } from './sfu-audio.server'

type LiveEvent = Record<string, unknown>
type Reason = 'stopped' | 'live_closed' | 'input_closed' | 'output_closed' | 'invalid_media' | 'overflow' | 'provider_error'
type Options = {
  apiKey: string
  instructions: string
  voice?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
  fetcher?: typeof fetch
  onEvent?: (event: LiveEvent, send: (event: LiveEvent) => boolean) => void | Promise<void>
  onEnd?: (reason: Reason, result: { sessionClosed: boolean }) => void | Promise<void>
}

const MAX_PENDING_BYTES = 128_000
const START_TIMEOUT_MS = 15_000
const RECONNECT_TIMEOUT_MS = 20_000
const CLOSE_TIMEOUT_MS = 15_000
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

// One bridge belongs to one Durable Object session. The caller authenticates
// adapter sockets and closes the corresponding SFU adapters when onEnd fires.
export function startSfuLiveBridge(options: Options) {
  let live: WebSocket | undefined
  let input: WebSocket | undefined
  let output: WebSocket | undefined
  let fromSfu = createSfuToLiveConverter()
  const toSfu = createLiveToSfuConverter()
  let ready = false
  let ended = false
  let closing = false
  let finalized = false
  let sessionClosed = false
  let reason: Reason = 'provider_error'
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  const startTimer = setTimeout(() => finish('provider_error'), START_TIMEOUT_MS)
  const inputQueue: string[] = []
  const outputQueue: Uint8Array[] = []
  let inputBytes = 0
  let outputBytes = 0
  const callbacks = new Set<Promise<void>>()

  function finalize() {
    if (finalized) return
    finalized = true
    if (closeTimer) clearTimeout(closeTimer)
    if (live?.readyState === 1) live.close(1000, 'Session ended')
    try { void Promise.resolve(options.onEnd?.(reason, { sessionClosed })).catch(() => {}) } catch { /* Cleanup is best effort. */ }
  }

  function finish(next: Reason) {
    if (ended) return
    ended = true
    reason = next
    clearTimeout(startTimer)
    if (reconnectTimer) clearTimeout(reconnectTimer)
    inputQueue.length = 0
    outputQueue.length = 0
    if (input?.readyState === 1) input.close(1000, 'Session ended')
    if (output?.readyState === 1) output.close(1000, 'Session ended')
    if (next === 'stopped' && ready && live?.readyState === 1) {
      try {
        closing = true
        live.send(JSON.stringify({ type: 'session.close' }))
        closeTimer = setTimeout(finalize, CLOSE_TIMEOUT_MS)
        return
      } catch { /* Socket already closed. */ }
    }
    finalize()
  }

  function send(event: LiveEvent): boolean {
    if (!ready || ended || live?.readyState !== 1) return false
    try { live.send(JSON.stringify(event)); return true } catch { finish('provider_error'); return false }
  }

  function dispatch(event: LiveEvent) {
    try {
      const task = Promise.resolve(options.onEvent?.(event, send))
      callbacks.add(task)
      void task.then(() => callbacks.delete(task), () => { callbacks.delete(task); finish('provider_error') })
    } catch { finish('provider_error') }
  }

  function attachInput(socket: WebSocket) {
    if (ended || (input && input.readyState === 1)) throw new Error('Input socket unavailable')
    if (reconnectTimer) clearTimeout(reconnectTimer)
    input = socket
    fromSfu = createSfuToLiveConverter()
    socket.addEventListener('message', event => {
      if (ended || input !== socket) return
      try {
        if (!(event.data instanceof ArrayBuffer)) throw new Error('Expected binary audio')
        const pcm = fromSfu(decodeSfuPacket(new Uint8Array(event.data)))
        if (!pcm.length) return
        let binary = ''
        for (const byte of pcm) binary += String.fromCharCode(byte)
        const message = JSON.stringify({ type: 'session.input_audio.append', audio: btoa(binary) })
        if (ready && live?.readyState === 1) live.send(message)
        else {
          inputBytes += message.length
          if (inputBytes > MAX_PENDING_BYTES) return finish('overflow')
          inputQueue.push(message)
        }
      } catch { finish('invalid_media') }
    })
    const disconnected = () => {
      if (ended || input !== socket) return
      input = undefined
      reconnectTimer = setTimeout(() => finish('input_closed'), RECONNECT_TIMEOUT_MS)
    }
    socket.addEventListener('close', disconnected)
    socket.addEventListener('error', disconnected)
  }

  function attachOutput(socket: WebSocket) {
    if (ended || output) throw new Error('Output socket unavailable')
    output = socket
    try {
      for (const packet of outputQueue) socket.send(packet)
      outputQueue.length = 0
      outputBytes = 0
    } catch { return finish('output_closed') }
    socket.addEventListener('close', () => finish('output_closed'))
    socket.addEventListener('error', () => finish('output_closed'))
  }

  async function connect() {
    try {
      const response = await (options.fetcher ?? fetch)('https://api.openai.com/v1/live/sessions', {
        headers: { Upgrade: 'websocket', Authorization: `Bearer ${options.apiKey}` }, redirect: 'manual',
      })
      const socket = response.webSocket
      if (!socket) return finish('provider_error')
      socket.accept()
      if (ended) { socket.close(1000, 'Session ended'); return }
      live = socket
      socket.addEventListener('close', () => closing ? finalize() : finish('live_closed'))
      socket.addEventListener('error', () => closing ? finalize() : finish('provider_error'))
      socket.addEventListener('message', event => {
        try {
          if (typeof event.data !== 'string' || event.data.length > 1_000_000) throw new Error('Invalid Live event')
          const message: unknown = JSON.parse(event.data)
          if (!message || typeof message !== 'object' || Array.isArray(message) || typeof (message as LiveEvent).type !== 'string') throw new Error('Invalid Live event')
          const item = message as LiveEvent
          if (item.type === 'session.closed') {
            sessionClosed = true
            if (closing) finalize()
            else finish('live_closed')
            return
          }
          if (closing) { if (item.type === 'session.input_transcript.delta' || item.type === 'session.output_transcript.delta') dispatch(item); return }
          if (ended) return
          if (item.type === 'session.started') {
            if (ready) throw new Error('Duplicate start')
            ready = true
            clearTimeout(startTimer)
            for (const pending of inputQueue) socket.send(pending)
            inputQueue.length = 0
            inputBytes = 0
          } else if (item.type === 'session.output_audio.delta') {
            if (!ready || typeof item.delta !== 'string' || !item.delta || !base64Pattern.test(item.delta)) throw new Error('Invalid audio')
            const binary = atob(item.delta)
            const pcm = Uint8Array.from(binary, c => c.charCodeAt(0))
            for (const packet of encodeSfuPackets(toSfu(pcm))) {
              if (output?.readyState === 1) output.send(packet)
              else {
                outputBytes += packet.length
                if (outputBytes > MAX_PENDING_BYTES) return finish('overflow')
                outputQueue.push(packet)
              }
            }
          }
          dispatch(item)
        } catch { finish('provider_error') }
      })
      socket.send(JSON.stringify({
        type: 'session.start', session: {
          model: 'gpt-live-1', instructions: options.instructions,
          ...(options.history?.length ? { input: options.history.map(item => ({ type: 'message', role: item.role, content: [{ type: item.role === 'user' ? 'input_text' : 'output_text', text: item.content }] })) } : {}),
          audio: { format: { type: 'audio/pcm', rate: 24_000 }, output: { voice: options.voice ?? 'marin' } },
          delegation: { type: 'client' },
        },
      }))
    } catch { finish('provider_error') }
  }
  void connect()
  return { attachInput, attachOutput, send, stop: () => finish('stopped') }
}
