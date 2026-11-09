type ListenDependencies = {
  db: D1Database
  namespace: DurableObjectNamespace
  userId: (request: Request) => Promise<string | null>
  fromReference: (reference: string) => Promise<string | null>
}

export async function handleTelephoneListen(request: Request, deps: ListenDependencies): Promise<Response> {
  const url = new URL(request.url)
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 400 })
  if (request.headers.get('Origin') !== url.origin) return new Response('Invalid origin', { status: 403 })
  const params = url.searchParams
  if ([...params.keys()].some(key => !['call', 'reference'].includes(key)) ||
      params.getAll('call').length + params.getAll('reference').length !== 1) return new Response('Invalid call', { status: 400 })

  let callId: string | null
  const call = params.get('call')
  if (call !== null) {
    if (!/^[\w-]{1,256}$/.test(call)) return new Response('Invalid call', { status: 400 })
    const userId = await deps.userId(request)
    if (!userId) return new Response('Unauthorized', { status: 401 })
    const owned = await deps.db.prepare(`SELECT cc.call_id FROM inbound_conversation_calls cc
      JOIN inbound_conversations c ON c.id = cc.conversation_id
      JOIN customers u ON c.customer_id = printf('%04d', u.customer_no)
      WHERE cc.call_id = ? AND u.user_id = ?`).bind(call, userId).first()
    callId = owned ? call : null
  } else {
    const reference = params.get('reference') ?? ''
    callId = reference.length <= 300 ? await deps.fromReference(reference) : null
  }
  if (!callId) return new Response('Not found', { status: 404 })
  const active = await deps.db.prepare(`SELECT call_id FROM live_calls WHERE call_id = ?
    AND bridge_started_at IS NOT NULL AND bridge_finished_at IS NULL AND bridge_failed_at IS NULL`)
    .bind(callId).first()
  if (!active) return new Response('Not found', { status: 404 })
  const stub = deps.namespace.get(deps.namespace.idFromName(callId))
  return stub.fetch(new Request('https://telephone-listen.internal/listen', request))
}
