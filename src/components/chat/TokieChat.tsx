import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, SubmitEvent } from 'react'
import tokie from '../../assets/landing/tokie.webp'
import {
  CALL_ENDED_MARKER,
  CALL_INTENT_STORAGE_KEY,
  callBusinessDef,
  getCallResultDef,
  issueKoreanNumberDef,
} from '../../lib/chat-tools'
import type { CallIntent, CallLine, CallPlaced, CallRequest, KoreanNumber } from '../../lib/chat-tools'
import { LineIcon } from '../landing/LineIcon'
import { HotelRehearsal } from './HotelRehearsal'
import { HotelWorkflowCard } from './HotelWorkflowCard'
import { hotelInquiryDef, hotelStatusDef } from '../../lib/hotel-workflow-tools'
import {formatStayDate} from '../../lib/call-result'
import type {ReservationResult} from '../../lib/call-result'
import type { Workflow } from '../../lib/hotel-workflow'

const DIGIT_HEIGHT = 34
const CALL_POLL_MS = 1500
// Failed lookups in a row before a call is given up on; a single hiccup must not end a live call.
const CALL_POLL_TRIES = 4
// A poll this late means the tab was asleep, so the call clock can no longer be trusted.
const CALL_CLOCK_SLACK_MS = 5000
// Shown before the traveler has said anything; it is not part of the conversation sent to the model.
const GREETING = "Hi, I'm Tokie! Tell me what you want to book in Korea and I'll help, in your language."
const quickReplies = ['What will you say on the call?', 'Can you call them for me?']
// How a call that nobody picked up is titled, by the outcome the call API reports.
const UNANSWERED: Record<string, string> = { 'no-answer': 'No answer', busy: 'Line was busy', rejected: 'Call declined', canceled: 'Call canceled' }

function isKoreanNumber(value: unknown): value is KoreanNumber {
  return typeof value === 'object' && value !== null && typeof (value as KoreanNumber).number === 'string' && typeof (value as KoreanNumber).activeUntil === 'string'
}

/** Seconds as m:ss. */
function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** The call the visitor set up on the landing page, if they came from there. */
function readCallIntent(): CallIntent | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(CALL_INTENT_STORAGE_KEY) ?? 'null') as CallIntent | null
    return typeof stored?.number === 'string' ? stored : null
  } catch {
    return null
  }
}

/** The traveler's first message, saying what they already told the landing page. */
function openingMessage({ number, businessName, placeType }: CallIntent) {
  if (businessName) return `Please call ${businessName} at ${number} for me.`
  if (placeType) return `Please call this ${placeType} for me: ${number}`
  return `Please call ${number} for me.`
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

/** What has been said on a call, line by line. */
function CallLines({ lines, quiet, recipient="Them" }: { lines: CallLine[]; quiet?: boolean; recipient?:string }) {
  return (
    // Quiet when the whole transcript is revealed at once, so a screen reader is not made to read all of it.
    <ol className="ch-call-lines" lang="ko" aria-live={quiet ? 'off' : undefined}>
      {lines.map(({ id, role, text, final }) => (
        <li key={id} className={[role === 'agent' && 'is-tokie', !final && 'is-partial'].filter(Boolean).join(' ') || undefined}>
          <span lang="en">{role === 'agent' ? 'Tokie' : recipient}</span>
          {text}
        </li>
      ))}
    </ol>
  )
}

type CallLiveProps = {
  reference: string
  business: string
  phoneNumber?: string
  /** Called once, when the call is over. `answered` says whether anybody picked up. */
  onDone: (reference: string, answered: boolean) => void
  /** Called whenever something new was said, so the feed can keep it in view. */
  onActivity: () => void
}

/**
 * Follows a placed call and reports once when it is over. The card rings until somebody speaks,
 * then shows what is being said with a running clock, and folds into a one-line summary at the end.
 */
function CallLive({ reference, business, phoneNumber, onDone, onActivity }: CallLiveProps) {
  const [state, setState] = useState<CallState>('calling')
  const [outcome, setOutcome] = useState('')
  const [lines, setLines] = useState<CallLine[]>([])
  const [lookupError,setLookupError]=useState(false)
  const [resultPending,setResultPending]=useState(false)
  const [reservation,setReservation]=useState<ReservationResult|null>(null)
  const [retry,setRetry]=useState(0)
  const [recipient,setRecipient]=useState('Them')
  // Seconds since the first words were heard, as far as this screen saw them: the call API gives no connect time.
  // Null until then, and for good once the screen has missed part of the call.
  const [seconds, setSeconds] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const connectedAt = useRef<number | null>(null)
  // The latest callbacks, so the polling loop below never has to restart for them.
  const callbacks = useRef({ onDone, onActivity })
  callbacks.current = { onDone, onActivity }

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let seen = ''
    let due = 0
    let failures = 0
    let answered = false
    let clockTrusted = true
    const elapsed = () => (clockTrusted && connectedAt.current !== null ? Math.floor((Date.now() - connectedAt.current) / 1000) : null)
    const clock = setInterval(() => setSeconds(elapsed()), 1000)
    function schedule() {
      due = Date.now() + CALL_POLL_MS
      timer = setTimeout(poll, CALL_POLL_MS)
    }
    async function poll() {
      if (Date.now() - due > CALL_CLOCK_SLACK_MS) clockTrusted = false
      let next: CallState = 'calling'
      try {
        const response = await fetch(`/api/calls/${encodeURIComponent(reference)}`,{signal:AbortSignal.timeout(35000)})
        if (response.ok) {
          const progress = (await response.json()) as { state: CallState; lines: CallLine[]; outcome:string; conversationMode?:string; reservation?:ReservationResult; resultPending?:boolean }
          if(stopped)return
          setLookupError(false)
          setResultPending(Boolean(progress.resultPending))
          setReservation(progress.reservation??null)
          setState(progress.state)
          setOutcome(progress.outcome)
          setRecipient(progress.conversationMode==='hotel_roleplay'?'Customer':'Hotel staff')
          if(progress.resultPending) {
            failures++
            if(failures>=4){setLookupError(true);clearInterval(clock);return}
          } else failures=0
          next = progress.resultPending?'calling':progress.state
          answered ||= progress.lines.length>0 || (progress.state==='done'&&progress.outcome==='completed')
          if(progress.state==='done'&&connectedAt.current===null)clockTrusted=false
          const signature = JSON.stringify(progress.lines)
          if (!stopped && signature !== seen) {
            seen = signature
            if (progress.lines.length) connectedAt.current ??= Date.now()
            setLines(progress.lines)
            setSeconds(elapsed())
            callbacks.current.onActivity()
          }
        } else {
          throw Error('Call status unavailable')
        }
      } catch {
        if(stopped)return
        setLookupError(true)
        failures++
        if(failures>=4){clearInterval(clock);return}
      }
      if (stopped) return
      if (next !== 'done') {
        schedule()
        return
      }
      clearInterval(clock)
      setSeconds(elapsed())
      setState('done')
      callbacks.current.onDone(reference, answered)
    }
    schedule()
    return () => {
      stopped = true
      clearTimeout(timer)
      clearInterval(clock)
    }
  }, [reference,retry])

  const callFeedback=<>
    {lookupError&&<p role="status">Couldn’t retrieve the call status. <button type="button" onClick={()=>{setLookupError(false);setRetry(x=>x+1)}}>Retry</button></p>}
    {resultPending&&!lookupError&&<p role="status">Checking the call result…</p>}
    {reservation&&<div className="ch-card-meta" aria-label="Reservation result">
      <p>{{inquiry:'Inquiry only',requested:'Request received',confirmed:'Reservation confirmed',changed:'Reservation updated',cancelled:'Reservation cancelled',declined:'Request declined',unknown:'Result unconfirmed'}[reservation.status]}</p>
      <p>{formatStayDate(reservation.checkIn)} → {formatStayDate(reservation.checkOut)}{reservation.durationText?` · ${reservation.durationText}`:''}</p>
      {reservation.roomType&&<p>{reservation.roomType}</p>}
      {reservation.guestName&&<p>{reservation.guestName}</p>}
    </div>}
  </>
  if (state === 'done') {
    const answered = outcome === 'completed' || lines.length > 0
    const title = answered ? `Call ended${seconds === null ? '' : ` · ${formatDuration(seconds)}`}` : UNANSWERED[outcome] ?? 'Call didn’t connect'
    return (
      <div className="ch-call ch-call--end">
        <div className="ch-call-row">
          <span className="ch-phone ch-phone--off" aria-hidden="true"><LineIcon name="phone" /></span>
          <div className="ch-call-who">
            <p className="ch-call-title">{title}</p>
            <p className="ch-card-meta">{answered ? `${business} · Tokie called for you` : business}</p>
          </div>
          {lines.length > 0 && <button type="button" className="ch-call-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'View call'}</button>}
        </div>
        {callFeedback}
         {open && <CallLines lines={lines} quiet recipient={recipient} />}
      </div>
    )
  }

  if (!lines.length) {
    return (
      <div className="ch-call">
        <div className="ch-call-row">
          <span className="ch-phone" aria-hidden="true"><LineIcon name="phone" /></span>
          <div className="ch-call-who">
            <p className="ch-card-meta">Outgoing call</p>
            <p className="ch-card-title">{business}</p>
            {phoneNumber && <p className="ch-card-meta">{phoneNumber}</p>}
          </div>
        </div>
        {callFeedback}
         <p className="ch-call-label"><span className="ch-live" aria-hidden="true" />Tokie is calling</p>
      </div>
    )
  }

  return (
    <div className="ch-call">
      <div className="ch-call-head">
        <span className="ch-live" aria-hidden="true" />
        <p className="ch-call-on">On call · {business}</p>
        {/* Navy while Tokie speaks, teal while the business does. The clock ticks every second, so it stays out of the live region. */}
        <span className={lines.at(-1)?.role === 'agent' ? 'ch-wave is-tokie' : 'ch-wave'} aria-hidden="true">{Array.from({ length: 10 }, (_, bar) => <i key={bar} />)}</span>
        {seconds !== null && <span className="ch-call-time" aria-hidden="true">{formatDuration(seconds)}</span>}
      </div>
      {callFeedback}
      <CallLines lines={lines} recipient={recipient} />
    </div>
  )
}

/** One line of the feed: a text bubble, number card, or call with its live transcript. */
type Row = { key: string; mine: boolean } & ({ text: string } | { card: KoreanNumber } | { call: string; business: string; phoneNumber?: string })

export function TokieChat({ hotelHarness = false, hotelScenario = 'booking', onHotelScenarioChange, hotelWorkflow = hotelHarness }: { hotelWorkflow?: boolean; hotelHarness?: boolean; hotelScenario?: string; onHotelScenarioChange?: (id:string)=>void }) {
  // One conversation per visit: the id only has to stay stable while this screen is mounted.
  const [threadId,setThreadId] = useState(() => crypto.randomUUID())
  const restored=useRef(false)
  const pendingReport=useRef<string|null>(null)
  const [reportError,setReportError]=useState(false)
  const { messages, setMessages, sendMessage, isLoading, error, interrupts } = useChat({
    connection: fetchServerSentEvents(hotelWorkflow ? '/api/hotel-chat' : '/api/chat'),
    threadId,
    onFinish:(message)=>{
      if(pendingReport.current && message.parts.some(p=>p.type==='text'&&p.content.trim())){
        reportedCalls.current.add(pendingReport.current)
        pendingReport.current=null
        setReportError(false)
      }
    },
    onError:()=>{if(pendingReport.current){pendingReport.current=null;setReportError(true)}},
    tools: hotelWorkflow ? [hotelInquiryDef,hotelStatusDef] : [issueKoreanNumberDef, callBusinessDef, getCallResultDef],
  })
  const [draft, setDraft] = useState('')
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  // Calls whose result still has to be handed to Tokie, and those already handed over.
  const [endedCalls, setEndedCalls] = useState<string[]>([])
  const reportedCalls = useRef(new Set<string>())
  // The business of the last call somebody answered; once there is one, the shortcuts turn to following up with it.
  const [calledBusiness, setCalledBusiness] = useState<string>()
  const feed = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(()=>{
    if(hotelWorkflow){restored.current=true;return}
    try {
      const raw=sessionStorage.getItem('tokie.chat.v2')
      if(raw){const saved=JSON.parse(raw);if(Array.isArray(saved.messages)&&typeof saved.threadId==='string'){
        setThreadId(saved.threadId);setMessages(saved.messages)
        reportedCalls.current=new Set(Array.isArray(saved.reported)?saved.reported:[])
      }}
    }catch{}
    restored.current=true
  },[])
  useEffect(()=>{
    if(!restored.current||hotelWorkflow||!messages.length)return
    try{sessionStorage.setItem('tokie.chat.v2',JSON.stringify({threadId,messages,reported:[...reportedCalls.current]}))}catch{}
  },[messages,threadId,isLoading,hotelWorkflow])


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

  // Coming from the landing page's call box: open the conversation with what the visitor entered there.
  useEffect(() => {
    const intent = readCallIntent()
    if (!intent) return
    // Sent on the next tick, so a mount that React tears down straight away (strict mode) never sends and cancels.
    const timer = setTimeout(() => {
      sessionStorage.removeItem(CALL_INTENT_STORAGE_KEY)
      void sendMessage(openingMessage(intent))
    }, 0)
    return () => clearTimeout(timer)
  }, [sendMessage])

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
        if (placed?.status === 'calling' && placed.call) return [{ key, mine: false, call: placed.call, business: request?.businessName ?? 'the business', phoneNumber: request?.phoneNumber }]
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
    if (!next || isLoading || pendingReport.current || reportError) return
    pendingReport.current=next
    void sendMessage(`${CALL_ENDED_MARKER} ${next}`).then(()=>{if(pendingReport.current===next){pendingReport.current=null;setReportError(true)}}).catch(()=>{pendingReport.current=null;setReportError(true)})
  }, [endedCalls, isLoading, sendMessage,reportError])

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

  const shortcuts = calledBusiness
    ? [
        // Starts the message, for the traveler to finish with their question.
        { label: 'Ask them something', text: `Please ask ${calledBusiness}: ` },
        { label: 'What exactly did they say?', text: 'What exactly did they say?' },
      ]
    : quickReplies.map((reply) => ({ label: reply, text: reply }))

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
            return <CallLive key={row.key} reference={row.call} business={row.business} phoneNumber={row.phoneNumber} onDone={(reference, answered) => { setEndedCalls((current) => [...current, reference]); if (answered) setCalledBusiness(row.business) }} onActivity={scrollToEnd} />
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
        {reportError && !isLoading && <p role="status">Couldn’t deliver the call summary. <button type="button" onClick={()=>setReportError(false)}>Retry</button></p>}
        {error && !isLoading && <p className="ch-error" role="alert">Tokie couldn’t reply. Please try again.</p>}
      </main>

      {toast && <p key={toast.id} className="ch-toast" role="status">{toast.text}</p>}

      <footer className="ch-foot">
        <div className="ch-quick">
          {shortcuts.map(({ label, text }) => <button key={label} type="button" onClick={() => fillQuickReply(text)}>{label}</button>)}
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
