import { useState } from 'react'
import { LineIcon } from '../landing/LineIcon'
import { OnboardingShell } from './OnboardingShell'

// Placeholder intake questions from the design, with the Japanese line the agent would say.
const fields = [
  { k: 'name', required: true, name: 'Name', hint: 'As shown on passport', ja: 'お名前をパスポートの表記で教えていただけますか？', en: 'Could you tell me your name as it appears on your passport?' },
  { k: 'dates', required: true, name: 'Check-in & check-out dates', hint: 'Only from available dates', ja: 'ご希望のチェックインとチェックアウトの日付を教えてください。', en: 'What are your check-in and check-out dates?' },
  { k: 'room', name: 'Room type', hint: 'Twin, double, family, or suite', ja: 'ご希望のお部屋タイプはございますか？', en: 'Do you have a room type preference?' },
  { k: 'contact', name: 'Contact', hint: 'WhatsApp, LINE, or email', ja: '確定のご連絡はどの方法がよろしいですか？', en: 'How should we send your confirmation?' },
  { k: 'guests', name: 'Number of guests', hint: 'Adults and children', ja: 'ご宿泊人数を教えてください。', en: 'How many guests will be staying?' },
  { k: 'prevstay', name: 'Previous stays', hint: 'Shared with the front desk before check-in', ja: '以前にご宿泊いただいたことはございますか？', en: 'Have you stayed with us before?' },
  { k: 'requests', name: 'Special requests', hint: 'Early check-in, late checkout, allergies, etc.', ja: '特別なご要望はございますか？', en: 'Do you have any special requests?' },
]

export function FieldsStep() {
  const [on, setOn] = useState<Record<string, boolean>>({ room: true, contact: true, guests: false, prevstay: true, requests: false })
  const enabled = fields.filter((f) => f.required || on[f.k])

  return (
    <OnboardingShell
      step={5}
      title="What should your agent ask callers?"
      sub="Your agent only asks what's turned on. Fewer questions mean shorter calls and more completed bookings."
      note={<><b>{enabled.length} questions</b> · about {enabled.length * 12} seconds per call</>}
      back="/biz/onboarding/schedule"
      next="/biz/onboarding/publish"
    >
      <div className="ob-split">
        <section className="ob-card" aria-label="Questions">
          {fields.map((f) => (
            <div key={f.k} className="ob-wrow">
              <div className="ob-grow">
                <p className="ob-label">{f.name}</p>
                <p className="ob-caption">{f.hint}</p>
              </div>
              {f.required
                ? <span className="ob-chip ob-chip--soft">Required</span>
                : <button type="button" role="switch" className="ob-switch" aria-checked={!!on[f.k]} aria-label={`Ask about ${f.name.toLowerCase()}`} onClick={() => setOn({ ...on, [f.k]: !on[f.k] })} />}
            </div>
          ))}
          {/* Demo only: custom questions are not built. */}
          <button type="button" className="ob-link ob-add"><LineIcon name="plus" size={18} /> Add custom question</button>
        </section>

        <section className="ob-card ob-stack" aria-labelledby="fields-prev">
          <div className="ob-card-head">
            <div>
              <h2 id="fields-prev" className="ob-card-title">Preview</h2>
              <p className="ob-caption">How your agent asks a caller in Japanese</p>
            </div>
            <span className="ob-chip ob-chip--soft" lang="ja">日本語</span>
          </div>
          <ul className="ob-inset ob-stack ob-stack--tight" aria-live="polite">
            {enabled.map((f) => (
              <li key={f.k} className="ob-qrow">
                <span className="ob-ava" aria-hidden="true">T</span>
                <div className="ob-bubble">
                  <p lang="ja">{f.ja}</p>
                  <p className="ob-caption">{f.en}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </OnboardingShell>
  )
}
