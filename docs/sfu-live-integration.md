# SFU and GPT-Live integration

The experimental `/sfu-live` page connects the SFU client, authenticated control API, and GPT-Live bridge. It is separate from RealtimeKit and from the ClawOps telephone bridge. PSTN calls still require ClawOps. Synthetic tests do not verify live provider connections or audio quality.

## Configuration

Provide `OPENAI_API_KEY` and `REALTIME_SFU_APP_SECRET` as server secrets. Configure `REALTIME_SFU_APP_ID` and `SFU_LIVE_PUBLIC_ORIGIN` as server settings. The origin must be the public HTTPS origin serving the media route. Do not put secret values, adapter endpoint URLs, or adapter tokens in browser responses or logs.

## Verification still needed

Test the page with an authorized SFU app and GPT-Live account, including speaking, interruption, both disconnect directions, and actual sound quality. Do not expose SFU app credentials or media adapter tokens to the browser. A successful start confirms adapter allocation, not GPT-Live audio readiness. A successful stop confirms the request was accepted, not that provider resources were reclaimed.

The current core uses a one-hour session ceiling and a 15-second SFU request timeout. A creation timeout or lost response can leave an adapter allocated with an unknown ID. Do not automatically repeat that allocation. Adapter IDs returned before an error are stored for cleanup; if closing an adapter fails, its ID remains in Durable Object storage for operator investigation. Closure and resource reclamation are not proven by an accepted stop request. A Durable Object restart cannot resume the outbound GPT-Live WebSocket. The next adapter connection ends the old session and attempts cleanup.

## Protocol sources

- [Cloudflare WebSocket media adapter](https://developers.cloudflare.com/realtime/sfu/features/media-transport-adapters/websocket-adapter/)
- [Cloudflare SFU connection patterns](https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/)
- [OpenAI Live primary WebSocket](https://developers.openai.com/api/reference/resources/live/primary-websocket)
- [OpenAI Live voice WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets)
