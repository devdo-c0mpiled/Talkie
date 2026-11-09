import { Link } from '@tanstack/react-router'
import logoPhone from '../../assets/landing/logo-phone.svg'
import { Icon } from '../landing/Icon'

/** Dark brand panel beside the sign-up form: logo, pitch and a sample incoming call. */
export function SignupSidebar() {
  return (
    <aside className="ob-side">
      <Link to="/" className="lp-logo" aria-label="Tokie home">
        <span className="lp-logo-mark"><Icon src={logoPhone} size={16} /></span>
        Tokie
      </Link>

      <div className="ob-side-body">
        <h2 className="ob-pitch">Answer every international booking call. In their language.</h2>

        <div className="ob-call">
          <div className="ob-call-head">
            <div className="ob-call-who">
              <span className="ob-call-flag" aria-hidden="true">JP</span>
              <div>
                <p className="ob-call-title">Incoming call · Japanese</p>
                <p className="ob-call-meta">2 min 14 sec · Today 2:32 PM</p>
              </div>
            </div>
            <span className="lp-status lp-status--pending">Awaiting confirmation</span>
          </div>
          <div className="ob-call-quote">
            <p lang="ja">11月20日の午後3時に、鼻の相談を予約したいです。</p>
            <p>I'd like to book a nose consultation on Nov 20 at 3 PM.</p>
          </div>
          <ul className="ob-call-tags">
            <li>Fri, Nov 20 · 3:00 PM</li>
            <li>Rhinoplasty consult</li>
          </ul>
        </div>
      </div>

      <p className="ob-side-foot">Japanese, Chinese, Thai and English callers. One clinic number.</p>
    </aside>
  )
}
