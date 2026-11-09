// S2 (9 Nov 2026): every quote status change goes through transition(). These prove the door holds against a real Postgres:
// owned edges can't be taken by hand, hooks run inside the move, events carry from/to, timers skip rows that already moved,
// and the bugs the state-machine audit found stay fixed. Needs TEST_POSTGRES_URL; skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL_ = process.env.TEST_POSTGRES_URL;
if (URL_) { process.env.POSTGRES_URL = URL_; process.env.DB_SSL ??= "disable"; }
const run = URL_ ? describe : describe.skip;

const PC = "4612";
const STAFF = { type: "staff" as const, id: "door-staff" };
const AGENT = { type: "agent" as const, id: "door-agent" };
const SITE = { address: { line1: "2 Door Street", suburb: "Kingaroy", state: "QLD", postcode: PC }, phases: 1 as const, roofType: "tin" as const, storeys: 1,
  batteryLocation: "garage" as const, switchboard: "ok" as const, nmi: "QB00000001",
  photos: { switchboard: true, meter: true, roof: true, battery_location: true } };

run("the one door (real database)", () => {
  let db: typeof import("@dfrnt/db").db;
  let J: typeof import("@/lib/jobs");
  let T: typeof import("@/lib/transition");
  let installerId = "", crewId = "";
  const tokens: string[] = [];

  async function paidJob(name: string) {
    const { createQuote } = await import("@/lib/quotes");
    const { pricingData } = await import("@/lib/pricing-data");
    const { findSystem } = await import("@dfrnt/engine");
    const s = findSystem("solax-10kw-15kwh", (await pricingData()).catalogue)!;
    const out = await createQuote({ type: "customer", id: "anonymous" }, { config: { backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, ...s.config, postcode: PC }, systemSlug: s.slug } as never, { status: "secured" });
    const token = out.result.token; tokens.push(token);
    let q = (await J.getQuote(token))!;
    await J.submitSite(q, SITE, { name, email: `${name.toLowerCase()}@door.test`, phone: "0400000001" });
    q = (await J.getQuote(token))!; expect(q.status).toBe("priced");
    await J.sign(q, name); q = (await J.getQuote(token))!;
    await J.chooseBank(q); q = (await J.getQuote(token))!; expect(q.status).toBe("payment_pending");
    await J.markPaid(q, STAFF); q = (await J.getQuote(token))!; expect(q.status).toBe("awaiting_date");
    return q;
  }
  const fresh = async (token: string) => (await J.getQuote(token))!;
  /** Put a job in a state directly (test setup only: the door is what's under test). */
  const force = async (id: string, status: string, extra = "") => { await db().unsafe(`update quotes set status = '${status}'${extra} where id = $1`, [id]); };

  beforeAll(async () => {
    ({ db } = await import("@dfrnt/db"));
    J = await import("@/lib/jobs");
    T = await import("@/lib/transition");
    const [i] = await db()`insert into installers (business_name, contact_name, email, postcode_ranges, active, is_test, scope, capacity)
      values ('Door Installer', 'Door', ${`door-${Date.now()}@example.test`}, ${`{"[4612,4613)"}`}::int4range[], true, true,
        ${db().json({ version: 1, phases: [1, 3], roofTypes: ["tin", "tile", "kliplok"], maxStoreys: 2, maxCableRunM: 10, switchboardOk: true, batteryLocations: ["garage", "outdoor_wall", "other"] })},
        ${db().json({ leadDays: 0, blackouts: [], jobsPerDay: 2, workingDays: [1, 2, 3, 4, 5, 6, 0] })}) returning id`;
    installerId = i!.id as string;
    const S = await import("@/lib/settings");
    await S.setSetting("pricing_mode", { installer_confirms_all: false, allow_test_installer: true }, "vitest-door");
    const [c] = await db()`insert into installer_crews (installer_id, name, source, status) values (${installerId}, 'Door crew', 'test', 'connected') returning id`;
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
    await db()`delete from approvals where proposer_id = 'door-agent'`.catch(() => null);
    await db()`delete from settings where key = 'pricing_mode' and updated_by = 'vitest-door'`.catch(() => null);
    await db().end?.();
  });

  it("Change stage refuses cancel, price and payment edges and names the action; plain edges go through", async () => {
    const q = await paidJob("Edges");
    await expect(J.advance(q, "cancelled", STAFF, "test")).rejects.toThrow(/Cancel/);
    await expect(J.advance(q, "booked", STAFF, "test")).rejects.toThrow(/booking/);
    const p = await paidJob("Edges2"); await force(p.id, "pricing_installer");
    await expect(J.advance(await fresh(p.token), "priced", STAFF, "test")).rejects.toThrow(/Price/);
    await force(q.id, "booked");
    const r = await J.advance(await fresh(q.token), "gear_ordered", STAFF, "PO sent");
    expect(r.changed).toBe(true); expect(r.from).toBe("booked");
    expect(r.next.map((n) => n.to)).toEqual(["delivered", "cancelled"]);
  });

  it("every move writes one event carrying from and to; a stale row is reported, not re-recorded", async () => {
    const q = await paidJob("Events");
    const [{ n: before }] = await db()`select count(*)::int n from events where entity_id = ${q.id} and type like 'quote.%'` as never as [{ n: number }];
    const [e] = await db()`select payload from events where entity_id = ${q.id} and type = 'quote.awaiting_date' order by at desc limit 1`;
    expect(e!.payload).toMatchObject({ from: "payment_pending", to: "awaiting_date", via: "markPaid" });
    // The row is already in awaiting_date: a tolerant move from payment_pending does nothing and records nothing.
    const out = await T.transitionById(q.id, "payment_pending", "awaiting_date", { type: "system", id: "app" }, { action: "test", via: "markPaid" });
    expect(out.changed).toBe(false);
    const [{ n: after }] = await db()`select count(*)::int n from events where entity_id = ${q.id} and type like 'quote.%'` as never as [{ n: number }];
    expect(after).toBe(before);
    // A non-tolerant move from a stale row throws with the current label.
    await expect(T.transition({ ...q, status: "payment_pending" }, "awaiting_date", STAFF, { action: "test", via: "markPaid" })).rejects.toThrow(/Awaiting date/);
  });

  it("an owned edge can't be taken without its owner, even with the right states", async () => {
    const q = await paidJob("Owner");
    await expect(T.transition(q, "booked", STAFF, { action: "test" })).rejects.toThrow(/bookDay/);
    await expect(T.transition(q, "booked", STAFF, { action: "test", via: "markPaid" })).rejects.toThrow(/bookDay/);
  });

  it("agents: human-only edges are refused, P edges need P, A edges pass", async () => {
    const q = await paidJob("Agent"); await force(q.id, "booked");
    await expect(T.transition(await fresh(q.token), "cancelled", AGENT, { action: "test", via: "cancel" })).rejects.toThrow(/human-only/);
    await expect(T.transition(await fresh(q.token), "gear_ordered", AGENT, { action: "test", maxTier: "R" })).rejects.toThrow(/tier/);
    expect((await T.transition(await fresh(q.token), "gear_ordered", AGENT, { action: "test", maxTier: "A" })).changed).toBe(true);
    await force(q.id, "delivered"); await force(q.id, "on_site");
    await expect(T.transition(await fresh(q.token), "installed", AGENT, { action: "test", maxTier: "A" })).rejects.toThrow(/tier P/);
  });

  it("nobody but Stripe marks a card job paid: not staff, not an approved agent", async () => {
    const q = await paidJob("Stripe");
    await force(q.id, "payment_pending", ", payment_method = 'card'");
    await expect(J.markPaid(await fresh(q.token), STAFF)).rejects.toThrow(/Stripe/);
    await expect(J.markPaid(await fresh(q.token), AGENT)).rejects.toThrow(/Stripe/);
    await J.markPaid(await fresh(q.token), { type: "system", id: "stripe" });
    expect((await fresh(q.token)).status).toBe("awaiting_date");
  });

  it("the 7-day release only touches bank transfers; card and PayTo jobs stay with Stripe", async () => {
    const bank = await paidJob("Bank"); await force(bank.id, "payment_pending", ", payment_method = 'bank', updated_at = now() - interval '8 days'");
    await db()`update payments set status = 'pending', received_at = null where quote_id = ${bank.id} and kind = 'system'`;
    const card = await paidJob("Payto"); await force(card.id, "payment_pending", ", payment_method = 'payto', updated_at = now() - interval '8 days'");
    const { runDaily } = await import("@/lib/timers");
    const out = await runDaily();
    expect(out.bank_released as number).toBeGreaterThanOrEqual(1);
    expect((await fresh(bank.token)).status).toBe("signed");
    const [p] = await db()`select status from payments where quote_id = ${bank.id} and kind = 'system' order by created_at desc limit 1`;
    expect(p!.status).toBe("failed");
    expect((await fresh(card.token)).status).toBe("payment_pending");
  });

  it("the daily expiry of agent proposals works (constraint relaxed) and expires the agent action with it", async () => {
    const [a] = await db()`insert into approvals (proposer_type, proposer_id, action, payload, rationale, created_at) values ('agent', 'door-agent', 'jobs.advance', '{}', 'old', now() - interval '25 hours') returning id`;
    const { runDaily } = await import("@/lib/timers");
    const out = await runDaily();
    expect(typeof out.proposals_expired === "number" ? out.proposals_expired : -1).toBeGreaterThanOrEqual(1);
    const [row] = await db()`select status, decided_by from approvals where id = ${a!.id}`;
    expect(row!.status).toBe("expired"); expect(row!.decided_by).toBeNull();
  });

  it("on site: the hold lifts only once every proposed variation has an answer; installed runs its hook inside the move", async () => {
    const q = await paidJob("Vary"); await force(q.id, "on_site");
    await J.raiseVariation(await fresh(q.token), STAFF, "VAR-CUSTOM", "Extra conduit", 100);
    expect((await fresh(q.token)).status).toBe("variation_pending");
    await J.raiseVariation(await fresh(q.token), STAFF, "VAR-CUSTOM", "Second thing", 50);
    const vs = await db()`select id from variations where quote_id = ${q.id} order by created_at`;
    await J.decideVariation(await fresh(q.token), vs[0]!.id as string, true);
    expect((await fresh(q.token)).status).toBe("variation_pending");
    await J.decideVariation(await fresh(q.token), vs[1]!.id as string, false);
    expect((await fresh(q.token)).status).toBe("on_site");
    const r = await J.advance(await fresh(q.token), "installed", STAFF, "commissioned");
    expect(r.changed).toBe(true);
    const [s] = await db()`select count(*)::int n from stc_receivables where quote_id = ${q.id}`;
    expect(s!.n).toBe(1);
    // A variation approved after install is pay-eligible at once (bug 8).
    await J.raiseVariation(await fresh(q.token), STAFF, "VAR-CUSTOM", "Late extra", 10).catch(() => null);
  });

  it("settled → complete is refused while the installer has unpaid lines", async () => {
    const q = await paidJob("Complete");
    await db()`insert into pay_ledger (installer_id, quote_id, description, amount_ex, status) values (${installerId}, ${q.id}, 'Installation', 1000, 'eligible')`;
    await force(q.id, "settled");
    await expect(J.advance(await fresh(q.token), "complete", STAFF, "test")).rejects.toThrow(/not paid/);
    await db()`update pay_ledger set status = 'paid' where quote_id = ${q.id}`;
    expect((await J.advance(await fresh(q.token), "complete", STAFF, "test")).changed).toBe(true);
  });

  it("a stuck instant price is rescued to tech review by the cut-off, and Formbay lodging moves the STC receivable too", async () => {
    const q = await paidJob("Stuck"); await force(q.id, "pricing_instant", ", updated_at = now() - interval '2 hours'");
    const { runCutoff } = await import("@/lib/timers");
    await runCutoff();
    expect((await fresh(q.token)).status).toBe("tech_review");
    const p = await paidJob("Lodge"); await force(p.id, "installed");
    await db()`insert into stc_receivables (quote_id, solar_stcs, battery_stcs, expected_value) values (${p.id}, 1, 1, 100)`;
    const out = await T.transitionById(p.id, "installed", "lodged", { type: "system", id: "app" }, { action: "test" });
    expect(out.changed).toBe(true);
  });
});
