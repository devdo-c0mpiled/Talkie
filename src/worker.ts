import app from '@tanstack/react-start/server-entry'

export { SfuLiveSession } from './lib/sfu-live-object.server'
export { TelephoneListen } from './lib/telephone-listen-object.server'

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    if (url.pathname === '/api/sfu-live/media' || url.pathname.startsWith('/api/sfu-live/media/')) {
      const match = /^\/api\/sfu-live\/media\/([a-f0-9]{64})\/(input|output)\/([a-f0-9]{64})$/.exec(url.pathname)
      if (!match || request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Not found', { status: 404 })
      }
      try {
        const id = env.SFU_LIVE.idFromString(match[1])
        url.pathname = `/media/${match[2]}/${match[3]}`
        url.search = ''
        return env.SFU_LIVE.get(id).fetch(new Request(url, request))
      } catch {
        return new Response('Not found', { status: 404 })
      }
    }
    return Reflect.apply(app.fetch, app, [request, env, ctx])
  },
}
