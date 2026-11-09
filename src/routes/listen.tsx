import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { createTelephonePlayer } from '../lib/telephone-listen-audio'
import listenCss from '../telephone-listen.css?url'

export const Route = createFileRoute('/listen')({
  head: () => ({ meta: [{ title: 'Listen to a call — Talkie' }], links: [{ rel: 'stylesheet', href: listenCss }] }),
  component: ListenPage,
})

const conversationSchema = z.object({ id: z.string(), callerNumber: z.string().nullable(), createdAt: z.number() })
const incomingSchema = z.object({
  conversations: z.array(conversationSchema),
  selected: conversationSchema.extend({ calls: z.array(z.object({ callId: z.string(), createdAt: z.number(), state: z.enum(['connecting', 'active', 'complete', 'incomplete']) })) }).optional(),
})
const audioMessageSchema = z.union([
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('end') }),
  z.object({ track: z.enum(['phone', 'agent']), payload: z.string() }),
])
type Incoming = z.infer<typeof incomingSchema>
type Connection = { socket: WebSocket | null; player: ReturnType<typeof createTelephonePlayer>; endTimer: number | null; connectTimer: number | null }
type Status = 'idle' | 'connecting' | 'listening' | 'finishing' | 'ended' | 'error'
const formatTime = (time: number) => new Date(time).toLocaleString()

function ListenPage() {
  const [incoming, setIncoming] = useState<Incoming | null>(null)
  const [conversation, setConversation] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [listError, setListError] = useState('')
  const [reference, setReference] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [dropped, setDropped] = useState(false)
  const connection = useRef<Connection | null>(null)

  function disconnect() {
    const current = connection.current
    connection.current = null
    if (!current) return
    if (current.endTimer !== null) window.clearTimeout(current.endTimer)
    if (current.connectTimer !== null) window.clearTimeout(current.connectTimer)
    if (current.socket) {
      current.socket.onclose = null
      current.socket.onmessage = null
      current.socket.onerror = null
      current.socket.close()
    }
    current.player.stop()
  }

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    setReference(hash.get('reference') ?? '')
    return disconnect
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setListError('')
    const query = conversation ? `?conversation=${encodeURIComponent(conversation)}` : ''
    fetch(`/api/incoming${query}`, { signal: controller.signal })
      .then(async response => {
        if (response.status === 401) throw new Error('Sign in to see your incoming calls.')
        if (!response.ok) throw new Error('Could not load incoming calls. Refresh to try again.')
        const data = incomingSchema.parse(await response.json())
        if (conversation && data.selected?.id !== conversation) throw new Error('This conversation is unavailable.')
        return data
      })
      .then(data => { if (!controller.signal.aborted) setIncoming(data) })
      .catch(error => { if (!controller.signal.aborted) { setIncoming(null); setListError(error instanceof Error ? error.message : 'Could not load incoming calls.') } })
    return () => controller.abort()
  }, [conversation, refresh])

  async function listen(kind: 'call' | 'reference', value: string) {
    disconnect()
    setDropped(false)
    setStatus('connecting')
    let current: Connection | null = null
    try {
      const context = new AudioContext()
      current = { socket: null, player: createTelephonePlayer(context), endTimer: null, connectTimer: null }
      connection.current = current
      await context.resume()
      if (connection.current !== current) return
      const url = new URL('/api/telephone-listen', window.location.href)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.searchParams.set(kind, value)
      const socket = new WebSocket(url)
      current.socket = socket
      const active = current
      active.connectTimer = window.setTimeout(() => { if (connection.current === active) { disconnect(); setStatus('error') } }, 10000)
      socket.onmessage = event => {
        if (connection.current !== active || typeof event.data !== 'string') return
        try {
          const message = audioMessageSchema.parse(JSON.parse(event.data))
          if ('track' in message) {
            socket.send(JSON.stringify({ type: 'ack' }))
            if (!active.player.play(message.track, message.payload)) setDropped(true)
          } else if (message.type === 'ready') {
            if (active.connectTimer !== null) window.clearTimeout(active.connectTimer)
            active.connectTimer = null
            setStatus('listening')
          }
          else {
            setStatus('finishing')
            // Let the short scheduled tail play before releasing the audio device.
            active.endTimer = window.setTimeout(() => { if (connection.current === active) { disconnect(); setStatus('ended') } }, active.player.remainingMs() + 100)
          }
        } catch { disconnect(); setStatus('error') }
      }
      socket.onerror = () => { if (connection.current === active) { disconnect(); setStatus('error') } }
      socket.onclose = () => {
        if (connection.current !== active || active.endTimer !== null) return
        disconnect()
        setStatus('error')
      }
    } catch {
      if (!current || connection.current === current) { disconnect(); setStatus('error') }
    }
  }

  return <div className="telephone-listen" lang="en">
    <a href="/chat">← Back to chat</a>
    <h1>Listen to a live call</h1>
    <p>Listen to an active Talkie GPT-Live phone call. Your microphone is not used.</p>
    <p>Both sides can overlap. The audio may be delayed or out of sync: AI audio is heard as it is generated, which can differ from when the other person hears it. If the phone picks up its speaker, you may also hear echoed or repeated speech. Frames can be skipped to keep up.</p>
    <section aria-labelledby="incoming-heading">
      <h2 id="incoming-heading">Incoming calls</h2>
      <button type="button" onClick={() => setRefresh(value => value + 1)}>Refresh calls</button>
      {listError && <p role="alert">{listError} <a href="/login">Sign in</a></p>}
      {!incoming && !listError && <p>Loading calls…</p>}
      {incoming && incoming.conversations.length === 0 && <p>No incoming conversations yet. Refresh to check for a new call.</p>}
      {incoming && incoming.conversations.length > 0 && <>
        <label htmlFor="listen-conversation">Conversation</label>
        <select id="listen-conversation" value={conversation} onChange={event => { setIncoming({ conversations: incoming.conversations }); setConversation(event.target.value) }}>
          <option value="">Select a conversation</option>
          {incoming.conversations.map(item => <option key={item.id} value={item.id}>{item.callerNumber ?? 'Unknown caller'} · {formatTime(item.createdAt)}</option>)}
        </select>
        {incoming.selected && <ul>{incoming.selected.calls.map(call => <li key={call.callId}>
          {formatTime(call.createdAt)} · {call.state}{' '}
          {call.state === 'active' && <button type="button" onClick={() => void listen('call', call.callId)}>Listen</button>}
        </li>)}</ul>}
      </>}
    </section>
    <section aria-labelledby="reference-heading">
      <h2 id="reference-heading">Outgoing call</h2>
      <label htmlFor="listen-reference">Signed call reference</label>
      <input id="listen-reference" value={reference} onChange={event => setReference(event.target.value)} autoComplete="off" />
      <button type="button" disabled={!reference.trim()} onClick={() => void listen('reference', reference.trim())}>Listen</button>
    </section>
    <section aria-label="Playback status" aria-live="polite">
      {status === 'idle' && <p>Select a live call to start listening.</p>}
      {status === 'connecting' && <p>Connecting…</p>}
      {status === 'listening' && <p>Listening live.</p>}
      {status === 'finishing' && <p>The call ended. Playing remaining audio.</p>}
      {status === 'ended' && <p>The call ended.</p>}
      {status === 'error' && <p>Could not listen. The call may have ended, may not support live listening, or may be unavailable to this account.</p>}
      {dropped && <p>Some audio was skipped to limit playback delay.</p>}
      {(status === 'connecting' || status === 'listening' || status === 'finishing') && <button type="button" onClick={() => { disconnect(); setStatus('idle') }}>Stop listening</button>}
    </section>
  </div>
}
