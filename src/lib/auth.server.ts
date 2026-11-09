import { env } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'

export function getAuth() {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32 || !env.BETTER_AUTH_URL) {
    throw new Error('BETTER_AUTH_SECRET and BETTER_AUTH_URL must be configured')
  }

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true },
    account: { accountLinking: { enabled: false } },
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {},
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    rateLimit: {
      enabled: true,
      storage: 'database',
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
  })
}

export function googleSignInAvailable() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

export async function getAdminSession(headers: Headers) {
  const session = await getAuth().api.getSession({ headers })
  if (!session) return { status: 'anonymous' } as const

  const emails = (env.ADMIN_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase())
  if (emails.length !== 4 || new Set(emails).size !== 4 || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { status: 'denied' } as const
  }

  return emails.includes(session.user.email.trim().toLowerCase())
    ? { status: 'allowed', name: session.user.name, email: session.user.email } as const
    : { status: 'denied' } as const
}
