import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import tokie from '../../assets/landing/tokie.webp'
import type { CallResult, CallResultLine } from '../../lib/call-result'
import { formatClock } from '../../lib/call-result'
import { LineIcon } from '../landing/LineIcon'

const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
// The call does not say how long a visit takes, so the calendar entry gets an hour.
const VISIT_MINUTES = 60

const HERO: Record<CallResult['status'], string> = { confirmed: "You're booked", pending: 'Almost booked', declined: 'Not booked', none: 'Call finished' }

/** Whole days from today to the booking, counted on the Korean calendar; null without a date or once it has passed. */
function daysUntil(startsAt: string) {
  if (!startsAt) return null
  const day = (time: number) => Math.floor((time + KOREA_OFFSET_MS) / DAY_MS)
  const days = day(Date.parse(`${startsAt}:00+09:00`)) - day(Date.now())
  return days >= 0 ? days : null
}

function languageName(tag: string) {
  try {
    return new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

/** The booking as an iCalendar file. */
function calendarFile({ id, startsAt, what, business, addressKo }: CallResult) {
  const stamp = (time: number) => new Date(time).toISOString().replace(/[-:]|\.\d{3}/g, '')
  const text = (value: string) => value.replace(/[\;,]/g, (char) => `\\${char}`).replace(/\n/g, '\\n')
  const start = Date.parse(`${startsAt}:00+09:00`)
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tokie//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${id}@tokie`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(start + VISIT_MINUTES * 60 * 1000)}`,
    `SUMMARY:${text(what ? `${what} · ${business}` : business)}`,
    `LOCATION:${text(addressKo || business)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

/** The call's recording with a play button and a progress bar. */
function Recording({ src, seek }: { src: string; seek: { at: number } | null }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [length, setLength] = useState(0)

  // Jumping to a line moves the recording there without starting it.
  useEffect(() => {
    if (seek && audio.current) audio.current.currentTime = seek.at
  }, [seek])

  function toggle() {
    if (!audio.current) return
    if (audio.current.paused) void audio.current.play()
    else audio.current.pause()
  }

  return (
    <div className="bk-player">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setLength(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      />
      <button type="button" className="bk-play" aria-label={playing ? 'Pause recording' : 'Play recording'} onClick={toggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {playing ? <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></> : <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />}
        </svg>
      </button>
      <div className="bk-bar" role="progressbar" aria-label="Playback" aria-valuemin={0} aria-valuemax={Math.round(length)} aria-valuenow={Math.round(position)}>
        <span style={{ width: length ? `${Math.min(100, (position / length) * 100)}%` : 0 }} />
      </div>
      <span className="bk-mono bk-time">{formatClock(position)}{length > 0 && ` / ${formatClock(length)}`}</span>
    </div>
  )
}

export function BookingPage({ result }: { result: CallResult | null }) {
  const [tab, setTab] = useState<'booking' | 'call'>('booking')
  const [showAddress, setShowAddress] = useState(false)
  // Transcript as spoken (Korean, with the translation underneath) or in the traveler's language only.
  const [asSpoken, setAsSpoken] = useState(true)
  // The line a "from your call" link points at, and where to move the recording for it.
  const [highlight, setHighlight] = useState('')
  const [seek, setSeek] = useState<{ at: number } | null>(null)

  useEffect(() => {
    if (tab === 'call' && highlight) document.getElementById(`bk-line-${highlight}`)?.scrollIntoView({ block: 'center' })
  }, [tab, highlight])

  if (!result) {
    return (
      <div className="lp bk">
        <main className="bk-main bk-missing">
          <h1 className="bk-title">This link doesn't lead anywhere</h1>
          <p className="bk-sub">Check the address, or ask Tokie to look the booking up again.</p>
          <Link to="/chat" className="lp-btn lp-btn-teal bk-btn">Chat with Tokie</Link>
        </main>
      </div>
    )
  }

  const { id, business, status, headline, when, startsAt, what, who, addressKo, bring, answers, sources, lines, language, callEndedAt, hasRecording } = result
  const booked = status === 'confirmed' || status === 'pending'
  const days = daysUntil(startsAt)
  const translated = lines.some(({ translation }) => translation)
  const lineById = new Map(lines.map((line) => [line.id, line]))
  const details: { label: string; value: string; source?: CallResultLine }[] = [
    { label: 'When', value: when, source: lineById.get(sources.when) },
    { label: 'What', value: what, source: lineById.get(sources.what) },
    { label: 'Who', value: who, source: lineById.get(sources.who) },
  ].filter(({ value }) => value)

  function jumpTo(line: CallResultLine) {
    setTab('call')
    setHighlight(line.id)
    if (line.at !== null) setSeek({ at: line.at })
  }

  function addToCalendar() {
    const url = URL.createObjectURL(new Blob([calendarFile(result!)], { type: 'text/calendar' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: `${id}.ics` })
    link.click()
    URL.revokeObjectURL(url)
  }

  const fromCall = (line: CallResultLine | undefined, lead = 'from your call') =>
    line && <button type="button" className="bk-from" onClick={() => jumpTo(line)}>{lead}{line.at !== null && ` · ${formatClock(line.at)}`}</button>

  return (
    <div className="lp bk">
      <header className="bk-head">
        <Link to="/chat" className="bk-icon-btn" aria-label="Back to chat"><LineIcon name="chevronLeft" size={22} /></Link>
        <span className="bk-brand"><span className="lp-tokie-ava" aria-hidden="true"><img src={tokie} alt="" /></span>Tokie</span>
        <span className="bk-mono bk-id">{id}</span>
      </header>

      <main className="bk-main">
        <section className="bk-hero">
          {status === 'confirmed' && (
            <svg className="bk-check" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="28" transform="rotate(-90 32 32)" />
              <path d="M21 33.5l7.5 7.5L44 25.5" pathLength="24" />
            </svg>
          )}
          <h1 className="bk-title bk-rise">{HERO[status]}</h1>
          <p className="bk-sub bk-rise">{headline}</p>
          {booked && days !== null && (
            <span className="bk-chip bk-rise"><LineIcon name="timer" size={16} />{days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}</span>
          )}
        </section>

        <div className="bk-seg" role="tablist" aria-label="Booking and call">
          <button type="button" role="tab" id="bk-tab-booking" aria-controls="bk-panel-booking" aria-selected={tab === 'booking'} onClick={() => setTab('booking')}>Booking</button>
          <button type="button" role="tab" id="bk-tab-call" aria-controls="bk-panel-call" aria-selected={tab === 'call'} onClick={() => { setTab('call'); setHighlight('') }}>Your call</button>
        </div>

        {tab === 'booking' ? (
          <div id="bk-panel-booking" role="tabpanel" aria-labelledby="bk-tab-booking" className="bk-panel">
            <section className="bk-card bk-details" aria-label="Booking details">
              <dl>
                {details.map(({ label, value, source }) => (
                  <div key={label} className="bk-kv"><dt>{label}</dt><dd>{value}{source && <br />}{fromCall(source)}</dd></div>
                ))}
                <div className="bk-kv"><dt>{booked ? 'Booking ID' : 'Call ID'}</dt><dd className="bk-mono">{id}</dd></div>
              </dl>
            </section>

            <section className="bk-card bk-place" aria-label="Location">
              <p className="bk-subh">{business}</p>
              {addressKo && (
                <>
                  <button type="button" className="bk-btn bk-btn--soft" aria-expanded={showAddress} onClick={() => setShowAddress(!showAddress)}>{showAddress ? 'Hide Korean address' : 'Show address in Korean'}</button>
                  {showAddress && (
                    <div className="bk-inset">
                      <p className="bk-caption">Show this to your taxi driver</p>
                      <p className="bk-address" lang="ko">{addressKo}</p>
                    </div>
                  )}
                </>
              )}
            </section>

            {bring.length > 0 && (
              <section className="bk-card bk-list">
                <p className="bk-label">What to bring</p>
                <ul>{bring.map((item) => <li key={item}><LineIcon name="check" size={18} />{item}</li>)}</ul>
              </section>
            )}

            {answers.map(({ question, answer, line }) => (
              <section key={question} className="bk-card bk-answer">
                <p className="bk-label">Answer from {business}</p>
                <p className="bk-caption">{question}</p>
                <p className="bk-body">{answer}</p>
                {fromCall(lineById.get(line), 'you asked on your call')}
              </section>
            ))}

            <nav className="bk-links" aria-label="Change this booking">
              <Link to="/chat">Call again</Link>
            </nav>
          </div>
        ) : (
          <div id="bk-panel-call" role="tabpanel" aria-labelledby="bk-tab-call" className="bk-panel">
            <section className="bk-card bk-recording" aria-label="Call recording">
              <div className="bk-recording-head">
                <p className="bk-label">Your call with {business}</p>
                <span className="bk-caption">{new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(callEndedAt))}</span>
              </div>
              {hasRecording && <Recording src={`/api/b/${id}/recording`} seek={seek} />}
              {translated && (
                <div className="bk-seg bk-seg--small" role="radiogroup" aria-label="Transcript language">
                  <button type="button" role="radio" aria-checked={asSpoken} onClick={() => setAsSpoken(true)}>As spoken (<span lang="ko">한국어</span>)</button>
                  <button type="button" role="radio" aria-checked={!asSpoken} onClick={() => setAsSpoken(false)}>{languageName(language)}</button>
                </div>
              )}
            </section>

            <section className="bk-lines" aria-label="Transcript">
              {lines.map(({ id: lineId, role, text, translation, at }) => {
                const original = asSpoken || !translation
                return (
                  <div key={lineId} id={`bk-line-${lineId}`} className={role === 'agent' ? 'bk-line bk-line--tokie' : 'bk-line'}>
                    <span className="bk-caption">{role === 'agent' ? 'Tokie' : business}{at !== null && <> · <span className="bk-mono">{formatClock(at)}</span></>}</span>
                    <div className={lineId === highlight ? 'bk-bubble is-highlighted' : 'bk-bubble'}>
                      <p lang={original ? 'ko' : language}>{original ? text : translation}</p>
                      {original && translation && <p className="bk-translation" lang={language}>{translation}</p>}
                    </div>
                  </div>
                )
              })}
            </section>
          </div>
        )}
      </main>

      <footer className="bk-foot">
        <a className="bk-btn bk-btn--soft" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressKo ? `${business} ${addressKo}` : business)}`} target="_blank" rel="noopener noreferrer"><LineIcon name="navigate" size={18} />Get directions</a>
        {booked && startsAt && <button type="button" className="lp-btn lp-btn-teal bk-btn bk-btn--shine" onClick={addToCalendar}><LineIcon name="calendar" size={18} />Add to calendar</button>}
      </footer>
    </div>
  )
}
