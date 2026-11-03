// The money and job paths end to end against a real Postgres (review fix, 3 Nov 2026).
// Needs TEST_POSTGRES_URL pointing at a throwaway database with the migrations applied; skipped otherwise.
// Everything it creates is tied to its own test installer (postcode 4610) and removed afterwards.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL_ = process.env.TEST_POSTGRES_URL;
if (URL_) { process.env.POSTGRES_URL = URL_; process.env.DB_SSL ??= "disable"; }
const run = URL_ ? describe : describe.skip;

const PC = "4610";
const STAFF = { type: "staff" as const, id: "test-staff" };
const SITE = { address: { line1: "1 Test Street", suburb: "Kingaroy", state: "QLD", postcode: PC }, phases: 1 as const, roofType: "tin" as const, storeys: 1,
  batteryLocation: "garage" as const, switchboard: "ok" as const, nmi: "QB00000000",
  photos: { switchboard: true, meter: true, roof: true, battery_location: true } };

run("job lifecycle (real database)", () => {
  let db: typeof import("@dfrnt/db").db;
  let J: typeof import("@/lib/jobs");
  let installerId = "", crewId = "";
  const tokens: string[] = [];

  async function newPaidJob(name: string) {
    const { createQuote } = await import("@/lib/quotes");
    const { pricingData } = await import("@/lib/pricing-data");
    const { findSystem } = await import("@dfrnt/engine");
    const s = findSystem("solax-10kw-15kwh", (await pricingData()).catalogue)!;
    const out = await createQuote({ type: "customer", id: "anonymous" }, { config: { backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, ...s.config, postcode: PC }, systemSlug: s.slug } as never, { status: "secured" });
    const token = out.result.token; tokens.push(token);
    let q = (await J.getQuote(token))!;
    await J.submitSite(q, SITE, { name, email: `${name.toLowerCase()}@example.test`, phone: "0400000000" });
    q = (await J.getQuote(token))!; expect(q.status).toBe("priced");
    await J.sign(q, name); q = (await J.getQuote(token))!;
    await J.chooseBank(q); q = (await J.getQuote(token))!; expect(q.status).toBe("payment_pending");
    return q;
  }

  beforeAll(async () => {
    ({ db } = await import("@dfrnt/db"));
    J = await import("@/lib/jobs");
    const [i] = await db()`insert into installers (business_name, contact_name, email, postcode_ranges, active, is_test, scope, capacity)
      values ('Vitest Installer', 'Vitest', ${`vitest-${Date.now()}@example.test`}, ${`{"[4610,4611)"}`}::int4range[], true, true,
        ${db().json({ version: 1, phases: [1, 3], roofTypes: ["tin", "tile", "kliplok"], maxStoreys: 2, maxCableRunM: 10, switchboardOk: true, batteryLocations: ["garage", "outdoor_wall", "other"] })},
        ${db().json({ leadDays: 0, blackouts: [], jobsPerDay: 1, workingDays: [1, 2, 3, 4, 5, 6, 0] })}) returning id`;
    installerId = i!.id as string;
    const [c] = await db()`insert into installer_crews (installer_id, name, source, status) values (${installerId}, 'Vitest crew', 'test', 'connected') returning id`;
    crewId = c!.id as string;
  });

  afterAll(async () => {
    if (!installerId) return;
    const ids = (await db()`select id from quotes where installer_id = ${installerId} or token = any(${tokens})`).map((r) => r.id as string);
    for (const t of ["pay_ledger", "payments", "variations", "messages", "date_offers", "quote_addons", "stc_receivables", "tickets", "codes", "payouts", "job_messages", "conversions"]) {
      await db().unsafe(`delete from ${t} where quote_id = any($1::uuid[])`, [ids]).catch(() => null);
    }
    await db()`update quotes set installer_id = null, crew_id = null where id = any(${ids}::uuid[])`;
    await db()`delete from quotes where id = any(${ids}::uuid[])`.catch(() => null);
    await db()`delete from installer_crews where installer_id = ${installerId}`.catch(() => null);
    await db()`delete from installers where id = ${installerId}`.catch(() => null);
    await db().end?.();
  });

  it("a custom build (no catalogue system) goes through pricing, signing and payment", async () => {
    const { createQuote } = await import("@/lib/quotes");
    const { pricingData } = await import("@/lib/pricing-data");
    const { rebateWindow } = await import("@dfrnt/engine");
    const B = await import("@/lib/builder");
    const data = await pricingData();
    const site = { postcode: PC, asOf: new Date().toISOString().slice(0, 10) };
    const rd = rebateWindow(site.asOf, data.rebates).rebate_date;
    const o = B.buildOptions({ phases: 1, family: "goodwe_esa_1p", inverterSku: "INV-GW-EHA-10K", modules: 3, panelSku: "PNL-RISEN-475", panels: 22, backup: true }, PC, rd, data, site);
    expect(o.price?.ok).toBe(true);
    const out = await createQuote({ type: "customer", id: "anonymous" }, { config: B.buildConfig(o.choice, PC, rd, data.rules), title: o.price!.title } as never, { status: "secured" });
    tokens.push(out.result.token);
    expect(out.result.amount_payable).toBeCloseTo(o.price!.you_pay, 2);
    let q = (await J.getQuote(out.result.token))!;
    expect(q.title).toMatch(/^Custom · GoodWe 10 kW/);
    await J.submitSite(q, SITE, { name: "Custom", email: "custom@example.test", phone: "0400000000" });
    q = (await J.getQuote(out.result.token))!; expect(q.status).toBe("priced");
    await J.sign(q, "Custom"); q = (await J.getQuote(out.result.token))!;
    await J.chooseBank(q); q = (await J.getQuote(out.result.token))!; expect(q.status).toBe("payment_pending");
  });

  it("re-pricing with the installer's extra km and metres reproduces the frozen price exactly", async () => {
    const q = await newPaidJob("Roundtrip");
    const p1 = await J.reprice(q, { extraLabour: [{ code: "SVC-TRAVEL", qty: 60 }, { code: "SVC-CABLE-1P", qty: 15 }] });
    const withSnap = { ...q, snapshot: p1 } as typeof q;
    const p2 = await J.reprice(withSnap, { extraLabour: J.extraLabourOf(withSnap) });
    expect(p2.stack.amount_payable).toBe(p1.stack.amount_payable);
    expect(p2.stack.installer_pay_ex_gst).toBe(p1.stack.installer_pay_ex_gst);
  });

  it("Change stage can't skip payment; staff can mark a bank payment paid; invoice number issued", async () => {
    const q = await newPaidJob("Stage");
    await expect(J.advance(q, "awaiting_date", STAFF, "test")).rejects.toThrow(/moves money/);
    await J.markPaid(q, STAFF);
    const after = (await J.getQuote(q.token))!;
    expect(after.status).toBe("awaiting_date");
    expect(after.invoice_number).toMatch(/^INV-/);
  });

  it("staff can't hand-mark a card or PayTo job as paid", async () => {
    const q = await newPaidJob("Card");
    await db()`update quotes set payment_method = 'card' where id = ${q.id}`;
    await expect(J.markPaid((await J.getQuote(q.token))!, STAFF)).rejects.toThrow(/Stripe/);
  });

  it("two customers tapping the same day at once: exactly one gets it, and one installer ledger row each", async () => {
    const { bookDay, daysFor } = await import("@/lib/schedule");
    const a = await newPaidJob("Alpha"), b = await newPaidJob("Bravo");
    await J.markPaid(a, STAFF); await J.markPaid(b, STAFF);
    const qa = (await J.getQuote(a.token))!, qb = (await J.getQuote(b.token))!;
    const day = (await daysFor(qa, { fresh: true })).slots.find((s) => s.crewId === crewId)!;
    expect(day).toBeTruthy();
    const r = await Promise.allSettled([bookDay(qa, day.date, STAFF, "customer"), bookDay(qb, day.date, STAFF, "customer")]);
    expect(r.filter((x) => x.status === "fulfilled").length).toBe(1);
    expect(r.filter((x) => x.status === "rejected").length).toBe(1);
    const winner = r[0]!.status === "fulfilled" ? qa : qb;
    const [n] = await db()`select count(*)::int n from pay_ledger where quote_id = ${winner.id} and variation_id is null`;
    expect(n!.n).toBe(1);
  });

  it("cancelling records the stage it was in, releases nothing twice, and the refund rule follows it", async () => {
    const q = await newPaidJob("Cancel");
    await J.markPaid(q, STAFF);
    await J.cancel((await J.getQuote(q.token))!, STAFF, "test");
    const c = (await J.getQuote(q.token))!;
    expect(c.status).toBe("cancelled");
    expect(c.status_before_cancel).toBe("awaiting_date");
    const { recordRefund } = await import("@/lib/ops");
    await recordRefund(q.id, 100, "test refund", STAFF);
    const [p] = await db()`select refund_rule from payments where quote_id = ${q.id} and kind = 'refund'`;
    expect(p!.refund_rule).toBe("full_cooling_off");
  });
});
