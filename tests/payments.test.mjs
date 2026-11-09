import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  createPayment,
  confirmPayment,
  handlePayments,
  paymentConfig,
} from "../src/lib/payments.server.ts";
import { createTossClient } from "../src/lib/toss.server.ts";
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    readFileSync(
      new URL("../migrations/0003_test_payments.sql", import.meta.url),
      "utf8",
    ),
  );
  const db = {
    prepare(query) {
      return {
        bind(...args) {
          return {
            async run() {
              const r = sql.prepare(query).run(...args);
              return { meta: { changes: Number(r.changes) } };
            },
            async first() {
              return sql.prepare(query).get(...args) ?? null;
            },
          };
        },
      };
    },
  };
  const env = {
    DB: db,
    TOSS_CLIENT_KEY: "test_ck_testing",
    TOSS_SECRET_KEY: "test_sk_testing",
  };
  let calls = 0;
  let saved;
  const toss = {
    async confirm(req) {
      calls++;
      saved = { ok: true, ...req, totalAmount: req.amount, status: "DONE" };
      return saved;
    },
    async getByOrderId() {
      return saved ?? { ok: false, httpStatus: 404 };
    },
  };
  return { db, sql, env, toss, calls: () => calls };
}
async function order(f) {
  return { ...(await createPayment(f.db, "alice")), paymentKey: "pk_test" };
}
test("rejects live keys and wrong key types", () => {
  for (const keys of [
    { TOSS_CLIENT_KEY: "live_ck_x", TOSS_SECRET_KEY: "test_sk_x" },
    { TOSS_CLIENT_KEY: "test_ck_x", TOSS_SECRET_KEY: "live_sk_x" },
    { TOSS_CLIENT_KEY: "test_gck_x", TOSS_SECRET_KEY: "test_sk_x" },
  ])
    assert.throws(() => paymentConfig(keys));
  assert.throws(() => createTossClient("live_sk_x"));
});
test("server fixes amount and enforces user ownership before contacting Toss", async () => {
  const f = fixture(),
    req = await order(f);
  assert.equal(req.amount, 1000);
  await assert.rejects(confirmPayment(f.db, "bob", req, f.toss), {
    status: 404,
  });
  await assert.rejects(
    confirmPayment(f.db, "alice", { ...req, amount: 1 }, f.toss),
    { status: 400 },
  );
  assert.equal(f.calls(), 0);
});
test("approval is persisted and repeated confirmation returns without charging again", async () => {
  const f = fixture(),
    req = await order(f);
  assert.equal(
    (await confirmPayment(f.db, "alice", req, f.toss)).status,
    "PAID",
  );
  await confirmPayment(f.db, "alice", req, f.toss);
  assert.equal(f.calls(), 1);
  await assert.rejects(
    confirmPayment(f.db, "alice", { ...req, paymentKey: "other" }, f.toss),
    { status: 409 },
  );
});
test("expired orders cannot be approved", async () => {
  const f = fixture(),
    req = await order(f);
  f.sql.exec("UPDATE test_payments SET created_at = 0");
  await assert.rejects(confirmPayment(f.db, "alice", req, f.toss), {
    status: 410,
  });
  assert.equal(f.calls(), 0);
});
test("lost approval response is reconciled by matching DONE lookup", async () => {
  const f = fixture(),
    req = await order(f);
  const toss = {
    async confirm() {
      return { ok: false, httpStatus: 0 };
    },
    async getByOrderId() {
      return { ok: true, ...req, totalAmount: 1000, status: "DONE" };
    },
  };
  assert.equal((await confirmPayment(f.db, "alice", req, toss)).status, "PAID");
});
test("mismatched payment details and non-DONE statuses never mark paid", async () => {
  for (const patch of [
    { status: "IN_PROGRESS" },
    { totalAmount: 1 },
    { paymentKey: "wrong" },
    { orderId: "wrong" },
  ]) {
    const f = fixture(),
      req = await order(f);
    const bad = {
      ok: true,
      ...req,
      totalAmount: 1000,
      status: "DONE",
      ...patch,
    };
    await assert.rejects(
      confirmPayment(f.db, "alice", req, {
        async confirm() {
          return bad;
        },
        async getByOrderId() {
          return bad;
        },
      }),
      { status: 502 },
    );
    assert.equal(
      f.sql.prepare("SELECT status FROM test_payments").get().status,
      "CONFIRMING",
    );
  }
});
test("network failure remains pending and retry reconciles without second confirm", async () => {
  const f = fixture(),
    req = await order(f);
  await assert.rejects(
    confirmPayment(f.db, "alice", req, {
      async confirm() {
        return { ok: false, httpStatus: 0 };
      },
      async getByOrderId() {
        return { ok: false, httpStatus: 503 };
      },
    }),
    { status: 502 },
  );
  let confirms = 0;
  const toss = {
    async confirm() {
      confirms++;
      throw Error("must not confirm");
    },
    async getByOrderId() {
      return { ok: true, ...req, totalAmount: 1000, status: "DONE" };
    },
  };
  assert.equal((await confirmPayment(f.db, "alice", req, toss)).status, "PAID");
  assert.equal(confirms, 0);
});
test("concurrent requests cannot attach different payment keys", async () => {
  const f = fixture(),
    req = await order(f);
  const results = await Promise.allSettled([
    confirmPayment(f.db, "alice", req, f.toss),
    confirmPayment(f.db, "alice", { ...req, paymentKey: "other" }, f.toss),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.calls(), 1);
});
test("API rejects unauthenticated, cross-origin, malformed and oversized requests", async () => {
  const f = fixture();
  const make = (body, origin = "http://localhost") =>
    new Request("http://localhost/api/payments/confirm", {
      method: "POST",
      headers: { origin },
      body,
    });
  assert.equal(
    (await handlePayments(make("{}"), f.env, undefined)).status,
    401,
  );
  assert.equal(
    (await handlePayments(make("{}", "https://bad.test"), f.env, "alice"))
      .status,
    403,
  );
  assert.equal((await handlePayments(make("{"), f.env, "alice")).status, 400);
  assert.equal(
    (await handlePayments(make("x".repeat(4097)), f.env, "alice")).status,
    413,
  );
  const config = await (
    await handlePayments(
      new Request("http://localhost/api/payments/config"),
      f.env,
      "alice",
    )
  ).json();
  assert.equal(config.clientKey, f.env.TOSS_CLIENT_KEY);
  assert.ok(!JSON.stringify(config).includes(f.env.TOSS_SECRET_KEY));
});
test("provider sends test credentials and stable idempotency key, never accepts live keys", async () => {
  let sent;
  const toss = createTossClient("test_sk_testing", async (url, init) => {
    sent = { url, init };
    return Response.json({
      paymentKey: "pk",
      orderId: "order",
      totalAmount: 1000,
      status: "DONE",
    });
  });
  await toss.confirm({ paymentKey: "pk", orderId: "order", amount: 1000 });
  assert.equal(sent.url, "https://api.tosspayments.com/v1/payments/confirm");
  assert.equal(sent.init.headers["Idempotency-Key"], "pk");
  assert.equal(
    sent.init.headers.Authorization,
    `Basic ${btoa("test_sk_testing:")}`,
  );
});
