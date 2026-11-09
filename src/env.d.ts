declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL: string
    ADMIN_EMAILS?: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    HOTEL_SANDBOX_ENABLED?: string
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    ELEVENLABS_API_KEY?: string
    /** ClawOps outbound calls for the traveler chat; calls stay off unless all four are set. */
    CLAWOPS_API_KEY?: string
    CLAWOPS_ACCOUNT_ID?: string
    CLAWOPS_FROM_NUMBER?: string
    CLAWOPS_AGENT_ID?: string
    CLAWOPS_ROLEPLAY_AGENT_ID?: string
    AI?: Ai
  }
}
