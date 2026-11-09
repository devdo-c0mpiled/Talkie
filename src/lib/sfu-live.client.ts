import { z } from 'zod'

type Track = { sessionId: string; trackName: string }
type Description = { type: 'offer' | 'answer'; sdp: string }
type ControlRequest =
  | { operation: 'session/new' }
  | { operation: 'tracks/new'; sessionId: string; body: { sessionDescription?: Description; tracks: ({ location: 'local'; mid: string; trackName: string } | ({ location: 'remote' } & Track))[] } }
  | { operation: 'renegotiate'; sessionId: string; body: { sessionDescription: Description } }
  | { operation: 'tracks/close'; sessionId: string; body: { tracks: { mid: string }[]; force: true } }

type Options = {
  control: (request: ControlRequest) => Promise<unknown>
  startBridge: (track: Track) => Promise<Track>
  stopBridge: (track: Track) => Promise<void>
  rtcConfiguration?: RTCConfiguration
  signal?: AbortSignal
  onError?: (error: Error) => void
}

const sessionSchema = z.object({ sessionId: z.string().min(1) })
const trackSchema = z.object({ mid: z.string().min(1).optional(), errorCode: z.string().optional(), errorDescription: z.string().optional() })
const responseSchema = z.object({
  errorCode: z.string().optional(), errorDescription: z.string().optional(),
  sessionDescription: z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().min(1) }),
  tracks: z.array(trackSchema).length(1),
})
const okSchema = z.object({ errorCode: z.string().optional(), errorDescription: z.string().optional() })
const closeSchema = okSchema.extend({ tracks: z.array(trackSchema).length(1) })
const bridgeSchema = z.object({ sessionId: z.string().min(1), trackName: z.string().min(1) })
const TIMEOUT_MS = 15_000

function checkError(value: { errorCode?: string; errorDescription?: string }) {
  if (value.errorCode) throw new Error(`SFU ${value.errorCode}: ${value.errorDescription ?? 'request failed'}`)
}

function waitFor(pc: RTCPeerConnection, kind: 'ice' | 'connection'): Promise<void> {
  return new Promise((resolve, reject) => {
    const event = kind === 'ice' ? 'icegatheringstatechange' : 'connectionstatechange'
    const timer = setTimeout(() => finish(new Error(`SFU ${kind} timed out`)), TIMEOUT_MS)
    function finish(error?: Error) {
      clearTimeout(timer)
      pc.removeEventListener(event, check)
      if (kind === 'ice') pc.removeEventListener('connectionstatechange', check)
      if (error) reject(error)
      else resolve()
    }
    function check() {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') return finish(new Error(`SFU connection ${pc.connectionState}`))
      if (kind === 'ice' ? pc.iceGatheringState === 'complete' : pc.connectionState === 'connected') finish()
    }
    pc.addEventListener(event, check)
    if (kind === 'ice') pc.addEventListener('connectionstatechange', check)
    check()
  })
}

function localDescription(pc: RTCPeerConnection, expected: 'offer' | 'answer'): Description {
  const description = pc.localDescription
  if (!description || description.type !== expected || !description.sdp) throw new Error(`Missing SFU ${expected}`)
  return { type: expected, sdp: description.sdp }
}

/** Creates two independent SFU connections; the caller attaches output to an audio element. */
export async function startSfuLive(options: Options): Promise<{ output: MediaStream; stop: () => Promise<void> }> {
  const config = options.rtcConfiguration ?? { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] }
  const peers: RTCPeerConnection[] = []
  let input: MediaStream | undefined
  let output: MediaStream | undefined
  let bridge: Track | undefined
  let bridgeStarting: Promise<Track> | undefined
  const allocations: { sessionId: string; mid: string }[] = []
  const pending = new Set<Promise<unknown>>()
  let stopped = false
  let stopPromise: Promise<void> | undefined

  function stop(): Promise<void> {
    if (stopPromise) return stopPromise
    stopped = true
    options.signal?.removeEventListener('abort', abort)
    for (const peer of peers) peer.close()
    for (const track of input?.getTracks() ?? []) track.stop()
    for (const track of output?.getTracks() ?? []) track.stop()
    stopPromise = Promise.resolve().then(async () => {
      if (bridgeStarting) await bridgeStarting.catch(() => {})
      await Promise.allSettled([...pending])
      const bridgeToStop = bridge
      const cleanup = [
        ...allocations.map(async ({ sessionId, mid }) => {
          const result = closeSchema.parse(await options.control({ operation: 'tracks/close', sessionId, body: { tracks: [{ mid }], force: true } }))
          checkError(result)
          checkError(result.tracks[0])
          if (result.tracks[0].mid !== mid) throw new Error('SFU track close returned the wrong mid')
        }),
        ...(bridgeToStop ? [Promise.resolve().then(() => options.stopBridge(bridgeToStop))] : []),
      ]
      const failures = (await Promise.allSettled(cleanup)).filter(result => result.status === 'rejected')
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'SFU cleanup failed')
    })
    return stopPromise
  }

  function abort() { void stop().catch(() => {}) }
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()

  function peer(): RTCPeerConnection {
    const pc = new RTCPeerConnection(config)
    peers.push(pc)
    pc.addEventListener('connectionstatechange', () => {
      if (!stopped && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) {
        const error = new Error(`SFU connection ${pc.connectionState}`)
        void stop().then(() => options.onError?.(error), cleanupError => options.onError?.(new AggregateError([error, cleanupError], 'SFU connection and cleanup failed')))
      }
    })
    return pc
  }

  async function request(value: ControlRequest, onResult?: (result: unknown) => void): Promise<unknown> {
    if (stopped) throw new Error('SFU connection closed')
    const operation = Promise.resolve().then(() => options.control(value)).then(result => { onResult?.(result); return result })
    pending.add(operation)
    try {
      const result = await operation
      if (stopped) throw new Error('SFU connection closed')
      return result
    } finally {
      pending.delete(operation)
    }
  }

  try {
    if (stopped) throw new Error('SFU connection closed')
    input = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 48000, channelCount: 1 }, video: false })
    if (stopped) {
      for (const track of input.getTracks()) track.stop()
      throw new Error('SFU connection closed')
    }
    const audio = input.getAudioTracks()[0]
    if (!audio) throw new Error('Microphone has no audio track')
    const publisher = peer()
    const transceiver = publisher.addTransceiver(audio, { direction: 'sendonly' })
    await publisher.setLocalDescription(await publisher.createOffer())
    await waitFor(publisher, 'ice')
    if (!transceiver.mid) throw new Error('Missing publisher mid')
    const source = { sessionId: sessionSchema.parse(await request({ operation: 'session/new' })).sessionId, trackName: crypto.randomUUID() }
    const published = responseSchema.parse(await request({ operation: 'tracks/new', sessionId: source.sessionId, body: {
      sessionDescription: localDescription(publisher, 'offer'), tracks: [{ location: 'local', mid: transceiver.mid, trackName: source.trackName }],
    } }, result => {
      const track = z.object({ tracks: z.array(trackSchema).length(1) }).safeParse(result)
      if (track.success && !track.data.tracks[0].errorCode && track.data.tracks[0].mid) allocations.push({ sessionId: source.sessionId, mid: track.data.tracks[0].mid })
    }))
    checkError(published)
    checkError(published.tracks[0])
    if (published.tracks[0].mid !== transceiver.mid) throw new Error('SFU returned the wrong publisher mid')
    if (published.sessionDescription.type !== 'answer') throw new Error('Expected SFU answer')
    await publisher.setRemoteDescription(published.sessionDescription)
    await waitFor(publisher, 'connection')
    if (stopped) throw new Error('SFU connection closed')

    // Retain the source before startup so a later receiver failure can stop the bridge.
    bridge = source
    bridgeStarting = options.startBridge(source)
    const remote = bridgeSchema.parse(await bridgeStarting)
    if (stopped) throw new Error('SFU connection closed')
    const receiver = peer()
    output = new MediaStream()
    const receiverId = sessionSchema.parse(await request({ operation: 'session/new' })).sessionId
    const subscription = responseSchema.parse(await request({ operation: 'tracks/new', sessionId: receiverId, body: {
      tracks: [{ location: 'remote', ...remote }],
    } }, result => {
      const track = z.object({ tracks: z.array(trackSchema).length(1) }).safeParse(result)
      if (track.success && !track.data.tracks[0].errorCode && track.data.tracks[0].mid) allocations.push({ sessionId: receiverId, mid: track.data.tracks[0].mid })
    }))
    checkError(subscription)
    checkError(subscription.tracks[0])
    if (!subscription.tracks[0].mid) throw new Error('Missing receiver mid')
    if (subscription.sessionDescription.type !== 'offer') throw new Error('Expected SFU offer')
    receiver.addEventListener('track', event => {
      if (stopped) event.track.stop()
      else if (event.track.kind === 'audio' && event.transceiver.mid === subscription.tracks[0].mid) {
        const ended = () => {
          if (stopped) return
          const error = new Error('SFU output audio ended')
          void stop().then(() => options.onError?.(error), cleanupError => options.onError?.(new AggregateError([error, cleanupError], 'SFU audio and cleanup failed')))
        }
        event.track.addEventListener('ended', ended, { once: true })
        if (event.track.readyState === 'ended') ended()
        else output?.addTrack(event.track)
      }
    })
    await receiver.setRemoteDescription(subscription.sessionDescription)
    await receiver.setLocalDescription(await receiver.createAnswer())
    await waitFor(receiver, 'ice')
    const result = okSchema.parse(await request({ operation: 'renegotiate', sessionId: receiverId, body: { sessionDescription: localDescription(receiver, 'answer') } }))
    checkError(result)
    await waitFor(receiver, 'connection')
    if (stopped) throw new Error('SFU connection closed')
    return { output, stop }
  } catch (error) {
    try { await stop() } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'SFU startup and cleanup failed') }
    throw error
  }
}
