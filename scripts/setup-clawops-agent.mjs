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
import {phoneAgentInstructions as instructions} from '../src/lib/phone-agent-instructions.mjs'

const response = await fetch(`https://api.claw-ops.com/v1/accounts/${CLAWOPS_ACCOUNT_ID}/agents`, {
  method: 'POST',
  headers: { authorization: `Bearer ${CLAWOPS_API_KEY}`, 'content-type': 'application/json' },
  // Live transcript events let the chat show the call as it happens and report back without transcribing the recording.
  body: JSON.stringify({ name: 'Tokie 발신 상담원', instructions, greeting: false, liveEvents: { events: ['transcript.partial', 'transcript.final'] } }),
})
const body = await response.json().catch(() => ({}))
if (!response.ok || !body.agentId) {
  console.error(`ClawOps refused to create the agent (HTTP ${response.status}):`, body.code ?? body.error ?? body)
  process.exit(1)
}
console.log(`Created agent "${body.name}".\nCLAWOPS_AGENT_ID=${body.agentId}`)
