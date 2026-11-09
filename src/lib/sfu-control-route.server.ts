import '@tanstack/react-start/server-only'
import { env } from 'cloudflare:workers'
import { getAuth } from './auth.server'
import { createSfuApi } from './sfu-api.server'
import { handleSfuControl } from './sfu-control.server'

export async function handleSfuControlRoute(request: Request): Promise<Response> {
  const configured = env as typeof env & { REALTIME_SFU_APP_ID?: string; REALTIME_SFU_APP_SECRET?: string; SFU_LIVE?: DurableObjectNamespace }
  if (!configured.BETTER_AUTH_URL || !configured.REALTIME_SFU_APP_ID || !configured.REALTIME_SFU_APP_SECRET || !configured.SFU_LIVE) return Response.json({ error: 'SFU Live unavailable' }, { status: 503 })
  if (request.headers.get('Origin') !== new URL(configured.BETTER_AUTH_URL).origin) return Response.json({ error: 'Forbidden' }, { status: 403 })
  const auth = await getAuth().api.getSession({ headers: request.headers })
  const settings = auth ? await configured.DB.prepare(`SELECT s.voice, s.language, s.response_rules FROM customers c
    LEFT JOIN agent_settings s ON s.customer_no = c.customer_no WHERE c.user_id = ?`).bind(auth.user.id).first<{ voice: string | null; language: string | null; response_rules: string | null }>() : null
  const instructions = `You are a helpful voice assistant. Respond briefly in the caller's language. Do not claim an action was completed unless it was actually completed.${settings?.language ? ` Preferred language: ${settings.language}.` : ''}${settings?.response_rules ? ` Customer preferences: ${settings.response_rules}` : ''}`
  return handleSfuControl(request, { db: configured.DB, api: createSfuApi({ appId: configured.REALTIME_SFU_APP_ID, appSecret: configured.REALTIME_SFU_APP_SECRET }), objects: configured.SFU_LIVE, userId: auth?.user.id ?? null, origin: new URL(configured.BETTER_AUTH_URL).origin, instructions, ...(settings?.voice ? { voice: settings.voice } : {}) })
}
