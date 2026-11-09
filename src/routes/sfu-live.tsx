import { createFileRoute } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { startSfuLive as StartSfuLive } from '../lib/sfu-live.client'

export const Route = createFileRoute('/sfu-live')({ component: SfuLivePage })

const trackSchema = z.object({ sessionId: z.string().min(1), trackName: z.string().min(1) })
type Track = z.infer<typeof trackSchema>
type Connection = Awaited<ReturnType<typeof startSfuLive>>
type Status = 'idle' | 'connecting' | 'connected' | 'error'
const startSfuLive = createClientOnlyFn(async (...args: Parameters<typeof StartSfuLive>) =>
  (await import('../lib/sfu-live.client')).startSfuLive(...args))

async function post(body: unknown): Promise<unknown> {
  const response = await fetch('/api/sfu-live', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (response.status === 401) throw new Error('Sign in to start a voice conversation.')
  if (!response.ok) throw new Error('Voice conversation is unavailable. Try again later.')
  return response.json()
}

function SfuLivePage() {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const audio = useRef<HTMLAudioElement>(null)
  const connection = useRef<Connection | null>(null)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const mounted = useRef(true)

  async function disconnect() {
    generation.current++
    controller.current?.abort()
    controller.current = null
    const current = connection.current
    connection.current = null
    if (audio.current) {
      audio.current.pause()
      audio.current.srcObject = null
    }
    if (current) await current.stop()
  }

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; void disconnect().catch(() => {}) }
  }, [])

  async function start() {
    if (status === 'connecting' || status === 'connected') return
    const id = ++generation.current
    const abort = new AbortController()
    controller.current = abort
    setMessage('')
    setStatus('connecting')
    try {
      const result = await startSfuLive({
        signal: abort.signal,
        control: request => post({ action: 'control', request }),
        startBridge: async (source: Track) => {
          const value = await post({ action: 'start', source })
          return trackSchema.parse(value)
        },
        stopBridge: async (source: Track) => { await post({ action: 'stop', source }) },
        onError: () => {
          if (mounted.current && generation.current === id) {
            void disconnect().catch(() => {})
            setMessage('The voice connection ended unexpectedly.')
            setStatus('error')
          }
        },
      })
      if (!mounted.current || generation.current !== id) { await result.stop(); return }
      connection.current = result
      if (!audio.current) throw new Error('Audio playback is unavailable.')
      audio.current.srcObject = result.output
      await audio.current.play()
      if (mounted.current && generation.current === id) setStatus('connected')
    } catch (error) {
      if (!mounted.current || generation.current !== id) return
      try { await disconnect() } catch { /* The original error remains useful to the user. */ }
      setMessage(error instanceof Error ? error.message : 'Voice conversation could not start.')
      setStatus('error')
    }
  }

  async function stop() {
    try { await disconnect(); if (mounted.current) setStatus('idle') }
    catch { if (mounted.current) { setMessage('The connection closed, but server cleanup could not be confirmed.'); setStatus('error') } }
  }

  return <main>
    <a href="/chat">← Back to chat</a>
    <h1>AI voice conversation</h1>
    <p>Experimental: the SFU and GPT-Live connection has not yet been verified with live services.</p>
    <p>This uses Cloudflare Realtime SFU, separately from RealtimeKit. It does not connect to a phone call; external telephone calls still use a ClawOps line.</p>
    <audio ref={audio} autoPlay />
    <div aria-live="polite">
      {status === 'idle' && <p>Start to talk to the AI assistant using your microphone.</p>}
      {status === 'connecting' && <p>Connecting…</p>}
      {status === 'connected' && <p>SFU connections established. AI audio readiness and live service behavior are unverified.</p>}
      {status === 'error' && <p role="alert">{message} <a href="/login">Sign in</a></p>}
    </div>
    {status === 'connecting' || status === 'connected'
      ? <button type="button" onClick={stop}>Stop</button>
      : <button type="button" onClick={start}>Start voice conversation</button>}
  </main>
}
