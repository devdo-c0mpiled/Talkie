# SFU and GPT-Live integration

This code is not wired into Talkie yet. It is separate from RealtimeKit and from the ClawOps telephone bridge. PSTN calls still require ClawOps.

## Configuration

Provide `OPENAI_API_KEY` and `REALTIME_SFU_APP_SECRET` as server secrets. Configure `REALTIME_SFU_APP_ID` and `SFU_LIVE_PUBLIC_ORIGIN` as server settings. The origin must be the public HTTPS origin serving the media route. Do not put secret values, adapter endpoint URLs, or adapter tokens in browser responses or logs.

## Integration required

1. Export `SfuLiveSession` from a custom Worker entry that delegates the ordinary application fetch handler. Add its Durable Object binding and migration to the Worker configuration. Use one new Durable Object ID per call.
2. Add a public WebSocket route for `/api/sfu-live/media/{objectId}/{input|output}/{token}`. Resolve the object ID using the binding and forward only `/media/{input|output}/{token}` to that object. Do not forward arbitrary public paths to the object. Cloudflare connects to these URLs; the URL tokens must remain valid across remote-input reconnects.
3. Add an authenticated application control route. Keep a server-side association among the caller, the new object ID, and the SFU sessions and tracks allocated for that call. Authorize every operation against that association, including stop and track close. Only the trusted route may call the object's `POST /start` and `POST /stop`. The start JSON contains `sessionId`, `trackName`, `instructions`, and optional `voice`; the reply identifies the generated speech track. Do not use arbitrary client-provided SFU session IDs as proof of ownership.
4. Adapt the `startSfuLive` callbacks to `createSfuApi`. Return `{sessionId}` for `session/new`, `{tracks: [track], sessionDescription, requiresImmediateRenegotiation}` for `tracks/new`, `{}` for successful `renegotiate`, and `{tracks: [{mid}]}` for successful `tracks/close`. On start, remember the source track to object association; on stop, use that association to reach the same object. Bind the returned `MediaStream` to an audio element and provide a stop control in the app.
5. After the shared RealtimeKit work is integrated, regenerate the route tree and update environment types. Do not expose SFU app credentials to the browser. Then test with an authorized SFU app and GPT-Live account, including speaking, interruption, both disconnect directions, and actual sound quality.

The current core uses a one-hour session ceiling and a 15-second SFU request timeout. A creation timeout or lost response can leave an adapter allocated with an unknown ID. Do not automatically repeat that allocation. Adapter IDs returned before an error are stored for cleanup; if closing an adapter fails, its ID remains in Durable Object storage for operator investigation. Closure and resource reclamation are not proven by an accepted stop request. A Durable Object restart cannot resume the outbound GPT-Live WebSocket. The next adapter connection ends the old session and attempts cleanup.

## Protocol sources

- [Cloudflare WebSocket media adapter](https://developers.cloudflare.com/realtime/sfu/features/media-transport-adapters/websocket-adapter/)
- [Cloudflare SFU connection patterns](https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/)
- [OpenAI Live primary WebSocket](https://developers.openai.com/api/reference/resources/live/primary-websocket)
- [OpenAI Live voice WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets)
