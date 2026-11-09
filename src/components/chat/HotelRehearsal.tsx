import { useState } from 'react'
import { hotelScenarios } from '../../lib/hotel-rehearsal'

export function HotelRehearsal({ busy, messages, onFill }: {
  busy: boolean
  messages: readonly unknown[]
  onFill: (text: string) => void
}) {
  const [selected, setSelected] = useState(0)
  const [line, setLine] = useState(0)
  const scenario = hotelScenarios[selected]
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({
      mode: 'live_chat_rehearsal', scenario: scenario.id,
      review: 'not_graded', telephonyVerified: false,
      expectedChecks: scenario.checks, messages,
    }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `hotel-${scenario.id}-chat.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <details className="ch-rehearsal" open>
    <summary>호텔 대본 테스트</summary>
    <p>실제 AI 응답 · 전화 발신은 별도 승인</p>
    <label>상황<select aria-label="호텔 테스트 상황" disabled={busy} value={selected} onChange={event => { setSelected(Number(event.target.value)); setLine(0) }}>
      {hotelScenarios.map((item, index) => <option key={item.id} value={index}>{item.label}</option>)}
    </select></label>
    <label>고객 발화<select aria-label="고객 발화 단계" disabled={busy} value={line} onChange={event => setLine(Number(event.target.value))}>
      {scenario.lines.map((_, index) => <option key={index} value={index}>{index + 1}</option>)}
    </select></label>
    <p lang="en">{scenario.lines[line]}</p>
    <div className="ch-quick">
      <button type="button" disabled={busy} onClick={() => onFill(scenario.lines[line])}>입력창에 넣기</button>
      <button type="button" onClick={download}>기록 저장</button>
      <button type="button" disabled={busy} onClick={() => window.location.reload()}>새 대화</button>
    </div>
    <details className="ch-script">
      <summary>전체 대본 · 연기용</summary>
      <ol>
        {scenario.turns.map((turn, index) => <li key={index}>
          <strong>{turn.speaker}</strong>
          <p lang={turn.speaker.includes('호텔') ? 'ko' : 'en'}>{turn.text}</p>
          {turn.customer && <button type="button" disabled={busy} onClick={() => {
            setLine(scenario.turns.slice(0, index + 1).filter(item => item.customer).length - 1)
            onFill(turn.text)
          }}>이 대사 입력</button>}
        </li>)}
      </ol>
    </details>
    <p>확인 항목: {scenario.checks.join(' · ')}</p>
  </details>
}
