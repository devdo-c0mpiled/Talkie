import '@tanstack/react-start/server-only'

type CustomerRow = { customer_no: number; user_id: string }
type Customer = { id: string; userId: string }
type CustomerResult =
  | { kind: 'ready'; customer: Customer }
  | { kind: 'not_configured' | 'invalid_config' | 'not_found' | 'conflict' }

function customer(row: CustomerRow): Customer {
  return { id: String(row.customer_no).padStart(4, '0'), userId: row.user_id }
}

export function validDesignatedEmail(email: string | undefined): boolean {
  return Boolean(email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
}

/** Use only a user ID obtained from a verified Better Auth session. */
export async function getOrCreateCustomer({ db, userId, designatedEmail }: {
  db: D1Database; userId: string; designatedEmail: string | undefined
}): Promise<CustomerResult> {
  const email = designatedEmail?.trim().toLowerCase() || null
  if (email && !validDesignatedEmail(email)) return { kind: 'invalid_config' }
  const user = await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(userId).first<{ email: string }>()
  if (!user) return { kind: 'not_found' }
  const designated = email !== null && user.email.trim().toLowerCase() === email
  const existing = await db.prepare('SELECT customer_no, user_id FROM customers WHERE user_id = ?')
    .bind(userId).first<CustomerRow>()
  if (existing) {
    if (email && (existing.customer_no === 1) !== designated) return { kind: 'conflict' }
    return { kind: 'ready', customer: customer(existing) }
  }

  if (designated) {
    await db.prepare('UPDATE OR IGNORE customers SET user_id = ? WHERE customer_no = 1 AND user_id IS NULL').bind(userId).run()
  } else {
    await db.prepare('INSERT OR IGNORE INTO customers (user_id) VALUES (?)').bind(userId).run()
  }
  const assigned = await db.prepare('SELECT customer_no, user_id FROM customers WHERE user_id = ?')
    .bind(userId).first<CustomerRow>()
  if (!assigned || (assigned.customer_no === 1) !== designated) return { kind: 'conflict' }
  return { kind: 'ready', customer: customer(assigned) }
}

function normalizePersonalPhone(input: string): string | null {
  if (!/^[\d+ ()-]+$/.test(input)) return null
  let number = input.replace(/[ ()-]/g, '')
  if (number.startsWith('0')) number = `+82${number.slice(1)}`
  if (number.startsWith('+820')) number = `+82${number.slice(4)}`
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : null
}

export async function bindPersonalPhone({ db, userId, phoneNumber }: {
  db: D1Database; userId: string; phoneNumber: string
}): Promise<{ kind: 'ready'; phoneNumber: string } | { kind: 'invalid_config' | 'not_found' | 'conflict' }> {
  const number = normalizePersonalPhone(phoneNumber.trim())
  if (!number) return { kind: 'invalid_config' }
  const owner = await db.prepare('SELECT customer_no FROM customers WHERE user_id = ?').bind(userId).first<{ customer_no: number }>()
  if (!owner) return { kind: 'not_found' }
  await db.prepare('INSERT OR IGNORE INTO customer_personal_phones (customer_no, phone_number) VALUES (?, ?)')
    .bind(owner.customer_no, number).run()
  const assigned = await db.prepare('SELECT phone_number FROM customer_personal_phones WHERE customer_no = ?')
    .bind(owner.customer_no).first<{ phone_number: string }>()
  return assigned?.phone_number === number ? { kind: 'ready', phoneNumber: number } : { kind: 'conflict' }
}

export async function getPersonalPhone({ db, userId }: { db: D1Database; userId: string }): Promise<string | null> {
  const row = await db.prepare(`SELECT p.phone_number FROM customer_personal_phones p
    JOIN customers c ON c.customer_no = p.customer_no WHERE c.user_id = ?`).bind(userId).first<{ phone_number: string }>()
  return row?.phone_number ?? null
}

export async function getCustomerByPersonalPhone({ db, phoneNumber }: {
  db: D1Database; phoneNumber: string
}): Promise<CustomerResult> {
  const number = normalizePersonalPhone(phoneNumber.trim())
  if (!number) return { kind: 'invalid_config' }
  const row = await db.prepare(`SELECT c.customer_no, c.user_id FROM customers c
    JOIN customer_personal_phones p ON p.customer_no = c.customer_no WHERE p.phone_number = ? AND c.user_id IS NOT NULL`)
    .bind(number).first<CustomerRow>()
  return row ? { kind: 'ready', customer: customer(row) } : { kind: 'not_found' }
}

export async function getCustomerByNumber({ db, customerNumber }: {
  db: D1Database; customerNumber: string
}): Promise<CustomerResult> {
  if (!/^\d{4,}$/.test(customerNumber)) return { kind: 'invalid_config' }
  const number = Number(customerNumber)
  if (!Number.isSafeInteger(number) || number < 1 || String(number).padStart(4, '0') !== customerNumber) return { kind: 'invalid_config' }
  const row = await db.prepare('SELECT customer_no, user_id FROM customers WHERE customer_no = ? AND user_id IS NOT NULL')
    .bind(number).first<CustomerRow>()
  return row ? { kind: 'ready', customer: customer(row) } : { kind: 'not_found' }
}
