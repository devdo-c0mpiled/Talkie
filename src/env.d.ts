declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL: string
    ADMIN_EMAILS?: string
    CUSTOMER_0001_EMAIL?: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    OPENAI_API_KEY?: string
    CLAWOPS_WEBHOOK_URL?: string
    CLAWOPS_SIGNING_KEY?: string
    CLAWOPS_ACCOUNT_ID?: string
    CLAWOPS_PHONE_NUMBER?: string
    GEMINI_API_KEY?: string
    ELEVENLABS_API_KEY?: string
    CLAWOPS_API_KEY?: string
    CLAWOPS_FROM_NUMBER?: string
    SFU_LIVE: DurableObjectNamespace
    TELEPHONE_LISTEN: DurableObjectNamespace
    REALTIME_SFU_APP_ID?: string
    REALTIME_SFU_APP_SECRET?: string
    SFU_LIVE_PUBLIC_ORIGIN?: string
    REALTIMEKIT_ACCOUNT_ID?: string
    REALTIMEKIT_APP_ID?: string
    REALTIMEKIT_API_TOKEN?: string
    REALTIMEKIT_VOICE_PRESET?: string
    AI?: Ai
  }
}
