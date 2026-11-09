import { Link } from '@tanstack/react-router'
import logoPhone from '../../assets/landing/logo-phone.svg'
import { clinic } from '../../lib/biz-mock'
import { Icon } from '../landing/Icon'
import { LineIcon } from '../landing/LineIcon'

/** Only "Bookings" exists in this demo; the other tabs are inert placeholders like in the design. */
const items = [
  { icon: 'calendar', label: 'Bookings', current: true },
  { icon: 'phone', label: 'Calls' },
  { icon: 'agent', label: 'Agent' },
  { icon: 'settings', label: 'Settings' },
] as const

/** Desktop sidebar (hidden below 1024px). */
export function DashSidebar({ pending }: { pending: number }) {
  return (
    <nav className="dash-side" aria-label="Main">
      <Link to="/biz/dashboard" className="lp-logo" aria-label="Tokie dashboard">
        <span className="lp-logo-mark"><Icon src={logoPhone} size={16} /></span>
        Tokie
      </Link>
      <ul className="dash-side-list">
        {items.map((it) => (
          <li key={it.label}>
            {'current' in it ? (
              <Link to="/biz/dashboard" className="dash-side-link" aria-current="page">
                <LineIcon name={it.icon} />{it.label}<span className="dash-count">{pending}</span>
              </Link>
            ) : (
              <span className="dash-side-link" aria-disabled="true"><LineIcon name={it.icon} />{it.label}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="dash-side-foot">
        <span className="lp-status lp-status--live">Answering calls</span>
        <p className="dash-caption">{clinic.name}</p>
      </div>
    </nav>
  )
}

/** Mobile bottom tab bar (hidden from 1024px). */
export function DashTabs({ pending }: { pending: number }) {
  return (
    <nav className="dash-tabs" aria-label="Main">
      {items.map((it) =>
        'current' in it ? (
          <Link key={it.label} to="/biz/dashboard" className="dash-tab" aria-current="page">
            <span className="dash-tab-ic"><LineIcon name={it.icon} size={24} /><span className="dash-tab-badge" aria-hidden="true">{pending}</span></span>
            {it.label}
          </Link>
        ) : (
          <span key={it.label} className="dash-tab" aria-disabled="true"><LineIcon name={it.icon} size={24} />{it.label}</span>
        ),
      )}
    </nav>
  )
}
