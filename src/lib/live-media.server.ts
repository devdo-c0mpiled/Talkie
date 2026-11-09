const MAX_PENDING_AUDIO_BYTES = 128_000
const MAX_EVENT_BYTES = 1_000_000
const START_TIMEOUT_MS = 15_000

type LiveEvent = Record<string, unknown>
type EndReason = 'phone_closed' | 'live_closed' | 'invalid_media' | 'overflow' | 'provider_error'

type BridgeOptions = {
  phone: WebSocket
  apiKey: string
  instructions: string
  voice?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
  bufferedEvents?: string[]
  onAudio?: (track: 'phone' | 'agent', payload: string) => void
  onAudioEnd?: () => void
  onEvent?: (event: LiveEvent, send: (event: LiveEvent) => boolean) => void | Promise<void>
  onEnd?: (reason: EndReason, result: { transcriptComplete: boolean }) => void | Promise<void>
  fetcher?: typeof fetch
}

function parseEvent(data: unknown): LiveEvent | null {
  if (typeof data !== 'string' || data.length > MAX_EVENT_BYTES) return null
  try {
    const event: unknown = JSON.parse(data)
    return event !== null && typeof event === 'object' && !Array.isArray(event)
      ? Object.fromEntries(Object.entries(event))
      : null
  } catch {
    return null
  }
}

/** Call only after authenticating and validating the ClawOps start event. */
export function startLiveMediaBridge(options: BridgeOptions): () => void {
  const { phone } = options
  let live: WebSocket | undefined
  let ended = false
  let ready = false
  let closing = false
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let endReason: EndReason | undefined
  let finalized = false
  let receivedSessionClosed = false
  let callbackFailed = false
  const callbacks = new Set<Promise<void>>()
  let pendingBytes = 0
  const pending: string[] = []
  const timer = setTimeout(() => finish('provider_error'), START_TIMEOUT_MS)

  function closeLive() {
    closing = false
    if (closeTimer) clearTimeout(closeTimer)
    if (finalized) return
    finalized = true
    // Keep the upstream socket open while all transcript writes drain.
    void Promise.allSettled([...callbacks]).then(async results => {
      try {
        if (endReason) await options.onEnd?.(endReason, { transcriptComplete: receivedSessionClosed && !callbackFailed && results.every(result => result.status === 'fulfilled') })
      } catch {
        // The completion marker is best effort; the reader treats its absence as incomplete.
      } finally {
        if (live?.readyState === 1) live.close(1000, 'Call ended')
      }
    })
  }

  function finish(reason: EndReason) {
    if (ended) return
    ended = true
    try { options.onAudioEnd?.() } catch { /* Listening must not affect the call. */ }
    endReason = reason
    clearTimeout(timer)
    pending.length = 0
    if (phone.readyState === 1) phone.close(1000, 'Call ended')
    if (reason === 'phone_closed' && ready && live?.readyState === 1) {
      try {
        closing = true
        live.send(JSON.stringify({ type: 'session.close' }))
        closeTimer = setTimeout(closeLive, 15_000)
      } catch {
        closeLive()
      }
    } else {
      closeLive()
    }
  }

  function dispatchEvent(message: LiveEvent) {
    if (!options.onEvent) return
    try {
      const callback = Promise.resolve(options.onEvent(message, send))
      callbacks.add(callback)
      void callback.then(() => callbacks.delete(callback), () => {
        callbacks.delete(callback)
        callbackFailed = true
        finish('provider_error')
      })
    } catch {
      callbackFailed = true
      finish('provider_error')
    }
  }

  function send(event: LiveEvent): boolean {
    if (!ready || ended || live?.readyState !== 1) return false
    try {
      live.send(JSON.stringify(event))
      return true
    } catch {
      finish('provider_error')
      return false
    }
  }

  function handlePhone(data: unknown) {
    if (ended) return
    const event = parseEvent(data)
    if (!event || typeof event.event !== 'string') return finish('invalid_media')
    if (event.event === 'stop') return finish('phone_closed')
    if (event.event !== 'media') return
    const media = event.media
    if (!media || typeof media !== 'object' || !('payload' in media) ||
        typeof media.payload !== 'string' || !media.payload ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(media.payload)) {
      return finish('invalid_media')
    }
    try { options.onAudio?.('phone', media.payload) } catch { /* Best effort. */ }
    const encoded = JSON.stringify({ type: 'session.input_audio.append', audio: media.payload })
    if (ready) {
      try {
        live?.send(encoded)
      } catch {
        finish('provider_error')
      }
    } else {
      pendingBytes += encoded.length
      if (pendingBytes > MAX_PENDING_AUDIO_BYTES) return finish('overflow')
      pending.push(encoded)
    }
  }

  phone.addEventListener('message', event => handlePhone(event.data))
  phone.addEventListener('close', () => finish('phone_closed'))
  phone.addEventListener('error', () => finish('phone_closed'))
  for (const event of options.bufferedEvents ?? []) handlePhone(event)

  async function connect() {
    try {
      const response = await (options.fetcher ?? fetch)('https://api.openai.com/v1/live/sessions', {
        headers: { Upgrade: 'websocket', Authorization: `Bearer ${options.apiKey}` },
        redirect: 'manual',
      })
      const socket = response.webSocket
      if (!socket) return finish('provider_error')
      if (ended) {
        socket.accept()
        socket.close(1000, 'Call ended')
        return
      }
      live = socket
      socket.accept()
      socket.addEventListener('close', () => {
        if (closing) closeLive()
        else finish('live_closed')
      })
      socket.addEventListener('error', () => {
        if (closing) closeLive()
        else finish('provider_error')
      })
      socket.addEventListener('message', event => {
        const message = parseEvent(event.data)
        if (closing) {
          if (message?.type === 'session.input_transcript.delta' || message?.type === 'session.output_transcript.delta') dispatchEvent(message)
          else if (message?.type === 'session.closed' || message?.type === 'error' || !message) {
            if (message?.type === 'session.closed') receivedSessionClosed = ['close_requested', 'expired', 'content', 'remote_hangup'].includes(String(message.reason))
            closeLive()
          }
          return
        }
        if (ended) return
        if (!message || typeof message.type !== 'string') return finish('provider_error')
        if (message.type === 'session.closed') {
          receivedSessionClosed = ['close_requested', 'expired', 'content', 'remote_hangup'].includes(String(message.reason))
          return finish('live_closed')
        }
        if (message.type === 'error') return finish('provider_error')
        if (message.type === 'session.started') {
          if (ready) return finish('provider_error')
          ready = true
          clearTimeout(timer)
          try {
            for (const item of pending) socket.send(item)
          } catch {
            return finish('provider_error')
          }
          pending.length = 0
          pendingBytes = 0
        } else if (message.type === 'session.output_audio.delta') {
          if (!ready || typeof message.delta !== 'string' || !message.delta ||
              !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(message.delta)) return finish('provider_error')
          try {
            phone.send(JSON.stringify({ event: 'media', media: { payload: message.delta } }))
          } catch {
            return finish('phone_closed')
          }
          try { options.onAudio?.('agent', message.delta) } catch { /* Best effort. */ }
        }
        dispatchEvent(message)
      })
      socket.send(JSON.stringify({
        type: 'session.start',
        session: {
          model: 'gpt-live-1',
          instructions: `${options.instructions}\n이미 받은 답변은 반복해서 확인하지 마세요. 예약 등 진행에 꼭 필요한 정보만 한 번 확인하고, 불명확할 때만 짧게 추가 질문하세요. 상대방의 답변을 충분히 기다리고 통화를 조기에 종료하지 마세요. 통화를 마치기 전에는 "통화 종료하겠습니다. 감사합니다."라고 끝까지 말하세요.`,
          ...(options.history?.length ? { input: options.history.map(item => ({
            type: 'message', role: item.role,
            content: [{ type: item.role === 'user' ? 'input_text' : 'output_text', text: item.content }],
          })) } : {}),
          audio: { format: { type: 'audio/pcmu', rate: 8000 }, output: { voice: options.voice ?? 'marin' } },
          delegation: { type: 'client' },
        },
      }))
    } catch {
      finish('provider_error')
    }
  }
  if (!ended) void connect()
  return () => finish('phone_closed')
}
