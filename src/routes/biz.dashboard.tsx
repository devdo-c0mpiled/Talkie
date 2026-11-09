import { Outlet, createFileRoute, useMatch } from '@tanstack/react-router'
import { useState } from 'react'
import { BookingCard } from '../components/dashboard/BookingCard'
import { DashSidebar, DashTabs } from '../components/dashboard/DashNav'
import { LineIcon } from '../components/landing/LineIcon'
import dashboardCss from '../dashboard.css?url'
import { type BookingStatus, bookings, clinic, summary } from '../lib/biz-mock'

export const Route = createFileRoute('/biz/dashboard')({
  head: () => ({
    meta: [{ title: 'Bookings · Tokie' }],
    links: [{ rel: 'stylesheet', href: dashboardCss }],
  }),
  component: DashboardLayout,
})

const pending = bookings.filter((b) => b.status === 'pending').length

/** `/biz/dashboard/$bookingId` is a child route, so this layout renders either the list or the detail. */
function DashboardLayout() {
  const detail = useMatch({ from: '/biz/dashboard/$bookingId', shouldThrow: false })
  return (
    <div className="lp dash">
      <DashSidebar pending={pending} />
      {detail ? <Outlet /> : <BookingsPage />}
    </div>
  )
}

type Filter = 'all' | BookingStatus
const filters: [Filter, string][] = [['all', 'All'], ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['handoff', 'Handoffs']]

function BookingsPage() {
  const [range, setRange] = useState<'today' | 'week'>('today')
  const [filter, setFilter] = useState<Filter>('all')
  const m = summary[range]
  const list = bookings.filter((b) => filter === 'all' || b.status === filter)

  return (
    <div className="dash-body">
      <header className="dash-top">
        <span className="dash-av dash-av--sm dash-av--ja" aria-hidden="true">{clinic.initial}</span>
        <div className="dash-top-text">
          <p className="dash-label">{clinic.name}</p>
          <p className="dash-caption dash-live"><span className="dash-live-dot" aria-hidden="true" />Live · Answering calls</p>
        </div>
        <button className="dash-icon-btn" type="button" aria-label="Notifications"><LineIcon name="bell" size={22} /></button>
      </header>

      <main className="dash-main">
        <div className="dash-head">
          <div>
            <p className="dash-caption">{clinic.today}</p>
            <h1 className="dash-title" aria-live="polite"><span className="dash-accent">{pending}</span> bookings need your review</h1>
          </div>
          <div className="dash-seg" role="radiogroup" aria-label="Time range">
            <button type="button" role="radio" aria-checked={range === 'today'} onClick={() => setRange('today')}>Today</button>
            <button type="button" role="radio" aria-checked={range === 'week'} onClick={() => setRange('week')}>This week</button>
          </div>
        </div>

        <div className="dash-metrics" role="list" aria-label="Summary">
          <div className="dash-metric" role="listitem"><span className="dash-caption">Calls</span><b>{m.calls}</b></div>
          <div className="dash-metric" role="listitem"><span className="dash-caption">Booking requests</span><b>{m.reqs}</b></div>
          <div className="dash-metric" role="listitem"><span className="dash-caption">Handoffs</span><b>{m.hand}</b></div>
          <div className="dash-metric dash-metric--wide" role="listitem">
            <span className="dash-caption">Languages</span>
            <div className="dash-langbar" aria-hidden="true">
              <span className="dash-langbar--ja" style={{ flex: m.ja }} />
              <span className="dash-langbar--zh" style={{ flex: m.zh }} />
              <span className="dash-langbar--th" style={{ flex: m.th }} />
              <span className="dash-langbar--en" style={{ flex: m.en }} />
            </div>
            <div className="dash-caption dash-row"><span lang="ja">日本語 {m.ja}</span><span lang="zh">中文 {m.zh}</span><span lang="th">ไทย {m.th}</span><span lang="en">English {m.en}</span></div>
          </div>
        </div>

        <div className="dash-filters" role="tablist" aria-label="Filter bookings">
          {filters.map(([k, label]) => (
            <button key={k} className="lp-chip dash-filter" type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
              {k === 'all' ? label : `${label} ${bookings.filter((b) => b.status === k).length}`}
            </button>
          ))}
        </div>

        <section className="dash-list" aria-label="Bookings">
          {list.map((b) => <BookingCard key={b.id} b={b} />)}
          {list.length === 0 && <p className="dash-empty">Nothing here right now.</p>}
        </section>
      </main>

      <DashTabs pending={pending} />
    </div>
  )
}
