import '@tanstack/react-start/server-only'

import { chat } from '@tanstack/ai'
import { getOpenAiChat } from './ai.server'

type Commentary = {
  type: 'session.commentary.append'
  delegation_id: string
  content: string
}

type Transcript = { role: 'user' | 'assistant'; content: string }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// One instance belongs to one Live session. Transcript and IDs never leave it.
export function createLiveDelegation({ send }: { send: (event: Commentary) => void }) {
  let transcript: Transcript[] = []
  let inputRevision = 0
  let closed = false
  const threadId = crypto.randomUUID()
  const seen = new Set<string>()
  const running = new Set<AbortController>()

  function addTranscript(role: Transcript['role'], delta: string) {
    if (!delta) return
    if (role === 'user') inputRevision++
    const last = transcript.at(-1)
    if (last?.role === role) last.content += delta
    else transcript.push({ role, content: delta })
    // ponytail: retain only the last 12,000 characters and 80 turns per call;
    // persist and summarize externally if calls need longer history.
    transcript = transcript.slice(-80)
    let budget = 12_000
    for (let i = transcript.length - 1; i >= 0; i--) {
      transcript[i].content = transcript[i].content.slice(-budget)
      budget -= transcript[i].content.length
      if (!budget) {
        transcript = transcript.slice(i)
        break
      }
    }
  }

  function reply(id: string, content: string) {
    if (closed) return
    // Live accepts at most 500 tokens; a 400-byte UTF-8 ceiling stays below it.
    const bytes = new TextEncoder().encode(content)
    const limited = new TextDecoder().decode(bytes.slice(0, 400)).replace(/\uFFFD$/, '')
    send({ type: 'session.commentary.append', delegation_id: id, content: limited })
  }

  async function handle(value: unknown): Promise<void> {
    if (closed || !record(value)) return
    if (value.type === 'session.input_transcript.delta' && typeof value.delta === 'string') {
      addTranscript('user', value.delta)
      return
    }
    if (value.type === 'session.output_transcript.delta' && typeof value.delta === 'string') {
      addTranscript('assistant', value.delta)
      return
    }
    if (value.type !== 'session.delegation.created' || !record(value.delegation)) return
    const { id, target } = value.delegation
    if (target !== 'client' || typeof id !== 'string' || !id || id.length > 256 || seen.has(id)) return
    // Keep all IDs for the session rather than evicting and risking replay.
    if (seen.size >= 512) return
    seen.add(id)
    if (running.size >= 2 || !transcript.some((message) => message.role === 'user' && message.content.trim())) {
      reply(id, '지금은 요청을 처리할 수 없습니다. 다시 말씀해 주세요.')
      return
    }

    const messages = transcript.map((message) => ({ ...message }))
    const revision = inputRevision
    const abortController = new AbortController()
    running.add(abortController)
    const timer = setTimeout(() => abortController.abort(), 15_000)
    try {
      let result = ''
      let failed = false
      for await (const chunk of chat({
        adapter: getOpenAiChat(),
        threadId,
        messages,
        systemPrompts: ['You are a voice assistant backend. Respond briefly in the caller’s language. Do not claim an action was completed unless it was actually completed.'],
        abortController,
      })) {
        if (chunk.type === 'TEXT_MESSAGE_CONTENT') result += chunk.delta
        if (chunk.type === 'RUN_ERROR') failed = true
        if (result.length > 4000) {
          abortController.abort()
          failed = true
          break
        }
      }
      if (inputRevision !== revision) {
        reply(id, '추가로 말씀하신 내용을 먼저 확인해 주세요.')
      } else if (failed || abortController.signal.aborted || !result.trim()) {
        reply(id, '요청을 처리하지 못했습니다. 다시 말씀해 주세요.')
      } else {
        reply(id, result.trim())
      }
    } catch {
      reply(id, '요청을 처리하지 못했습니다. 다시 말씀해 주세요.')
    } finally {
      clearTimeout(timer)
      running.delete(abortController)
    }
  }

  return {
    handle,
    close() {
      closed = true
      for (const controller of running) controller.abort()
      running.clear()
      transcript = []
      seen.clear()
    },
  }
}
