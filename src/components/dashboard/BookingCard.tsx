import { Link } from '@tanstack/react-router'
import { type Booking, type LangCode, langLabel, statusLabel } from '../../lib/biz-mock'

export function Avatar({ name, lang, size }: { name: string; lang: LangCode; size?: 'lg' | 'sm' }) {
  return <span className={`dash-av dash-av--${lang}${size ? ` dash-av--${size}` : ''}`} aria-hidden="true">{name[0]}</span>
}

export function LangChip({ lang }: { lang: LangCode }) {
  return <span className={`dash-lang dash-lang--${lang}`} lang={lang}>{langLabel[lang]}</span>
}

export function StatusChip({ status }: { status: Booking['status'] }) {
  return <span className={`lp-status dash-status--${status}`}>{statusLabel[status]}</span>
}

/** One booking in the list; the newest unreviewed call gets the highlighted "New" layout. */
export function BookingCard({ b }: { b: Booking }) {
  const when = b.when ?? 'No dates requested'

  if (b.isNew) {
    return (
      <Link to="/biz/dashboard/$bookingId" params={{ bookingId: b.id }} className="dash-bk dash-bk--new" aria-label={`New booking from ${b.name}, review`}>
        <Avatar name={b.name} lang={b.lang} />
        <div className="dash-bk-body">
          <div className="dash-row">
            <span className="lp-badge lp-badge--teal dash-new">New</span>
            <span className="dash-caption">{b.received}</span>
          </div>
          <p className="dash-bk-name">{b.name} <LangChip lang={b.lang} /></p>
          <p className="dash-bk-time">{when} · {b.treatment}</p>
          <div className="dash-row dash-row--between">
            <StatusChip status={b.status} />
            <span className="lp-btn lp-btn-teal dash-btn-sm">Review</span>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <Link to="/biz/dashboard/$bookingId" params={{ bookingId: b.id }} className="dash-bk">
      <Avatar name={b.name} lang={b.lang} />
      <div className="dash-bk-body">
        <div className="dash-row dash-row--between">
          <p className="dash-bk-name">{b.name}</p>
          <span className="dash-caption">{b.received}</span>
        </div>
        <p className="dash-bk-time">{when}</p>
        <p className="dash-caption">{b.treatment} · {b.channel}</p>
        <div className="dash-row dash-bk-chips">
          <StatusChip status={b.status} />
          <LangChip lang={b.lang} />
        </div>
      </div>
    </Link>
  )
}
