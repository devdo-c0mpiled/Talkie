import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TALKIE_TEST_URL || "http://127.0.0.1:3000";
const url = new URL(base);
assert.ok(
  url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
  "local server required",
);
async function signup() {
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: base,
      "cf-connecting-ip": `2001:db8:${randomUUID().slice(0, 4)}::1`,
    },
    body: JSON.stringify({
      name: "Payment test",
      email: `payment-${randomUUID()}@example.com`,
      password: randomUUID(),
    }),
  });
  assert.equal(response.status, 200);
  return response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
}
const call = (path, cookie, body, origin = base) =>
  fetch(`${base}/api/payments/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      cookie: cookie || "",
      origin,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
assert.equal((await call("config")).status, 401);
const alice = await signup(),
  bob = await signup();
let response = await call("config", alice);
assert.equal(response.status, 200);
const config = await response.json();
assert.ok(config.clientKey.startsWith("test_ck_"));
assert.equal(config.amount, 1000);
assert.ok(!("secretKey" in config));
response = await call("orders", alice, { amount: 1 });
assert.equal(response.status, 200);
const order = await response.json();
assert.equal(order.amount, 1000);
assert.equal(
  (await call("orders", alice, {}, "https://invalid.example")).status,
  403,
);
assert.equal(
  (
    await call("confirm", alice, {
      ...order,
      amount: 1,
      paymentKey: "not-sent-to-toss",
    })
  ).status,
  400,
);
assert.equal(
  (await call("confirm", bob, { ...order, paymentKey: "not-sent-to-toss" }))
    .status,
  404,
);
response = await fetch(`${base}/checkout`);
assert.equal(response.status, 200);
assert.ok((await response.text()).includes("테스트 결제"));
console.log("Payment HTTP checks passed (no Toss network requests)");
