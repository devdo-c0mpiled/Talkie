import { Marquee } from './Marquee'

type SampleCall = { lang: string; language: string; quote: string; translation: string }

const sampleCalls: SampleCall[] = [
  { lang: 'ja', language: '日本語', quote: '明日の11時にレーザートーニングは空いていますか？', translation: 'Is laser toning open tomorrow at 11?' },
  { lang: 'zh-Hans', language: '中文', quote: '我想预约两个人的皮肤护理。', translation: "I'd like to book skin care for two people." },
  { lang: 'th', language: 'ไทย', quote: 'อยากจองโบท็อกซ์วันเสาร์ค่ะ', translation: "I'd like to book Botox on Saturday." },
  { lang: 'ja', language: '日本語', quote: '日本語で説明してもらえますか？', translation: 'Can you explain in Japanese?' },
  { lang: 'zh-Hans', language: '中文', quote: '需要提前多久到？', translation: 'How early should I arrive?' },
  { lang: 'th', language: 'ไทย', quote: 'มีพนักงานพูดภาษาไทยไหมคะ', translation: 'Is there staff who speaks Thai?' },
]

// The second row shows the same calls, starting halfway through the set.
const rows = [sampleCalls, [...sampleCalls.slice(3), ...sampleCalls.slice(0, 3)]]

function SampleCallCard({ lang, language, quote, translation }: SampleCall) {
  return (
    <li className="lp-sample">
      <div className="lp-sample-head">
        <span className="lp-badge">Sample call</span>
        <span className="lp-meta" lang={lang}>{language}</span>
      </div>
      <p className="lp-sample-quote" lang={lang}>{quote}</p>
      <p className="lp-message-sub">{translation}</p>
    </li>
  )
}

export function SampleCalls() {
  return (
    <section className="lp-samples">
      <div className="lp-container lp-section-head lp-section-head--center">
        <p className="lp-eyebrow">Sample calls</p>
        <h2 className="lp-h2">Hear how a call sounds</h2>
      </div>
      <div className="lp-samples-rows">
        {rows.map((row, index) => (
          // Only the first row is exposed to assistive tech; the second repeats it.
          <Marquee key={index} copies={4} duration={56} reverse={index % 2 === 1} decorative={index > 0}>
            <ul className="lp-sample-list">
              {row.map((call) => <SampleCallCard key={call.quote} {...call} />)}
            </ul>
          </Marquee>
        ))}
      </div>
    </section>
  )
}
