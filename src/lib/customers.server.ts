import '@tanstack/react-start/server-only'

type CustomerRow = { customer_no: number; user_id: string; phone_number: string | null }
type Customer = { id: string; userId: string; phoneNumber: string | null }
type CustomerResult =
  | { kind: 'ready'; customer: Customer }
  | { kind: 'not_configured' | 'invalid_config' | 'not_found' | 'conflict' }

function customer(row: CustomerRow): Customer {
  return { id: String(row.customer_no).padStart(4, '0'), userId: row.user_id, phoneNumber: row.phone_number }
}

function normalizePhone(input: string): string | null {
  if (!/^[\d+ ()-]+$/.test(input)) return null
  let digits = input.replace(/[ ()-]/g, '')
  if (digits.startsWith('+82')) digits = `0${digits.slice(3).replace(/^0/, '')}`
  return /^0\d{8,11}$/.test(digits) ? digits : null
}

/** Use only a user ID obtained from a verified Better Auth session. */
export async function getOrCreateCustomer({ db, userId, designatedEmail }: {
  db: D1Database; userId: string; designatedEmail: string | undefined
}): Promise<CustomerResult> {
  if (!designatedEmail?.trim()) return { kind: 'not_configured' }
  const email = designatedEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { kind: 'invalid_config' }
  const user = await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(userId).first<{ email: string }>()
  if (!user) return { kind: 'not_found' }
  const designated = user.email.trim().toLowerCase() === email
  const existing = await db.prepare('SELECT customer_no, user_id, phone_number FROM customers WHERE user_id = ?')
    .bind(userId).first<CustomerRow>()
  if (existing) {
    if ((existing.customer_no === 1) !== designated) return { kind: 'conflict' }
    return { kind: 'ready', customer: customer(existing) }
  }

  if (designated) {
    await db.prepare('UPDATE OR IGNORE customers SET user_id = ? WHERE customer_no = 1 AND user_id IS NULL').bind(userId).run()
  } else {
    await db.prepare('INSERT OR IGNORE INTO customers (user_id) VALUES (?)').bind(userId).run()
  }
  const assigned = await db.prepare('SELECT customer_no, user_id, phone_number FROM customers WHERE user_id = ?')
    .bind(userId).first<CustomerRow>()
  if (!assigned || (assigned.customer_no === 1) !== designated) return { kind: 'conflict' }
  return { kind: 'ready', customer: customer(assigned) }
}

/** Assign the configured number once. Existing assignments are never replaced. */
export async function bindConfiguredCustomerPhone({ db, phoneNumber, designatedEmail }: {
  db: D1Database; phoneNumber: string | undefined; designatedEmail: string | undefined
}): Promise<CustomerResult> {
  if (!phoneNumber?.trim()) return { kind: 'not_configured' }
  if (!designatedEmail?.trim()) return { kind: 'not_configured' }
  const email = designatedEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { kind: 'invalid_config' }
  const number = normalizePhone(phoneNumber.trim())
  if (!number) return { kind: 'invalid_config' }
  await db.prepare(`UPDATE OR IGNORE customers SET phone_number = ? WHERE customer_no = 1 AND user_id IS NOT NULL
    AND (phone_number IS NULL OR phone_number = ?)
    AND EXISTS (SELECT 1 FROM "user" WHERE id = customers.user_id AND lower(trim(email)) = ?)`)
    .bind(number, number, email).run()
  const assigned = await db.prepare('SELECT customer_no, user_id, phone_number FROM customers WHERE customer_no = 1 AND user_id IS NOT NULL')
    .first<CustomerRow>()
  if (!assigned) return { kind: 'not_found' }
  const user = await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(assigned.user_id).first<{ email: string }>()
  if (!user || user.email.trim().toLowerCase() !== email || assigned.phone_number !== number) return { kind: 'conflict' }
  return { kind: 'ready', customer: customer(assigned) }
}

/** Resolve a verified provider's called number to its assigned customer. */
export async function getCustomerByPhone({ db, phoneNumber }: {
  db: D1Database; phoneNumber: string
}): Promise<CustomerResult> {
  const number = normalizePhone(phoneNumber.trim())
  if (!number) return { kind: 'invalid_config' }
  const assigned = await db.prepare('SELECT customer_no, user_id, phone_number FROM customers WHERE phone_number = ? AND user_id IS NOT NULL')
    .bind(number).first<CustomerRow>()
  return assigned ? { kind: 'ready', customer: customer(assigned) } : { kind: 'not_found' }
}
