import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { LineIcon } from '../landing/LineIcon'
import { OnboardingShell } from './OnboardingShell'

// Placeholder values from the design; the number, link and test call are fictional.
// The test call is Allen's scenario 1: a twin-room inquiry. Tokie talks to the guest in
// English and, in the same call, checks availability with the Korean-speaking front desk.
const NUMBER = '+82 2 6080 1120'
const LINK = 'tokie.app/c/seoulbreeze'
const shareOn = ['Instagram bio', 'LINE Official Account', 'Website button', 'Xiaohongshu']
const transcript = [
  { who: 'Allen', lang: 'en' as const, text: "Hi, I'm Allen. Could you ask the hotel whether they have a twin room for two adults, December 5 to 7, 2026? Please check availability first." },
  { who: 'Tokie → Front desk', lang: 'ko' as const, text: '안녕하세요. Allen 고객님을 대신해 문의드리는 AI 전화비서입니다. 지금 문의드려도 괜찮을까요?', sub: 'Hello, this is the AI phone assistant calling on behalf of guest Allen. Is now a good time?' },
  { who: 'Front desk', lang: 'ko' as const, text: '네, 말씀하세요.', sub: 'Yes, go ahead.' },
  { who: 'Tokie → Front desk', lang: 'ko' as const, text: '12월 5일부터 7일까지 2박, 성인 두 분이 묵을 트윈룸 한 개가 가능한가요?', sub: 'Do you have a twin room available for two adults, December 5 to 7 (2 nights)?' },
  { who: 'Front desk', lang: 'ko' as const, text: '네, 가능합니다. 예약 요청을 남겨드릴까요?', sub: 'Yes, it is available. Should I note a booking request?' },
  { who: 'Tokie → Allen', lang: 'en' as const, text: 'They have a twin room available for those dates. Nothing is booked yet. Would you like to check the total price before deciding?' },
  { who: 'Allen', lang: 'en' as const, text: 'Yes, please check the total first.' },
]
const results = ['Detected English from the first word', 'Confirmed room availability with the front desk', 'Collected guest name and stay dates', 'Held the price check before booking']
const summary = [
  ['Number', NUMBER],
  ['Hours', 'Mon to Fri · 10 AM to 7 PM, Sat · 10 AM to 3 PM'],
  ['Languages', 'Japanese, Chinese, Thai, English'],
  ['Intake fields', '5 questions'],
  ['Handoffs', 'Price confirmations, complaints'],
]

export function PublishStep() {
  const [live, setLive] = useState(false)
  const [copied, setCopied] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)

  const copy = (text: string, msg: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(msg)
  }

  if (live) {
    return (
      <OnboardingShell
        step={6}
        title="You're live"
        sub={`Tokie now answers ${NUMBER} for Seoul Breeze Hotel. New bookings show up on your dashboard.`}
        note={copied || undefined}
        actions={<Link to="/biz/dashboard" className="lp-btn lp-btn-teal ob-btn">Go to dashboard</Link>}
      >
        <span className="lp-status lp-status--live ob-live">Live · Answering calls</span>
        <button type="button" className="ob-link" onClick={() => copy(`https://${LINK}`, 'Link copied')}>Copy web call link</button>
      </OnboardingShell>
    )
  }

  return (
    <OnboardingShell
      step={6}
      title="Your number is ready"
      sub="Callers abroad can dial the number or tap the link to call free from their browser."
      note={copied || undefined}
      back="/biz/onboarding/fields"
      actions={<button type="button" className="lp-btn lp-btn-teal ob-btn" onClick={() => dialog.current?.showModal()}>Publish</button>}
    >
      <section className="ob-card ob-num-card" aria-label="Your agent's number">
        <div className="ob-row ob-row--between">
          <div>
            <p className="ob-caption">Phone number</p>
            <p className="ob-mono ob-big-num">{NUMBER}</p>
          </div>
          <button type="button" className="ob-btn-sec ob-btn-sm" aria-label="Copy phone number" onClick={() => copy(NUMBER, 'Number copied')}><LineIcon name="copy" size={16} />Copy</button>
        </div>
        <hr className="ob-hr" />
        <div className="ob-row ob-row--between">
          <div>
            <p className="ob-caption">Web call link</p>
            <p className="ob-mono">{LINK}</p>
          </div>
          <button type="button" className="ob-btn-sec ob-btn-sm" aria-label="Copy web call link" onClick={() => copy(`https://${LINK}`, 'Link copied')}><LineIcon name="copy" size={16} />Copy</button>
        </div>
      </section>

      <section className="ob-stack ob-stack--tight" aria-labelledby="pub-share">
        <p id="pub-share" className="ob-label">Share it on</p>
        <div className="ob-chips">{shareOn.map((s) => <span key={s} className="ob-chip ob-chip--line ob-chip--lg">{s}</span>)}</div>
      </section>

      <section className="ob-card ob-stack" aria-labelledby="pub-test">
        <div className="ob-card-head">
          <h2 id="pub-test" className="ob-card-title">Test call</h2>
          <span className="ob-chip ob-chip--soft"><span lang="en">English</span> · 02:41</span>
        </div>
        <div className="ob-inset ob-stack">
          {transcript.map((line, i) => (
            <div key={i}>
              <p className="ob-caption">{line.who}</p>
              <p className="ob-body" lang={line.lang}>{line.text}</p>
              {line.sub && <p className="ob-caption">{line.sub}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* The design ticks these off one by one; the demo shows the finished state. */}
      <section className="ob-card ob-stack" aria-labelledby="pub-res">
        <div className="ob-card-head">
          <h2 id="pub-res" className="ob-card-title">Test results</h2>
          <span className="ob-chip ob-chip--teal">All 4 passed</span>
        </div>
        <ul className="ob-stack ob-stack--tight">
          {results.map((r) => <li key={r} className="ob-row"><span className="ob-check"><LineIcon name="check" size={18} /></span>{r}</li>)}
        </ul>
      </section>

      <dialog ref={dialog} className="ob-dialog" aria-labelledby="pub-confirm">
        <h2 id="pub-confirm" className="ob-card-title">Ready to go live?</h2>
        <dl className="ob-kv">
          {summary.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <button type="button" className="lp-btn lp-btn-teal ob-btn ob-btn-block" onClick={() => { dialog.current?.close(); setCopied(''); setLive(true) }}>Start answering calls</button>
        <button type="button" className="ob-btn-sec ob-btn-block" onClick={() => dialog.current?.close()}>Not yet</button>
      </dialog>
    </OnboardingShell>
  )
}
