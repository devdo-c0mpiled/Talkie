import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, SubmitEvent } from 'react'
import tokie from '../../assets/landing/tokie.webp'
import {
  CALL_ENDED_MARKER,
  CALL_NUMBER_STORAGE_KEY,
  callBusinessDef,
  issueKoreanNumberDef,
} from '../../lib/chat-tools'
import type { CallLine, CallPlaced, CallRequest, KoreanNumber } from '../../lib/chat-tools'
import { LineIcon } from '../landing/LineIcon'
import { HotelRehearsal } from './HotelRehearsal'
import { HotelWorkflowCard } from './HotelWorkflowCard'
import { hotelInquiryDef, hotelStatusDef } from '../../lib/hotel-workflow-tools'
import type { Workflow } from '../../lib/hotel-workflow'

const DIGIT_HEIGHT = 34
const CALL_POLL_MS = 1500
// Shown before the traveler has said anything; it is not part of the conversation sent to the model.
const GREETING = "Hi, I'm Tokie! Tell me what you want to book in Korea and I'll help, in your language."
const quickReplies = ['What will you say on the call?', 'Can you call them for me?']

function isKoreanNumber(value: unknown): value is KoreanNumber {
  return typeof value === 'object' && value !== null && typeof (value as KoreanNumber).number === 'string' && typeof (value as KoreanNumber).activeUntil === 'string'
}

function TokieAvatar() {
  return <span className="lp-tokie-ava" aria-hidden="true"><img src={tokie} alt="" /></span>
}

/** The number, with each digit rolling into place like a counter. */
function RollingNumber({ number }: { number: string }) {
  let digitCount = 0
  return (
    <p className="ch-number">
      <span className="lp-sr-only">{number}</span>
      {[...number].map((char, index) => {
        if (!/\d/.test(char)) return <span key={index} className="ch-digit" aria-hidden="true"><b>{char === ' ' ? ' ' : char}</b></span>
        // A strip counting 0–9 once and then on to the digit, scrolled up to its last entry.
        const stops = 10 + Number(char)
        const style = { '--ch-roll-to': `-${stops * DIGIT_HEIGHT}px`, animationDelay: `${digitCount++ * 70}ms` } as CSSProperties
        return (
          <span key={index} className="ch-digit" aria-hidden="true">
            <span className="ch-digit-strip" style={style}>
              {Array.from({ length: stops + 1 }, (_, value) => <b key={value}>{value % 10}</b>)}
            </span>
          </span>
        )
      })}
    </p>
  )
}

type NumberCardProps = KoreanNumber & { onNotify: (text: string) => void }

function NumberCard({ number, activeUntil, onNotify }: NumberCardProps) {
  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(number.replace(/[^+\d]/g, ''))
      onNotify('Copied')
    } catch {
      onNotify('Couldn’t copy the number')
    }
  }

  async function shareNumber() {
    if (!navigator.share) return copyNumber()
    try {
      await navigator.share({ text: number })
    } catch {
      // Sharing was dismissed; nothing to do.
    }
  }

  return (
    <div className="ch-card">
      <p className="ch-card-eyebrow">Your Korean number</p>
      <RollingNumber number={number} />
      <p className="ch-card-meta">Your Tokie number · active until {activeUntil}</p>
      <div className="ch-card-actions">
        <button type="button" className="ch-btn-primary" onClick={copyNumber}><LineIcon name="copy" size={16} />Copy number</button>
        <button type="button" className="ch-btn-soft" onClick={shareNumber}><LineIcon name="share" size={16} />Share with the clinic</button>
      </div>
    </div>
  )
}

/** Asks the traveler before Tokie phones anyone. */
function CallApproval({ request, onDecide }: { request: CallRequest; onDecide: (approved: boolean) => void }) {
  return (
    <div className="ch-card">
      <p className="ch-card-eyebrow">Call for you?</p>
      <p className="ch-card-title">{request.businessName}</p>
      <p className="ch-card-meta">{request.phoneNumber} · {request.purpose}</p>
      <div className="ch-card-actions">
        <button type="button" className="ch-btn-primary" onClick={() => onDecide(true)}><LineIcon name="phone" size={16} />Call now</button>
        <button type="button" className="ch-btn-soft" onClick={() => onDecide(false)}>Not now</button>
      </div>
    </div>
  )
}

type CallState = 'calling' | 'done'

type CallLiveProps = {
  reference: string
  business: string
  /** Called once, when the call is over. */
  onDone: (reference: string) => void
  /** Called whenever something new was said, so the feed can keep it in view. */
  onActivity: () => void
}

/** Follows a placed call: shows what is being said as it happens, and reports once when the call is over. */
function CallLive({ reference, business, onDone, onActivity }: CallLiveProps) {
  const [state, setState] = useState<CallState>('calling')
  const [lines, setLines] = useState<CallLine[]>([])
  // The latest callbacks, so the polling loop below never has to restart for them.
  const callbacks = useRef({ onDone, onActivity })
  callbacks.current = { onDone, onActivity }

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let seen = ''
    async function poll() {
      let next: CallState = 'calling'
      try {
        const response = await fetch(`/api/calls/${encodeURIComponent(reference)}`)
        if (response.ok) {
          const progress = (await response.json()) as { state: CallState; lines: CallLine[] }
          next = progress.state
          const signature = JSON.stringify(progress.lines)
          if (!stopped && signature !== seen) {
            seen = signature
            setLines(progress.lines)
            callbacks.current.onActivity()
          }
        } else {
          // A call that can no longer be looked up will not get any further.
          next = 'done'
        }
      } catch {
        // Network hiccup: try again on the next tick.
      }
      if (stopped) return
      if (next !== 'done') {
        timer = setTimeout(poll, CALL_POLL_MS)
        return
      }
      setState('done')
      callbacks.current.onDone(reference)
    }
    timer = setTimeout(poll, CALL_POLL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [reference])

  return (
    <div className="ch-card ch-call">
      <p className="ch-card-eyebrow">{state === 'calling' ? <><span className="ch-live" aria-hidden="true" /> Live call</> : 'Call finished'}</p>
      <p className="ch-card-title">{business}</p>
      {lines.length > 0 ? (
        <ol className="ch-call-lines" lang="ko">
          {lines.map(({ id, role, text, final }) => (
            <li key={id} className={final ? undefined : 'is-partial'}>
              <span lang="en">{role === 'agent' ? 'Tokie' : 'Them'}</span>
              {text}
            </li>
          ))}
        </ol>
      ) : (
        <p className="ch-card-meta">{state === 'calling' ? 'Ringing…' : 'Nothing was said on this call.'}</p>
      )}
    </div>
  )
}

/** One line of the feed: a text bubble, the number card, or a call with its live transcript. */
type Row = { key: string; mine: boolean } & ({ text: string } | { card: KoreanNumber } | { call: string; business: string })

export function TokieChat({ hotelHarness = false, hotelScenario = 'booking', onHotelScenarioChange, hotelWorkflow = hotelHarness }: { hotelWorkflow?: boolean; hotelHarness?: boolean; hotelScenario?: string; onHotelScenarioChange?: (id:string)=>void }) {
  // One conversation per visit: the id only has to stay stable while this screen is mounted.
  const [threadId] = useState(() => crypto.randomUUID())
  const { messages, sendMessage, isLoading, error, interrupts } = useChat({
    connection: fetchServerSentEvents(hotelWorkflow ? '/api/hotel-chat' : '/api/chat'),
    threadId,
    tools: hotelWorkflow ? [hotelInquiryDef,hotelStatusDef] : [issueKoreanNumberDef, callBusinessDef],
  })
  const [draft, setDraft] = useState('')
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  // Calls whose result still has to be handed to Tokie, and those already handed over.
  const [endedCalls, setEndedCalls] = useState<string[]>([])
  const reportedCalls = useRef(new Set<string>())
  const feed = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const [hotelState,setHotelState]=useState<Workflow|null>(null)
  const [hotelError,setHotelError]=useState<string|null>(null)
  const [hotelBusy,setHotelBusy]=useState(false)
  async function hotelRequest(action: string, extra: Record<string,unknown> = {}) {
    const response=await fetch('/api/hotel-workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:threadId,action,...extra})})
    const result=await response.json() as {state?:Workflow;error?:string}
    if(!response.ok||!result.state)throw Error(result.error??'호텔 처리 결과를 확인하지 못했습니다.')
    return result.state
  }
  useEffect(()=>{
    if(!hotelWorkflow)return
    let stopped=false
    hotelRequest('start',{scenario:hotelScenario}).then(state=>{if(!stopped){setHotelState(state);setHotelError(null)}}).catch(error=>{if(!stopped)setHotelError(error.message)})
    return ()=>{stopped=true}
  },[threadId,hotelWorkflow,hotelScenario])
  useEffect(()=>{
    if(!hotelWorkflow||isLoading||!hotelState)return
    let stopped=false
    hotelRequest('read').then(state=>{if(!stopped)setHotelState(state)}).catch(error=>{if(!stopped)setHotelError(error.message)})
    return ()=>{stopped=true}
  },[messages,isLoading,hotelWorkflow])
  async function decideHotel(approved:boolean) {
    if(!hotelState?.offer||hotelBusy||isLoading)return
    setHotelBusy(true);setHotelError(null)
    try {
      const state=await hotelRequest('decide',{offerId:hotelState.offer.id,version:hotelState.version,approved})
      setHotelState(state)
      await sendMessage(approved?'I confirm this request. Please check the status.':'Please keep my reservation unchanged.')
    } catch(error){setHotelError(error instanceof Error?error.message:'호텔 요청 처리 실패')}
    finally{setHotelBusy(false)}
  }

  // Pick up the number typed on the landing page.
  useEffect(() => {
    const number = sessionStorage.getItem(CALL_NUMBER_STORAGE_KEY)
    if (number) {
      sessionStorage.removeItem(CALL_NUMBER_STORAGE_KEY)
      setDraft(`Please call ${number} for me. `)
    }
  }, [])

  // What the feed shows. Reasoning, tool bookkeeping and the app's own call-ended notes stay hidden.
  const rows = messages.flatMap((message) =>
    message.parts.flatMap((part, index): Row[] => {
      const key = `${message.id}-${index}`
      const mine = message.role === 'user'
      if (part.type === 'text') {
        const text = part.content.trim()
        return text && !(mine && text.startsWith(CALL_ENDED_MARKER)) ? [{ key, mine, text }] : []
      }
      if (part.type !== 'tool-call') return []
      if (part.name === issueKoreanNumberDef.name && isKoreanNumber(part.output)) return [{ key, mine: false, card: part.output }]
      if (part.name === callBusinessDef.name) {
        const placed = part.output as CallPlaced | undefined
        const request = part.input as CallRequest | undefined
        if (placed?.status === 'calling' && placed.call) return [{ key, mine: false, call: placed.call, business: request?.businessName ?? 'the business' }]
      }
      return []
    }),
  )
  // At most one call waits for approval at a time.
  const approval = interrupts.flatMap((interrupt) => (interrupt.kind === 'tool-approval' && interrupt.toolName === callBusinessDef.name ? [interrupt] : []))[0]
  const lastRow = rows.at(-1)
  // Tokie is "typing" until its reply to the latest message starts to show.
  const typing = isLoading && (!lastRow || lastRow.mine || !('text' in lastRow))
  const hasNumber = rows.some((row) => 'card' in row)

  // Once a call is over, quietly ask Tokie to look up what happened and tell the traveler.
  useEffect(() => {
    const next = endedCalls.find((reference) => !reportedCalls.current.has(reference))
    if (!next || isLoading) return
    reportedCalls.current.add(next)
    void sendMessage(`${CALL_ENDED_MARKER} ${next}`)
  }, [endedCalls, isLoading, sendMessage])

  function scrollToEnd() {
    // After the next paint, so content added in this render is included.
    requestAnimationFrame(() => feed.current?.scrollTo({ top: feed.current.scrollHeight }))
  }

  // Keep the newest content in view while a reply streams in.
  useEffect(scrollToEnd, [messages, typing, isLoading, error, approval, hotelState, hotelError])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 1600)
    return () => clearTimeout(timer)
  }, [toast])

  function notify(text: string) {
    setToast({ id: Date.now(), text })
  }

  function fillQuickReply(text: string) {
    setDraft(text)
    input.current?.focus()
  }

  function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || isLoading || approval || hotelBusy || (hotelWorkflow && !hotelState)) return
    void sendMessage(text)
    setDraft('')
  }

  return (
    <div className="lp ch">
      <header className="ch-head">
        <span className="lp-tokie-ava"><img src={tokie} alt="Tokie the bunny" /></span>
        <div className="ch-who">
          <h1 className="ch-name">Tokie</h1>
          <p className="ch-online"><span className="ch-live" aria-hidden="true" />Online</p>
        </div>
        {/* Tokie replies in whatever language the traveler writes in, so this only shows the app language. */}
        <button type="button" className="ch-lang" aria-label="Language: English"><LineIcon name="globe" size={16} />English</button>
      </header>

      {hotelHarness && <HotelRehearsal selectedId={hotelScenario} onScenarioChange={onHotelScenarioChange} busy={isLoading || hotelBusy || Boolean(approval) || rows.some(row => 'call' in row)} messages={messages} onFill={fillQuickReply} />}

      <main ref={feed} className="ch-feed" aria-live="polite">
        <div className="ch-row"><TokieAvatar /><p className="ch-bubble">{GREETING}</p></div>
        {rows.map((row) => {
          if ('call' in row) {
            return (
              <div key={row.key} className="ch-row ch-row--wide">
                <TokieAvatar />
                <CallLive reference={row.call} business={row.business} onDone={(reference) => setEndedCalls((current) => [...current, reference])} onActivity={scrollToEnd} />
              </div>
            )
          }
          return (
            <div key={row.key} className={row.mine ? 'ch-row ch-row--me' : 'card' in row ? 'ch-row ch-row--wide' : 'ch-row'}>
              {!row.mine && <TokieAvatar />}
              {'card' in row ? <NumberCard {...row.card} onNotify={notify} /> : <p className="ch-bubble">{row.text}</p>}
            </div>
          )
        })}
        {approval && (
          <div className="ch-row ch-row--wide">
            <TokieAvatar />
            <CallApproval request={approval.originalArgs as CallRequest} onDecide={(approved) => approval.resolveInterrupt(approved)} />
          </div>
        )}
        {typing && !approval && <div className="ch-row" aria-hidden="true"><TokieAvatar /><span className="ch-typing"><i /><i /><i /></span></div>}
        {hasNumber && !isLoading && <p className="ch-status"><span className="ch-live" aria-hidden="true" />Waiting for calls · I'll answer for you</p>}
        {hotelWorkflow && <HotelWorkflowCard state={hotelState} busy={isLoading || hotelBusy} error={hotelError} onDecide={decideHotel} />}
        {error && !isLoading && <p className="ch-error" role="alert">Tokie couldn’t reply. Please try again.</p>}
      </main>

      {toast && <p key={toast.id} className="ch-toast" role="status">{toast.text}</p>}

      <footer className="ch-foot">
        <div className="ch-quick">
          {quickReplies.map((reply) => <button key={reply} type="button" onClick={() => fillQuickReply(reply)}>{reply}</button>)}
        </div>
        <form className="ch-compose" onSubmit={send}>
          <label className="lp-sr-only" htmlFor="ch-message">Message Tokie</label>
          <input ref={input} id="ch-message" type="text" placeholder="Message Tokie" autoComplete="off" maxLength={1000} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button type="submit" className="ch-send" aria-label="Send" disabled={isLoading || Boolean(approval) || hotelBusy || (hotelWorkflow && !hotelState)}><LineIcon name="arrowUp" /></button>
        </form>
      </footer>
    </div>
  )
}
