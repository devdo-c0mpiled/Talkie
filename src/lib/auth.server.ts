import { env } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { getOrCreateCustomer, validDesignatedEmail } from './customers.server'

export function getAuth() {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32 || !env.BETTER_AUTH_URL) {
    throw new Error('BETTER_AUTH_SECRET and BETTER_AUTH_URL must be configured')
  }

  return betterAuth({
    database: env.DB,
    databaseHooks: {
      user: { create: {
        before: async () => {
          if (env.CUSTOMER_0001_EMAIL?.trim() && !validDesignatedEmail(env.CUSTOMER_0001_EMAIL)) {
            throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Customer configuration unavailable' })
          }
        },
        after: async (user) => { await ensureCustomer(user.id) },
      } },
    },
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

export async function ensureCustomer(userId: string) {
  const result = await getOrCreateCustomer({ db: env.DB, userId, designatedEmail: env.CUSTOMER_0001_EMAIL })
  if (result.kind !== 'ready') throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Customer unavailable' })
  return result.customer
}
