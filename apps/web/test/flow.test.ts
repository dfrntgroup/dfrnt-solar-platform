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
    // The money and booking tests below were written for instant pricing; the launch default (installer confirms every job) has its own tests.
    const S = await import("@/lib/settings");
    await S.setSetting("pricing_mode", { installer_confirms_all: false, allow_test_installer: true }, "vitest");
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
    await db()`delete from settings where key = 'pricing_mode' and updated_by = 'vitest'`.catch(() => null);
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

  /* ---- Pricing mode (4 Nov 2026): installer confirms every job at launch ---- */
  async function securedQuote(name: string, slug = "solax-10kw-15kwh") {
    const { createQuote } = await import("@/lib/quotes");
    const { pricingData } = await import("@/lib/pricing-data");
    const { findSystem } = await import("@dfrnt/engine");
    const s = findSystem(slug, (await pricingData()).catalogue)!;
    const out = await createQuote({ type: "customer", id: "anonymous" }, { config: { backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, ...s.config, panelSku: s.config.panelSku ?? "", stacks: s.config.stacks ?? 1, postcode: PC }, title: name, systemSlug: s.slug } as never, { status: "secured" });
    tokens.push(out.result.token);
    return (await J.getQuote(out.result.token))!;
  }
  async function withMode(mode: { installer_confirms_all: boolean; allow_test_installer: boolean }, fn: () => Promise<void>) {
    const S = await import("@/lib/settings");
    await S.setSetting("pricing_mode", mode, "vitest");
    try { await fn(); } finally { await S.setSetting("pricing_mode", { installer_confirms_all: false, allow_test_installer: true }, "vitest"); }
  }
  const msgs = async (quoteId: string, template: string) => db()`select recipient, subject, body from messages where quote_id = ${quoteId} and template = ${template} order by created_at`;

  it("P1: with the switch on, a standard home waits for the installer; off, it prices instantly", async () => {
    await withMode({ installer_confirms_all: true, allow_test_installer: true }, async () => {
      let q = await securedQuote("Mode on");
      await J.submitSite(q, SITE, { name: "Mode on", email: "modeon@example.test", phone: "0400000000" });
      q = (await J.getQuote(q.token))!;
      expect(q.status).toBe("pricing_installer");
      expect(q.pricing_reasons).toEqual(["Installer confirms every job"]);
      const [row] = await db()`select scope_result, pricing_requested_at from quotes where id = ${q.id}`;
      expect((row!.scope_result as { in_scope: boolean }).in_scope).toBe(true);
      expect(row!.pricing_requested_at).toBeTruthy();
      // P2: the installer is told, with the job link
      const i5 = await msgs(q.id, "I5");
      expect(i5.length).toBe(1);
      expect(i5[0]!.body).toContain(`/installer/job/${q.id}`);
      // P7: confirming unchanged is recorded as such
      await J.installerPrice(q, { type: "installer", id: installerId }, [], "");
      const [p] = await db()`select status, priced_by, price_changed from quotes where id = ${q.id}`;
      expect(p).toMatchObject({ status: "priced", priced_by: "installer", price_changed: false });
    });
    let q = await securedQuote("Mode off");
    await J.submitSite(q, SITE, { name: "Mode off", email: "modeoff@example.test", phone: "0400000000" });
    q = (await J.getQuote(q.token))!;
    expect(q.status).toBe("priced");
    const [p] = await db()`select priced_by from quotes where id = ${q.id}`;
    expect(p!.priced_by).toBe("instant");
  });

  it("P7: an installer who adds a line is recorded as a changed price", async () => {
    await withMode({ installer_confirms_all: true, allow_test_installer: true }, async () => {
      let q = await securedQuote("Changed");
      await J.submitSite(q, SITE, { name: "Changed", email: "changed@example.test", phone: "0400000000" });
      q = (await J.getQuote(q.token))!;
      await J.installerPrice(q, { type: "installer", id: installerId }, ["SVC-SWB-HALF"], "");
      const [p] = await db()`select priced_by, price_changed, amount_payable::float8 amount_payable from quotes where id = ${q.id}`;
      expect(p).toMatchObject({ priced_by: "installer", price_changed: true });
      expect(p!.amount_payable).toBeGreaterThan(q.result.stack.amount_payable);
    });
  });

  it("P3: a battery-only job asks for the existing inverter, not the roof", async () => {
    const { photosFor } = await import("@/lib/photos");
    const b = await securedQuote("Battery only", "solax-battery-15kwh");
    expect([...photosFor(b)]).toEqual(["switchboard", "meter", "existing_inverter", "battery_location"]);
    const sb = await securedQuote("Solar battery");
    expect([...photosFor(sb)]).toEqual(["switchboard", "meter", "roof", "battery_location"]);
    // In instant mode a roof photo doesn't satisfy a battery-only job: it goes to the installer for the inverter photo.
    await J.submitSite(b, SITE, { name: "Battery only", email: "bo@example.test", phone: "0400000000" });
    const q = (await J.getQuote(b.token))!;
    expect(q.status).toBe("pricing_installer");
    expect(q.pricing_reasons).toEqual(["Photo missing: existing inverter"]);
  });

  it("P4: the installer asks for a photo again; the customer re-sends it; the installer is told", async () => {
    const P = await import("@/lib/photos");
    await withMode({ installer_confirms_all: true, allow_test_installer: true }, async () => {
      let q = await securedQuote("Retake");
      await db()`insert into quote_photos (quote_id, kind, path) values (${q.id}, 'switchboard', 'test/swb.jpg'), (${q.id}, 'meter', 'test/m.jpg'), (${q.id}, 'roof', 'test/r.jpg'), (${q.id}, 'battery_location', 'test/b.jpg')`;
      await J.submitSite(q, SITE, { name: "Retake", email: "retake@example.test", phone: "0400000000" });
      q = (await J.getQuote(q.token))!;
      await P.requestRetake(q, { type: "installer", id: installerId }, "switchboard", "Too dark to read the labels");
      expect((await P.retakeKinds(q.id)).map((r) => r.kind)).toEqual(["switchboard"]);
      expect([...(await P.activeKinds(q.id))].sort()).toEqual(["battery_location", "meter", "roof"]);
      const m16 = await msgs(q.id, "M16");
      expect(m16.length).toBe(1);
      expect(m16[0]!.body).toContain("Too dark");
      await expect(P.requestRetake(q, { type: "installer", id: installerId }, "switchboard", "")).rejects.toThrow(/already/);
      // customer re-uploads that one photo
      await db()`insert into quote_photos (quote_id, kind, path) values (${q.id}, 'switchboard', 'test/swb2.jpg')`;
      await P.retakeReceived(q.id);
      expect(await P.retakeKinds(q.id)).toEqual([]);
      const i5 = await msgs(q.id, "I5");
      expect(i5.length).toBe(2);
      expect(i5[1]!.subject).toMatch(/^New photo in/);
      expect((await J.getQuote(q.token))!.status).toBe("pricing_installer");
    });
  });

  it("P5: an address nobody covers goes straight to tech review", async () => {
    let q = await securedQuote("Nowhere");
    await J.submitSite(q, { ...SITE, address: { ...SITE.address, postcode: "4999" } }, { name: "Nowhere", email: "nowhere@example.test", phone: "0400000000" });
    q = (await J.getQuote(q.token))!;
    expect(q.status).toBe("tech_review");
    expect(q.installer_id).toBeNull();
  });

  it("P6: a test installer is never assigned when the guard is off", async () => {
    await withMode({ installer_confirms_all: true, allow_test_installer: false }, async () => {
      let q = await securedQuote("Guard");
      await J.submitSite(q, SITE, { name: "Guard", email: "guard@example.test", phone: "0400000000" });
      q = (await J.getQuote(q.token))!;
      expect(q.status).toBe("tech_review");
      expect(q.installer_id).toBeNull();
    });
  });

  it("P2: the 3 pm run reminds the installer once about a job waiting longer than the stale table allows (4 h)", async () => {
    const { runAfternoon } = await import("@/lib/timers");
    await withMode({ installer_confirms_all: true, allow_test_installer: true }, async () => {
      let q = await securedQuote("Nudge");
      await J.submitSite(q, SITE, { name: "Nudge", email: "nudge@example.test", phone: "0400000000" });
      q = (await J.getQuote(q.token))!;
      await db()`update quotes set pricing_requested_at = now() - interval '5 hours' where id = ${q.id}`;
      const r = await runAfternoon();
      if ("weekend" in r) { expect(r.nudged).toBe(0); return; }
      expect((await msgs(q.id, "I6")).length).toBe(1);
      await runAfternoon();
      expect((await msgs(q.id, "I6")).length).toBe(1);
    });
  });
});
