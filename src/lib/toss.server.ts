export interface TossConfirmRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export type TossConfirmResult =
  | {
      ok: true;
      paymentKey: string;
      orderId: string;
      totalAmount: number;
      status: string;
      approvedAt: string | null;
      method: string | null;
    }
  | { ok: false; code: string; message: string; httpStatus: number };

export interface TossClient {
  confirm(req: TossConfirmRequest): Promise<TossConfirmResult>;
  /** 결제 조회 (대사용): GET /v1/payments/orders/{orderId} */
  getByOrderId(orderId: string): Promise<TossConfirmResult>;
}

const TOSS_API = "https://api.tosspayments.com/v1/payments";

export function assertTestKey(key: string, kind: "client" | "secret"): void {
  if (!key || !key.startsWith(kind === "client" ? "test_ck_" : "test_sk_")) {
    throw new Error(
      `TOSS_${kind.toUpperCase()}_KEY must be a test key (test_...). Live keys are not allowed in this MVP.`,
    );
  }
}

export function createTossClient(
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): TossClient {
  assertTestKey(secretKey, "secret");
  const auth = `Basic ${btoa(`${secretKey}:`)}`;
  async function call(
    path: string,
    init: RequestInit,
  ): Promise<TossConfirmResult> {
    let res: Response;
    try {
      res = await fetchImpl(`${TOSS_API}${path}`, {
        ...init,
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: auth, ...init.headers },
      });
    } catch (e) {
      return {
        ok: false,
        code: "NETWORK_ERROR",
        message: String(e),
        httpStatus: 0,
      };
    }
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok) {
      return {
        ok: false,
        code: String(body.code ?? "UNKNOWN"),
        message: String(body.message ?? res.statusText),
        httpStatus: res.status,
      };
    }
    return {
      ok: true,
      paymentKey: String(body.paymentKey),
      orderId: String(body.orderId),
      totalAmount: Number(body.totalAmount),
      status: String(body.status),
      approvedAt: (body.approvedAt as string | undefined) ?? null,
      method: (body.method as string | undefined) ?? null,
    };
  }
  return {
    confirm: (req) =>
      call("/confirm", {
        method: "POST",
        // 같은 paymentKey 재시도는 토스 측에서도 한 번만 처리되도록 한다.
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": req.paymentKey,
        },
        body: JSON.stringify(req),
      }),
    getByOrderId: (orderId) =>
      call(`/orders/${encodeURIComponent(orderId)}`, { method: "GET" }),
  };
}
