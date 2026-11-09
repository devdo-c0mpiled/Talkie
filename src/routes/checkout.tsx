import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
export const Route = createFileRoute("/checkout")({ component: Checkout });
type Config = { clientKey: string; amount: number; orderName: string };
type Order = { orderId: string; amount: number; orderName: string };
type Result = { orderId: string; amount: number; status: string };
async function api<T>(path: string, body?: unknown) {
  const response = await fetch(
    `/api/payments/${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "결제 요청에 실패했습니다.");
  return data;
}
function Checkout() {
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState<Record<string, unknown>>();
  const started = useRef(false);
  async function confirm(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      setResult(await api<Result>("confirm", body));
      setPending(undefined);
      window.history.replaceState(null, "", "/checkout");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("result") === "success") {
      const body = {
        paymentKey: params.get("paymentKey"),
        orderId: params.get("orderId"),
        amount: Number(params.get("amount")),
      };
      setPending(body);
      void confirm(body);
    } else if (params.get("result") === "fail")
      setError("결제가 취소되었거나 실패했습니다.");
    void api<Config>("config")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  async function pay() {
    if (!config || busy) return;
    setBusy(true);
    setError("");
    try {
      const order = await api<Order>("orders", {});
      const { loadTossPayments, ANONYMOUS } =
        await import("@tosspayments/tosspayments-sdk");
      const toss = await loadTossPayments(config.clientKey);
      await toss
        .payment({ customerKey: ANONYMOUS })
        .requestPayment({
          method: "CARD",
          amount: { currency: "KRW", value: order.amount },
          orderId: order.orderId,
          orderName: order.orderName,
          successUrl: `${window.location.origin}/checkout?result=success`,
          failUrl: `${window.location.origin}/checkout?result=fail`,
        });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section style={{ maxWidth: 560, margin: "64px auto", padding: 24 }}>
      <h1>테스트 결제</h1>
      <p>토스페이먼츠 테스트 결제 — 실제 금액은 청구되지 않습니다.</p>
      {error && <p role="alert">{error}</p>}
      {result ? (
        <div role="status">
          <h2>테스트 결제 완료</h2>
          <p>{result.amount.toLocaleString()}원</p>
          <p>주문번호: {result.orderId}</p>
        </div>
      ) : (
        <>
          <p>결제 금액: 1,000원</p>
          {pending ? (
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() => void confirm(pending)}
            >
              {busy ? "승인 확인 중…" : "승인 다시 확인"}
            </button>
          ) : (
            <button
              className="button button-dark"
              disabled={!config || busy}
              onClick={() => void pay()}
            >
              {busy ? "결제창을 여는 중…" : "테스트 결제하기"}
            </button>
          )}
        </>
      )}
      <p>
        <a href="/login">로그인</a>
      </p>
    </section>
  );
}
