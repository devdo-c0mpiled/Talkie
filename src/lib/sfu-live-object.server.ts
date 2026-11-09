import { createLiveDelegation } from './live-delegation.server'
import { createSfuApi, SfuApiError } from './sfu-api.server'
import { startSfuLiveBridge } from './sfu-live-bridge.server'

type Env = { REALTIME_SFU_APP_ID: string; REALTIME_SFU_APP_SECRET: string; SFU_LIVE_PUBLIC_ORIGIN: string; OPENAI_API_KEY: string }
type Session = { inputToken: string; outputToken: string; adapterIds: string[]; expires: number; cleanupFailed?: boolean }
type Start = { sessionId: string; trackName: string; instructions: string; voice?: string }
const SESSION_MS = 60 * 60 * 1000
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('')

// Only the authenticated application router may call /start and /stop. The
// public WebSocket router must forward /media alone, never arbitrary paths.
export class SfuLiveSession {
  private bridge?: ReturnType<typeof startSfuLiveBridge>
  private stopped = false
  private cleanupPromise?: Promise<void>
  private pendingAllocation?: Promise<unknown>
  private session?: Session
  private api: ReturnType<typeof createSfuApi>

  constructor(private state: DurableObjectState, private env: Env) {
    this.api = createSfuApi({ appId: env.REALTIME_SFU_APP_ID, appSecret: env.REALTIME_SFU_APP_SECRET })
    state.blockConcurrencyWhile(async () => { this.session = await state.storage.get<Session>('session') })
  }

  private async save() { await this.state.storage.put('session', this.session) }

  private async cleanup() {
    if (this.cleanupPromise) return this.cleanupPromise
    this.cleanupPromise = (async () => {
      if (this.pendingAllocation) await this.pendingAllocation.catch(() => {})
      if (!this.session || this.session.cleanupFailed) return
      const failed: string[] = []
      for (const id of this.session.adapterIds) {
        try { await this.api.closeAdapter(id) } catch { failed.push(id) }
      }
      this.session.adapterIds = failed
      if (failed.length) {
        this.session.cleanupFailed = true
        await this.save()
        await this.state.storage.deleteAlarm()
      } else {
        this.session = undefined
        await this.state.storage.delete('session')
        await this.state.storage.deleteAlarm()
      }
    })().finally(() => { this.cleanupPromise = undefined })
    return this.cleanupPromise
  }

  async alarm() {
    this.stopped = true
    this.bridge?.stop()
    await this.cleanup()
  }

  private async start(data: Start) {
    if (this.session || this.bridge || this.stopped) throw new Error('Session already used')
    if (!data || typeof data.sessionId !== 'string' || !data.sessionId || data.sessionId.length > 256 ||
        typeof data.trackName !== 'string' || !data.trackName || data.trackName.length > 1024 ||
        typeof data.instructions !== 'string' || data.instructions.length > 20_000 ||
        (data.voice !== undefined && (typeof data.voice !== 'string' || data.voice.length > 100))) throw new Error('Invalid session request')
    const origin = new URL(this.env.SFU_LIVE_PUBLIC_ORIGIN)
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid public origin')
    this.session = { inputToken: token(), outputToken: token(), adapterIds: [], expires: Date.now() + SESSION_MS }
    await this.save()
    await this.state.storage.setAlarm(this.session.expires)
    const base = `wss://${origin.host}/api/sfu-live/media/${this.state.id.toString()}`
    const endpoints = { input: `${base}/input/${this.session.inputToken}`, output: `${base}/output/${this.session.outputToken}` }
    let send: (event: Record<string, unknown>) => boolean = () => false
    const delegation = createLiveDelegation({ instructions: data.instructions, send: event => { send(event) } })
    this.bridge = startSfuLiveBridge({
      apiKey: this.env.OPENAI_API_KEY, instructions: data.instructions, voice: data.voice,
      onEvent: (event, reply) => { send = reply; return delegation.handle(event) },
      onEnd: () => { this.stopped = true; delegation.close(); return this.cleanup() },
    })
    const addAdapter = async (spec: Parameters<typeof this.api.createAdapter>[0]) => {
      const pending = (async () => {
        try {
          const adapter = await this.api.createAdapter(spec)
          if (!this.session) throw new Error('Session state unavailable')
          this.session.adapterIds.push(adapter.adapterId)
          await this.save()
          return adapter
        } catch (error) {
          if (error instanceof SfuApiError && error.adapterId && this.session) {
            this.session.adapterIds.push(error.adapterId)
            await this.save()
          }
          throw error
        }
      })()
      this.pendingAllocation = pending
      try {
        const adapter = await pending
        if (this.stopped) throw new Error('Session stopped during adapter creation')
        return adapter
      } finally {
        if (this.pendingAllocation === pending) this.pendingAllocation = undefined
      }
    }
    try {
      const outputTrack = `live-${crypto.randomUUID()}`
      const output = await addAdapter({ location: 'local', trackName: outputTrack, endpoint: endpoints.output })
      if (!output.sessionId) throw new Error('Missing output session')
      await addAdapter({ location: 'remote', sessionId: data.sessionId, trackName: data.trackName, endpoint: endpoints.input })
      return { sessionId: output.sessionId, trackName: outputTrack }
    } catch (error) {
      this.stopped = true
      this.bridge.stop()
      await this.cleanup()
      throw error
    }
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    if (path === '/start' && request.method === 'POST') {
      try { return Response.json(await this.start(await request.json() as Start)) }
      catch { return Response.json({ error: 'Unable to start SFU Live session' }, { status: 502 }) }
    }
    if (path === '/stop' && request.method === 'POST') {
      this.stopped = true
      this.bridge?.stop()
      if (!this.bridge) await this.cleanup()
      return Response.json({ stopping: true })
    }
    const match = /^\/media\/(input|output)\/([a-f0-9]{64})$/.exec(path)
    if (!match || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' || !this.session || this.stopped ||
        Date.now() >= this.session.expires || match[2] !== (match[1] === 'input' ? this.session.inputToken : this.session.outputToken)) return new Response('Not found', { status: 404 })
    if (!this.bridge) { this.stopped = true; await this.cleanup(); return new Response('Session ended', { status: 410 }) }
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()
    try {
      if (match[1] === 'input') this.bridge.attachInput(server)
      else this.bridge.attachOutput(server)
    } catch { server.close(1008, 'Unavailable'); return new Response('Unavailable', { status: 409 }) }
    return new Response(null, { status: 101, webSocket: client })
  }
}
