import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { type Booking, formatDuration, langName, rescheduleSlots } from '../../lib/biz-mock'
import { LineIcon } from '../landing/LineIcon'
import { Avatar, LangChip, StatusChip } from './BookingCard'

const barHeights = [30, 55, 40, 70, 45, 85, 60, 35, 50, 75, 90, 65, 40, 55, 80, 45, 30, 60, 85, 70, 50, 35, 65, 90, 55, 40, 70, 50, 30, 60, 45, 35]

/** Fake playback: advances a position counter, no audio file behind it. */
function Recording({ duration }: { duration: number }) {
  const [pos, setPos] = useState(Math.round(duration * 0.26))
  const [started, setStarted] = useState(false)
  const playing = started && pos < duration

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setPos((p) => Math.min(p + 1, duration)), 250)
    return () => clearInterval(t)
  }, [playing, duration])

  function toggle() {
    if (!playing && pos >= duration) setPos(0)
    setStarted(!playing)
  }

  const frac = pos / duration
  return (
    <section className="dash-card dash-stack" aria-labelledby="dash-rec">
      <h2 id="dash-rec" className="dash-heading">Call recording</h2>
      <div className="dash-row dash-rec">
        <button className="dash-play" type="button" aria-label={playing ? 'Pause recording' : 'Play recording'} aria-pressed={playing} onClick={toggle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {playing ? <><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></> : <path d="M7 4.5v15l13-7.5z" />}
          </svg>
        </button>
        <div className="dash-bars" aria-hidden="true">
          {barHeights.map((h, i) => <span key={i} style={{ height: `${h}%` }} data-on={(i + 0.5) / barHeights.length <= frac || undefined} />)}
        </div>
      </div>
      <p className="dash-caption dash-row dash-row--between dash-num"><span>{formatDuration(pos)}</span><span>{formatDuration(duration)}</span></p>
    </section>
  )
}

export function BookingDetail({ b }: { b: Booking }) {
  const [confirmed, setConfirmed] = useState(b.status === 'confirmed')
  const [when, setWhen] = useState(b.when)
  const [sheet, setSheet] = useState(false)
  const [view, setView] = useState<'tr' | 'orig'>('tr')
  const status = confirmed ? 'confirmed' : b.status

  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  return (
    <div className="dash-body">
      <header className="dash-top">
        <Link to="/biz/dashboard" className="dash-icon-btn" aria-label="All bookings"><LineIcon name="chevron-left" size={22} /></Link>
        <p className="dash-label dash-top-text">Booking</p>
        <StatusChip status={status} />
      </header>

      <main className="dash-main dash-detail">
        <div className="dash-detail-col">
          <section className="dash-card dash-summary" aria-label="Booking summary">
            <div className="dash-row dash-summary-head">
              <Avatar name={b.name} lang={b.lang} size="lg" />
              <div className="dash-top-text">
                <h1 className="dash-title dash-title--sm">{b.name}</h1>
                <p className="dash-caption">{b.calledAgo} · {formatDuration(b.duration)}</p>
              </div>
              <LangChip lang={b.lang} />
            </div>
            <dl className="dash-kv">
              <div><dt>When</dt><dd>{when ?? 'No dates requested'}</dd></div>
              <div><dt>Room</dt><dd>{b.treatmentLong}</dd></div>
              <div><dt>Guests</dt><dd>{b.previous}</dd></div>
              <div><dt>Special request</dt><dd>{b.arrival}</dd></div>
              <div><dt>Channel</dt><dd>{b.channel}</dd></div>
              <div><dt>Booking ID</dt><dd className="lp-mono">{b.id}</dd></div>
            </dl>
          </section>

          {b.staffReply && (
            <section className="dash-card dash-reply dash-stack">
              <p className="dash-label dash-row"><LineIcon name="alert" size={18} />Needs a staff reply</p>
              <p className="dash-text">Asked: "{b.staffReply.asked}" {b.staffReply.agent}</p>
              <button className="dash-reply-btn" type="button">Reply on {b.channel}</button>
            </section>
          )}

          {b.status !== 'handoff' && (
            <footer className="dash-bar">
              {confirmed ? (
                <>
                  <div className="dash-row dash-done" role="status">
                    <span className="dash-done-ic"><LineIcon name="check" size={22} /></span>
                    <p className="dash-label">Confirmed. {b.firstName} will get a message in {langName[b.lang]}.</p>
                  </div>
                  <Link to="/biz/dashboard" className="lp-btn dash-btn dash-btn--sec">Back to bookings</Link>
                </>
              ) : (
                <>
                  <p className="dash-caption dash-center">{b.firstName} will get a confirmation in {langName[b.lang]}</p>
                  <div className="dash-row">
                    <button className="lp-btn dash-btn dash-btn--sec" type="button" onClick={() => setSheet(true)}>Reschedule</button>
                    <button className="lp-btn lp-btn-teal dash-btn dash-btn--grow" type="button" onClick={() => setConfirmed(true)}>Confirm</button>
                  </div>
                </>
              )}
            </footer>
          )}
        </div>

        <div className="dash-detail-col">
          <Recording duration={b.duration} />

          <section className="dash-card dash-stack" aria-labelledby="dash-tr">
            <div className="dash-row dash-row--between">
              <h2 id="dash-tr" className="dash-heading">Transcript</h2>
              <div className="dash-seg" role="radiogroup" aria-label="Transcript language">
                <button type="button" role="radio" aria-checked={view === 'tr'} onClick={() => setView('tr')}>Translated</button>
                <button type="button" role="radio" aria-checked={view === 'orig'} onClick={() => setView('orig')}>Original</button>
              </div>
            </div>
            <div className="dash-stack" lang={view === 'orig' ? b.lang : undefined}>
              {b.transcript.map((l) => (
                <div key={l.t} className={l.caller ? 'dash-line dash-line--me' : 'dash-line'}>
                  <span className="dash-caption dash-who" lang="en">{l.caller ? b.name : 'Agent'} · {l.t}</span>
                  <p className="dash-msg">{view === 'tr' ? l.en : l.orig}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {sheet && (
        <>
          <div className="dash-dim" onClick={() => setSheet(false)} />
          <div className="dash-sheet" role="dialog" aria-modal="true" aria-labelledby="dash-sheet-title">
            <div className="dash-grab" aria-hidden="true" />
            <p id="dash-sheet-title" className="dash-title dash-title--sm">Suggest a new time</p>
            <p className="dash-text dash-sub">{b.firstName} will be asked in {langName[b.lang]} to pick one.</p>
            {rescheduleSlots.map((s) => (
              <button key={s} className="dash-slot" type="button" onClick={() => { setWhen(s); setSheet(false) }}>{s}</button>
            ))}
            <button className="lp-btn dash-btn dash-btn--ghost" type="button" onClick={() => setSheet(false)}>Keep current time</button>
          </div>
        </>
      )}
    </div>
  )
}
