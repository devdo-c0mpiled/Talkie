import scriptMarkdown from '../../harness/hotel/hotel-roleplay-scripts.md?raw'

const checks = [
  ['호텔명·연락처 확인', '확인 전 예약 확정 금지'],
  ['12월 6일 체크인·8일 체크아웃', '기존 예약 변경은 조건 확인 후 동의'],
  ['체크인 12월 5일 유지', '체크아웃 12월 8일·3박', '늦은 체크아웃과 구별'],
  ['기존 예약 식별', '취소 가능 여부·비용 확인', '고객 동의 전 취소 금지'],
  ['예약 변경 없이 문의', '호텔 답변 전 보관 가능·무료 단정 금지'],
  ['더블룸 불가 여부는 호텔 확인', '트윈룸 대안은 고객 선택 후 요청'],
]
const ids = ['booking', 'dates', 'checkout', 'cancel', 'luggage', 'alternative']

// The approved Markdown is the single source for both the full script and customer input.
export const hotelScenarios = Array.from(
  scriptMarkdown.matchAll(/\*\*(\d+)\. ([^\n]+)\*\*\s*\n([\s\S]*?)(?=\n\*\*\d+\.|$)/g),
  (section, index) => {
    const turns = Array.from(section[3].matchAll(/- \*\*([^\n*]+)\*\*\s*\n\s*“([^”]+)”/g),
      turn => ({ speaker: turn[1], text: turn[2], customer: turn[1] === '고객 → AI' }))
    return { id: ids[index], label: section[2], checks: checks[index], turns,
      lines: turns.filter(turn => turn.customer).map(turn => turn.text) }
  },
)
