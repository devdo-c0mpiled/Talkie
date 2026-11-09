// Creates the ClawOps voice agent that makes Tokie's outbound calls and prints its id.
// Run once per ClawOps account:  node --env-file=.dev.vars scripts/setup-clawops-agent.mjs
// Then set CLAWOPS_AGENT_ID to the printed id (.dev.vars locally, a Worker secret in production).

const { CLAWOPS_API_KEY, CLAWOPS_ACCOUNT_ID } = process.env
if (!CLAWOPS_API_KEY || !CLAWOPS_ACCOUNT_ID) {
  console.error('CLAWOPS_API_KEY and CLAWOPS_ACCOUNT_ID must be set.')
  process.exit(1)
}

// What the agent does on every call. The request for one particular call arrives separately,
// as that call's instruction (see placeCall in src/lib/clawops.server.ts).
const instructions = `당신은 'Tokie'의 전화 상담원입니다. 한국을 여행 중인 외국인 고객을 대신해 한국의 병원, 식당, 미용실, 숙소 등에 전화를 겁니다.

통화 방법
- 상대가 전화를 받으면 먼저 AI 상담원이며 외국인 고객을 대신해 전화했다고 짧게 밝히세요.
- 이번 통화의 요청 사항에 적힌 내용만 문의하거나 예약하세요.
- 요청 사항에 없는 정보(고객 이름, 연락처, 결제 정보 등)를 물으면 지어내지 말고, 고객에게 확인한 뒤 다시 연락드리겠다고 하세요.
- 정중하고 간결한 존댓말을 쓰고, 한 번에 한 가지만 물어보세요.
- 예약이 되면 날짜, 시간, 인원, 예약자 이름, 준비물이나 주의 사항을 다시 읽어 확인하세요.
- 요청한 시간이 안 되면 가능한 다른 시간을 물어보세요. 대신 결정하지는 마세요.
- 상대가 통화를 원하지 않거나 잘못 건 전화라면 사과하고 바로 끊으세요.
- 용건이 끝나면 감사 인사를 하고 통화를 마치세요.`

const response = await fetch(`https://api.claw-ops.com/v1/accounts/${CLAWOPS_ACCOUNT_ID}/agents`, {
  method: 'POST',
  headers: { authorization: `Bearer ${CLAWOPS_API_KEY}`, 'content-type': 'application/json' },
  // Live transcript events let the chat show the call as it happens and report back without transcribing the recording.
  body: JSON.stringify({ name: 'Tokie 발신 상담원', instructions, greeting: true, liveEvents: { events: ['transcript.partial', 'transcript.final'] } }),
})
const body = await response.json().catch(() => ({}))
if (!response.ok || !body.agentId) {
  console.error(`ClawOps refused to create the agent (HTTP ${response.status}):`, body.code ?? body.error ?? body)
  process.exit(1)
}
console.log(`Created agent "${body.name}".\nCLAWOPS_AGENT_ID=${body.agentId}`)
