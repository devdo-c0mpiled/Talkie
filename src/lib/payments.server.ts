import { assertTestKey, createTossClient } from "./toss.server.ts";
import type {
  TossClient,
  TossConfirmRequest,
  TossConfirmResult,
} from "./toss.server.ts";

type Payment = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  payment_key: string | null;
  created_at: number;
};
export class PaymentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function paymentConfig(
  env: Pick<Cloudflare.Env, "TOSS_CLIENT_KEY" | "TOSS_SECRET_KEY">,
) {
  try {
    assertTestKey(env.TOSS_CLIENT_KEY ?? "", "client");
    assertTestKey(env.TOSS_SECRET_KEY ?? "", "secret");
  } catch {
    throw new PaymentError(
      "토스 테스트 API 개별 연동 키를 설정해 주세요.",
      503,
    );
  }
  return {
    clientKey: env.TOSS_CLIENT_KEY!,
    amount: 1000,
    orderName: "Talkie 테스트 결제",
  };
}
export async function createPayment(db: D1Database, userId: string) {
  const id = `talkie_${crypto.randomUUID()}`;
  await db
    .prepare(
      "INSERT INTO test_payments (id, user_id, amount, created_at) VALUES (?, ?, 1000, ?)",
    )
    .bind(id, userId, Date.now())
    .run();
  return { orderId: id, amount: 1000, orderName: "Talkie 테스트 결제" };
}
export async function confirmPayment(
  db: D1Database,
  userId: string,
  req: TossConfirmRequest,
  toss: TossClient,
) {
  if (
    !req ||
    typeof req.orderId !== "string" ||
    typeof req.paymentKey !== "string" ||
    !req.paymentKey ||
    req.paymentKey.length > 200 ||
    !Number.isSafeInteger(req.amount)
  )
    throw new PaymentError("잘못된 결제 요청입니다.");
  const row = await db
    .prepare("SELECT * FROM test_payments WHERE id = ? AND user_id = ?")
    .bind(req.orderId, userId)
    .first<Payment>();
  if (!row) throw new PaymentError("결제 주문을 찾을 수 없습니다.", 404);
  if (row.amount !== req.amount)
    throw new PaymentError("결제 금액이 일치하지 않습니다.");
  if (row.payment_key && row.payment_key !== req.paymentKey)
    throw new PaymentError("이미 다른 결제 요청이 진행 중입니다.", 409);
  if (row.status === "PAID")
    return { orderId: row.id, amount: row.amount, status: "PAID" };
  if (row.status === "CREATED" && Date.now() - row.created_at > 30 * 60_000)
    throw new PaymentError("결제 주문이 만료되었습니다.", 410);
  const claim = await db
    .prepare(
      "UPDATE test_payments SET status = 'CONFIRMING', payment_key = ? WHERE id = ? AND status = 'CREATED' AND payment_key IS NULL",
    )
    .bind(req.paymentKey, row.id)
    .run();
  const matches = (r: TossConfirmResult) =>
    r.ok &&
    r.status === "DONE" &&
    r.orderId === row.id &&
    r.totalAmount === row.amount &&
    r.paymentKey === req.paymentKey;
  let result: TossConfirmResult;
  if (claim.meta.changes === 0) {
    const current = await db
      .prepare("SELECT * FROM test_payments WHERE id = ?")
      .bind(row.id)
      .first<Payment>();
    if (current?.payment_key !== req.paymentKey)
      throw new PaymentError("이미 다른 결제 요청이 진행 중입니다.", 409);
    result = await toss.getByOrderId(row.id);
    if (!matches(result)) {
      if (!result.ok && result.httpStatus !== 404)
        throw new PaymentError(
          "결제 결과를 확인하지 못했습니다. 다시 확인해 주세요.",
          502,
        );
      result = await toss.confirm(req);
    }
  } else result = await toss.confirm(req);
  if (!matches(result)) {
    // An approval response may have been lost; only a verified lookup can resolve it.
    result = await toss.getByOrderId(row.id);
  }
  if (!matches(result))
    throw new PaymentError(
      "결제 승인을 확인하지 못했습니다. 다시 확인해 주세요.",
      502,
    );
  await db
    .prepare(
      "UPDATE test_payments SET status = 'PAID', confirmed_at = ? WHERE id = ? AND payment_key = ?",
    )
    .bind(Date.now(), row.id, req.paymentKey)
    .run();
  return { orderId: row.id, amount: row.amount, status: "PAID" };
}
export async function handlePayments(
  request: Request,
  env: Cloudflare.Env,
  userId: string | undefined,
) {
  const json = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (!userId) return json({ error: "로그인이 필요합니다." }, 401);
  const url = new URL(request.url);
  if (request.method === "POST" && request.headers.get("origin") !== url.origin)
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  try {
    const config = paymentConfig(env);
    if (request.method === "GET" && url.pathname === "/api/payments/config")
      return json(config);
    if (request.method === "POST" && url.pathname === "/api/payments/orders")
      return json(await createPayment(env.DB, userId));
    if (request.method === "POST" && url.pathname === "/api/payments/confirm") {
      const reader = request.body?.getReader();
      if (!reader) throw new PaymentError("요청 내용이 없습니다.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) {
          await reader.cancel();
          throw new PaymentError("요청이 너무 큽니다.", 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let body: TossConfirmRequest;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new PaymentError("잘못된 요청입니다.");
      }
      return json(
        await confirmPayment(
          env.DB,
          userId,
          body,
          createTossClient(env.TOSS_SECRET_KEY!),
        ),
      );
    }
    return json({ error: "존재하지 않는 결제 API입니다." }, 404);
  } catch (e) {
    return json(
      {
        error:
          e instanceof PaymentError
            ? e.message
            : "결제 처리 중 오류가 발생했습니다.",
      },
      e instanceof PaymentError ? e.status : 500,
    );
  }
}
