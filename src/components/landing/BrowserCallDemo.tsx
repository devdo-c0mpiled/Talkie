import { useEffect, useState } from 'react'
import tokie from '../../assets/landing/tokie.webp'
import { LineIcon } from './LineIcon'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

// Sample calls from the design; business names are fictional.
// Lines alternate traveler (English) and business (Korean): [what was said, Tokie's translation].
const calls = [
  {
    tab: 'Restaurant',
    shop: 'Oneul Kitchen',
    result: 'Booked · Tonight 7:00 PM · 4 people',
    lines: [
      ['Hi, can I book a table for 4 tonight at 7?', '오늘 저녁 7시에 4명 예약할 수 있을까요?'],
      ['네, 7시에 4분 자리 있어요. 성함이 어떻게 되세요?', 'Yes, we have a table for 4 at 7. May I have your name?'],
      ["It's Emma. Do you have vegetarian options?", '엠마예요. 채식 메뉴 있나요?'],
      ['네, 채식 비빔밥이랑 두부 요리가 있어요.', 'Yes, we have vegetarian bibimbap and tofu dishes.'],
    ],
  },
  {
    tab: 'Beauty salon',
    shop: 'Dalbit Hair',
    result: 'Booked · Tomorrow 4:00 PM · Haircut with Jisoo',
    lines: [
      ['Do you have time for a haircut tomorrow afternoon?', '내일 오후에 커트 가능한가요?'],
      ['내일 오후 2시랑 4시 가능해요. 원하시는 디자이너 있으세요?', 'We have 2 PM and 4 PM tomorrow. Any stylist preference?'],
      ['4 PM is great. Anyone who speaks a little English.', '4시 좋아요. 영어 조금 하시는 분이면 좋겠어요.'],
      ['그럼 지수 디자이너로 잡아 드릴게요.', "Then I'll book you with Jisoo."],
    ],
  },
  {
    tab: 'Pharmacy',
    shop: 'Haneul Pharmacy',
    result: 'Answered · Open until 9:00 PM',
    lines: [
      ['Hi, do you have something for motion sickness?', '멀미약 있나요?'],
      ['네, 있어요. 드실 분이 몇 살이세요? 어린이용도 있어요.', "Yes, we do. How old is the person taking it? We also have a kids' version."],
      ["It's for me, I'm an adult. Are you open until 9?", '제가 먹을 거예요, 성인이에요. 9시까지 하세요?'],
      ['네, 9시까지 열어요. 오시면 바로 드릴게요.', "Yes, we're open until 9. We'll have it ready when you come."],
    ],
  },
]

// Steps 0–7 alternate "someone is talking" and "their line appears"; the last step shows the result.
const LAST_STEP = 8
const STARTING_SECONDS = 4

/** Phone mock-up that plays a live-translated browser call, one line at a time. */
export function BrowserCallDemo() {
  const reducedMotion = usePrefersReducedMotion()
  const [active, setActive] = useState(0)
  const [progress, setProgress] = useState(0)
  const [seconds, setSeconds] = useState(0)
  // Examples rotate on their own until the visitor picks one.
  const [rotating, setRotating] = useState(true)

  useEffect(() => {
    if (reducedMotion) return
    const hold = progress === LAST_STEP ? 3000 : progress % 2 ? 1900 : 900
    const timer = setTimeout(() => {
      if (progress < LAST_STEP) {
        setProgress(progress + 1)
        return
      }
      setProgress(0)
      setSeconds(0)
      if (rotating) setActive((active + 1) % calls.length)
    }, hold)
    return () => clearTimeout(timer)
  }, [reducedMotion, progress, active, rotating])

  useEffect(() => {
    if (reducedMotion) return
    const timer = setInterval(() => setSeconds((current) => current + 1), 1000)
    return () => clearInterval(timer)
  }, [reducedMotion])

  function pick(index: number) {
    setRotating(false)
    setActive(index)
    setProgress(0)
    setSeconds(0)
  }

  // With reduced motion the whole call is shown at once.
  const step = reducedMotion ? LAST_STEP : progress
  const call = calls[active]
  const shown = Math.floor((step + 1) / 2)
  const talking = step < LAST_STEP && step % 2 === 0
  const elapsed = STARTING_SECONDS + seconds

  return (
    <div className="lp-demo">
      <div className="lp-demo-tabs" role="group" aria-label="Choose a call example">
        {calls.map(({ tab }, index) => (
          <button key={tab} type="button" aria-pressed={index === active} onClick={() => pick(index)}>{tab}</button>
        ))}
      </div>
      <div className="lp-demo-phone">
        <div className="lp-demo-screen">
          <div className="lp-demo-top">
            <span className="lp-tokie-ava" aria-hidden="true"><img src={tokie} alt="" /></span>
            <div className="lp-demo-who">
              <p className="lp-title-sm">{call.shop}</p>
              <p className="lp-demo-status"><span className="lp-demo-live" aria-hidden="true" />Live · Tokie translating</p>
            </div>
            <span className="lp-meta">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
          </div>
          <div className="lp-demo-feed">
            {call.lines.slice(0, shown).map(([text, translation], index) => {
              const traveler = index % 2 === 0
              return (
                <div key={`${active}-${index}`} className={traveler ? 'lp-demo-row lp-demo-row--me' : 'lp-demo-row'}>
                  <p className="lp-demo-bubble" lang={traveler ? 'en' : 'ko'}>{text}</p>
                  <p className="lp-demo-tr" lang={traveler ? 'ko' : 'en'}>
                    <i aria-hidden="true"><img src={tokie} alt="" /></i>
                    <span className="lp-sr-only">Tokie translated: </span>
                    {translation}
                  </p>
                </div>
              )
            })}
            {talking && (
              <div key={`talking-${step}`} className={(step / 2) % 2 === 0 ? 'lp-demo-talking lp-demo-talking--me' : 'lp-demo-talking'} aria-hidden="true"><i /><i /><i /></div>
            )}
            {step === LAST_STEP && <p className="lp-demo-result"><LineIcon name="check" size={14} />{call.result}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
