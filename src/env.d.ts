declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL: string
    ADMIN_EMAILS?: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    ELEVENLABS_API_KEY?: string
    AI?: Ai
  }
}
