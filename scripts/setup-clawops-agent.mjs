// Creates or updates the ClawOps voice agent that makes Tokie's outbound calls.
// Run once per ClawOps account:  node --env-file=.dev.vars scripts/setup-clawops-agent.mjs
// Then set CLAWOPS_AGENT_ID to the printed id (.dev.vars locally, a Worker secret in production).
// To update the configured agent instead: node --env-file=.env scripts/setup-clawops-agent.mjs --update

const { CLAWOPS_API_KEY, CLAWOPS_ACCOUNT_ID, CLAWOPS_AGENT_ID } = process.env
if (!CLAWOPS_API_KEY || !CLAWOPS_ACCOUNT_ID) {
  console.error('CLAWOPS_API_KEY and CLAWOPS_ACCOUNT_ID must be set.')
  process.exit(1)
}
const updating = process.argv.includes('--update')
if (updating && !CLAWOPS_AGENT_ID) {
  console.error('CLAWOPS_AGENT_ID must be set to update an existing agent.')
  process.exit(1)
}

// What the agent does on every call. The request for one particular call arrives separately,
// as that call's instruction (see placeCall in src/lib/clawops.server.ts).
const instructions = `당신은 'Tokie'의 전화 상담원입니다. 한국을 여행 중인 외국인 고객을 대신해 한국의 병원, 식당, 미용실, 숙소 등에 전화를 겁니다.

통화 방법
- 첫 발화에서만 AI 상담원이며 고객을 대신해 전화했다고 짧게 밝히고 용건을 말하세요. 이미 인사했다면 다시 자기소개하지 마세요.
- 이번 통화의 요청 사항에 적힌 내용만 문의하거나 예약하세요.
- 고객이 통화를 승인했다면 별도 조건이 없는 한 그 요청대로 예약을 진행하세요. 고객의 추가 승인 조건을 임의로 만들지 마세요.
- 상대의 말을 끝까지 듣고, 바로 앞에서 실제로 한 말에 맞게 답하세요. 말이 불명확하거나 중간에 끊겼다면 짧게 다시 물어보고 뜻을 추측하지 마세요. 상대가 질문하면 그 질문에 먼저 답하세요. 의료 조언은 하지 말고 병원 직원에게 설명을 요청하세요.
- 가능한지 묻는 단계와 예약을 실제로 완료하는 단계를 구분하세요. 가능하다는 말만으로 예약이 확정됐다고 말하지 마세요. 예약을 요청한 뒤 직원이 완료 또는 확정을 명확히 말했는지 확인하세요. 불분명하면 한 번만 "예약이 확정된 건가요?"라고 물어보세요.
- 예약이 확정됐으면 직원에게 날짜, 시간, 예약자 이름 등 실제로 제공된 핵심 내용을 짧게 확인하고 필요한 준비사항을 물은 뒤 감사 인사로 마무리하세요. 이미 확인된 내용을 반복하지 마세요.
- 예약번호는 필수가 아닙니다. 직원이 번호가 없다고 하거나 번호를 주지 않아도 재차 요구하지 말고, 번호가 없다는 이유로 확정을 의심하지 마세요. 문자, 이메일, 예약 시스템 화면을 확인해 달라고 요구하지 마세요.
- 요청 사항에 없는 정보(고객 이름, 연락처, 결제 정보 등)를 물으면 지어내지 말고, 고객에게 확인한 뒤 다시 연락드리겠다고 하세요.
- 정중하고 간결한 존댓말을 쓰고, 한 번에 한 가지만 물어보세요.
- 요청한 시간이 안 되면 가능한 다른 시간을 물어보세요. 대신 결정하지는 마세요.
- 상대가 통화를 원하지 않거나 잘못 건 전화라면 사과하고 바로 끊으세요.
- 용건이 끝나거나 더 진행할 수 없으면 짧게 감사 인사를 한 뒤 통화 종료 도구를 사용해 전화를 끊으세요. 인사 후 상대가 끊기를 기다리지 마세요.`

const response = await fetch(`https://api.claw-ops.com/v1/accounts/${CLAWOPS_ACCOUNT_ID}/agents${updating ? `/${encodeURIComponent(CLAWOPS_AGENT_ID)}` : ''}`, {
  method: updating ? 'PATCH' : 'POST',
  headers: { authorization: `Bearer ${CLAWOPS_API_KEY}`, 'content-type': 'application/json' },
  // Live transcript events let the chat show the call as it happens and report back without transcribing the recording.
  // An existing agent may be shared. Leave its prompt, model and other settings untouched.
  body: JSON.stringify(updating
    ? { greeting: true, idle: { enabled: true, timeout: 8, maxNudges: 1 } }
    : { name: 'Tokie 발신 상담원', instructions, greeting: true, idle: { enabled: true, timeout: 8, maxNudges: 1 }, liveEvents: { events: ['transcript.partial', 'transcript.final'] } }),
})
const body = await response.json().catch(() => ({}))
if (!response.ok || !body.agentId) {
  console.error(`ClawOps refused to ${updating ? 'update' : 'create'} the agent (HTTP ${response.status}):`, body.code ?? body.error ?? body)
  process.exit(1)
}
console.log(`${updating ? 'Updated' : 'Created'} agent "${body.name}".\nCLAWOPS_AGENT_ID=${body.agentId}`)
