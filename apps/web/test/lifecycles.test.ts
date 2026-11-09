// S5 (9 Nov 2026): the other lifecycles go through moveRow(). Needs TEST_POSTGRES_URL; skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL_ = process.env.TEST_POSTGRES_URL;
if (URL_) { process.env.POSTGRES_URL = URL_; process.env.DB_SSL ??= "disable"; }
const run = URL_ ? describe : describe.skip;
const STAFF = { type: "staff" as const, id: "life-staff" };

run("other lifecycles (real database)", () => {
  let db: typeof import("@dfrnt/db").db;
  let L: typeof import("@/lib/lifecycle");
  const quoteIds: string[] = [];
  let installerId = "";

  beforeAll(async () => {
    ({ db } = await import("@dfrnt/db"));
    L = await import("@/lib/lifecycle");
    const [i] = await db()`insert into installers (business_name, contact_name, email, postcode_ranges, active, is_test, scope, capacity) values ('Life Installer', 'Life', ${`life-${Date.now()}@example.test`}, ${`{"[4699,4700)"}`}::int4range[], true, true, '{"version":1}', '{"jobsPerDay":1}') returning id`;
    installerId = i!.id as string;
  });
  afterAll(async () => {
    for (const t of ["pay_ledger", "payments", "stc_receivables", "purchase_orders", "memberships", "date_offers"]) await db().unsafe(`delete from ${t} where quote_id = any($1::uuid[])`, [quoteIds]).catch(() => null);
    await db()`delete from quotes where id = any(${quoteIds}::uuid[])`.catch(() => null);
    await db()`delete from installer_applications where email like 'life-%'`.catch(() => null);
    await db()`delete from tickets where email like 'life-%'`.catch(() => null);
    await db()`delete from credits where code like 'LIFE%'`.catch(() => null);
    await db()`delete from installers where id = ${installerId}`.catch(() => null);
    await db().end?.();
  });

  async function quote() {
    const [q] = await db()`insert into quotes (token, status, postcode, input, result, versions, amount_payable, price_inc_gst, stcs, checkout_allowed, lock_until, customer_email, created_by_type, created_by_id)
      values (${Array.from({ length: 36 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}, 'booked', '4699', '{}', '{"stack":{"amount_payable":1}}', '{}', 1, 1, 0, true, current_date + 14, 'life-q@example.test', 'system', 'vitest') returning id`;
    quoteIds.push(q!.id as string); return q!.id as string;
  }

  it("purchase orders: steps in order, delivered can't be cancelled, events carry from/to", async () => {
    const qid = await quote();
    const [po] = await db()`insert into purchase_orders (quote_id, supplier, lines, total_ex) values (${qid}, 'Test', '[]', 1) returning id`;
    const id = po!.id as string;
    await expect(L.moveRow("purchase_orders", id, "sent", STAFF)).rejects.toThrow(/Not allowed: draft/);
    expect((await L.moveRow("purchase_orders", id, "approved", STAFF)).changed).toBe(true);
    await L.moveRow("purchase_orders", id, "sent", STAFF); await L.moveRow("purchase_orders", id, "delivered", STAFF);
    await expect(L.moveRow("purchase_orders", id, "cancelled", STAFF)).rejects.toThrow(/Not allowed: delivered/);
    const [e] = await db()`select payload from events where entity = 'purchase_order' and entity_id = ${id} and type = 'purchase_order.sent'`;
    expect(e!.payload).toMatchObject({ from: "approved", to: "sent" });
  });

  it("STC receivables: no skipping, paid is final; the Ops stcStep uses the same door", async () => {
    const qid = await quote();
    const [r] = await db()`insert into stc_receivables (quote_id, solar_stcs, battery_stcs, expected_value) values (${qid}, 1, 1, 10) returning id`;
    const { stcStep } = await import("@/lib/ops");
    await expect(stcStep(r!.id as string, "paid", STAFF)).rejects.toThrow(/Not allowed: expected/);
    await stcStep(r!.id as string, "lodged", STAFF, undefined, "FB1");
    const [row] = await db()`select status, formbay_ref from stc_receivables where id = ${r!.id}`;
    expect(row).toMatchObject({ status: "lodged", formbay_ref: "FB1" });
  });

  it("memberships: cancelled is final, lapsed can be reactivated", async () => {
    const qid = await quote();
    const [m] = await db()`insert into memberships (quote_id, price, reference, status) values (${qid}, 99, 'SP1', 'lapsed') returning id`;
    expect((await L.moveRow("memberships", m!.id as string, "active", STAFF)).changed).toBe(true);
    await L.moveRow("memberships", m!.id as string, "cancelled", STAFF);
    await expect(L.moveRow("memberships", m!.id as string, "active", STAFF)).rejects.toThrow(/Not allowed: cancelled/);
    expect((await L.moveRow("memberships", m!.id as string, "cancelled", STAFF, { idempotent: true })).changed).toBe(false);
  });

  it("installer applications can be declined; tickets close and reopen; a stale row is tolerated when asked", async () => {
    const [a] = await db()`insert into installer_applications (business_name, contact_name, email, phone, abn, licence_no, postcodes) values ('Life Co', 'L', 'life-app@example.test', '0', '1', '2', '4699') returning id`;
    expect((await L.moveRow("installer_applications", a!.id as string, "declined", STAFF, {}, "new")).changed).toBe(true);
    expect((await L.moveRow("installer_applications", a!.id as string, "accepted", STAFF, { tolerate: true }, "new")).changed).toBe(false);
    const [t] = await db()`insert into tickets (kind, subject, body, email) values ('question', 'q', 'b', 'life-t@example.test') returning id`;
    await L.moveRow("tickets", t!.id as string, "closed", STAFF); await L.moveRow("tickets", t!.id as string, "open", STAFF);
    await expect(L.moveRow("tickets", t!.id as string, "nope", STAFF)).rejects.toThrow(/unknown state/);
  });

  it("moveRows sweeps only rows in the from-state", async () => {
    await db()`insert into credits (code, amount_inc, reason, expires_on) values ('LIFE1', 10, 't', current_date - 1), ('LIFE2', 10, 't', current_date + 1)`;
    const n = await L.moveRows("credits", "issued", "expired", STAFF, "code like 'LIFE%' and expires_on < current_date", []);
    expect(n).toBe(1);
    const rows = await db()`select code, status from credits where code like 'LIFE%' order by code`;
    expect(rows.map((r) => r.status)).toEqual(["expired", "issued"]);
  });
});
