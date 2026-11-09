import { useState } from 'react'
import { LineIcon } from '../landing/LineIcon'
import { OnboardingShell } from './OnboardingShell'

// Placeholder schedule from the design. Times are minutes from midnight; weekday 0 is Sunday.
const HOURS: Record<number, [number, number]> = { 0: [600, 1140], 1: [600, 1140], 2: [600, 1140], 3: [600, 1140], 4: [600, 1140], 5: [600, 1140], 6: [600, 900] }
const BOOKED = new Set([780, 1020]) // fictional existing bookings: 1 PM and 5 PM
const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LONG_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const LENGTHS = [[30, '30 min'], [60, '1 hr'], [90, '1.5 hr']] as const
// November 2026 starts on a Sunday, so day n falls on weekday (n - 1) % 7.
const DAYS_IN_MONTH = 30

function fmt(m: number) {
  const h = Math.floor(m / 60)
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export function ScheduleStep() {
  const [off, setOff] = useState<Record<number, boolean>>({ 0: true })
  const [closed, setClosed] = useState<Record<number, boolean>>({ 17: true })
  const [len, setLen] = useState(60)
  const [cap, setCap] = useState(1)
  const [sel, setSel] = useState(20)

  const weekday = (n: number) => (n - 1) % 7
  const isClosed = (n: number) => !!off[weekday(n)] || !!closed[n]
  const perDay = (w: number) => Math.floor((HOURS[w][1] - HOURS[w][0]) / len) * cap
  let slots = 0
  for (let n = 1; n <= DAYS_IN_MONTH; n++) if (!isClosed(n)) slots += perDay(weekday(n))

  const sw = weekday(sel)
  const selClosed = isClosed(sel)
  const times: number[] = []
  if (!selClosed) for (let t = HOURS[sw][0]; t + len <= HOURS[sw][1]; t += len) times.push(t)

  return (
    <OnboardingShell
      step={4}
      title="When can people book?"
      sub="Your agent only offers times that are open here."
      note={<><b>{slots} open slots</b> in November</>}
      back="/biz/onboarding/builder"
      next="/biz/onboarding/fields"
      nextLabel="Next"
    >
      <section className="ob-card" aria-labelledby="sch-week">
        <div className="ob-card-head">
          <h2 id="sch-week" className="ob-card-title">Weekly hours</h2>
          <button type="button" className="ob-link" onClick={() => setOff({ ...off, 1: false, 2: false, 3: false, 4: false, 5: false })}>Copy to all weekdays</button>
        </div>
        {WEEK_ORDER.map((w) => (
          <div key={w} className="ob-wrow">
            <span className="ob-wrow-day">{NAMES[w]}</span>
            <span className="ob-wrow-time">
              {off[w] ? <span className="ob-muted-text">Closed</span> : <><span className="ob-tchip">{fmt(HOURS[w][0])}</span><span className="ob-caption">to</span><span className="ob-tchip">{fmt(HOURS[w][1])}</span></>}
            </span>
            <button type="button" role="switch" className="ob-switch" aria-checked={!off[w]} aria-label={`Take bookings on ${LONG_NAMES[w]}`} onClick={() => setOff({ ...off, [w]: !off[w] })} />
          </div>
        ))}
      </section>

      <section className="ob-card ob-stack">
        <p id="sch-len" className="ob-label">Appointment length</p>
        <div className="ob-seg" role="radiogroup" aria-labelledby="sch-len">
          {LENGTHS.map(([v, label]) => <button key={v} type="button" role="radio" aria-checked={v === len} onClick={() => setLen(v)}>{label}</button>)}
        </div>
        <div className="ob-inset ob-row ob-row--between">
          <div>
            <p className="ob-label">Bookings per time slot</p>
            <p className="ob-caption">Set to 2 if you have two front-desk agents</p>
          </div>
          <div className="ob-row">
            <button type="button" className="ob-step-btn" aria-label="Fewer bookings per slot" onClick={() => setCap(Math.max(1, cap - 1))}><LineIcon name="minus" size={18} /></button>
            <span className="ob-cap" aria-live="polite">{cap}</span>
            <button type="button" className="ob-step-btn" aria-label="More bookings per slot" onClick={() => setCap(Math.min(4, cap + 1))}><LineIcon name="plus" size={18} /></button>
          </div>
        </div>
      </section>

      <section className="ob-card ob-stack" aria-labelledby="sch-cal">
        <div>
          <h2 id="sch-cal" className="ob-card-title">November 2026</h2>
          <p className="ob-caption">Tap a date to see or close its slots</p>
        </div>
        <div className="ob-cal">
          {NAMES.map((d) => <span key={d} className="ob-cal-wd" aria-hidden="true">{d}</span>)}
          {Array.from({ length: DAYS_IN_MONTH }, (_, i) => {
            const n = i + 1
            return (
              <button key={n} type="button" className="ob-day" data-closed={isClosed(n) ? '' : undefined} aria-pressed={n === sel} aria-label={`${NAMES[weekday(n)]}, Nov ${n}, ${isClosed(n) ? 'closed' : 'open'}`} onClick={() => setSel(n)}>
                {n}<i />
              </button>
            )
          })}
        </div>
        <p className="ob-row ob-caption"><span className="ob-legend" />Open <span className="ob-legend" data-closed="" />Closed</p>

        <div className="ob-inset ob-stack ob-stack--tight">
          <div className="ob-row ob-row--between">
            <p className="ob-label">{NAMES[sw]}, Nov {sel}</p>
            <button type="button" className={off[sw] || selClosed ? 'ob-btn-sec ob-btn-sm' : 'ob-btn-danger ob-btn-sm'} onClick={() => (off[sw] ? setOff({ ...off, [sw]: false }) : setClosed({ ...closed, [sel]: !closed[sel] }))}>
              {off[sw] ? `Open ${LONG_NAMES[sw]}` : selClosed ? 'Reopen this day' : 'Mark as closed'}
            </button>
          </div>
          {selClosed ? (
            <p className="ob-muted-text">No bookings this day. Your agent will suggest the nearest open day.</p>
          ) : (
            <>
              <div className="ob-chips">
                {times.map((t) => <span key={t} className={BOOKED.has(t) ? 'ob-chip ob-chip--line ob-chip--booked' : 'ob-chip ob-chip--teal'}>{fmt(t)}</span>)}
              </div>
              <p className="ob-caption">Crossed-out times are already booked</p>
            </>
          )}
        </div>
      </section>
    </OnboardingShell>
  )
}
