// December switch-over (approved 3 Nov 2026): when installs before the rebate change are fully booked in an area,
// new prices there use the next window, and customers priced for the old window are offered the new price.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL_ = process.env.TEST_POSTGRES_URL;
if (URL_) { process.env.POSTGRES_URL = URL_; process.env.DB_SSL ??= "disable"; }
const run = URL_ ? describe : describe.skip;
const PC = "4611";

run("December switch-over (real database)", () => {
  let db: typeof import("@dfrnt/db").db;
  let installerId = "", crewId = "";
  const tokens: string[] = [];

  async function secure() {
    const { createQuote } = await import("@/lib/quotes");
    const { pricingData } = await import("@/lib/pricing-data");
    const { findSystem } = await import("@dfrnt/engine");
    const s = findSystem("solax-10kw-15kwh", (await pricingData()).catalogue)!;
    const out = await createQuote({ type: "customer", id: "anonymous" }, { config: { backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, ...s.config, postcode: PC }, systemSlug: s.slug } as never, { status: "secured" });
    tokens.push(out.result.token);
    return out.result.token;
  }

  beforeAll(async () => {
    ({ db } = await import("@dfrnt/db"));
    const [i] = await db()`insert into installers (business_name, contact_name, email, postcode_ranges, active, is_test, scope, capacity)
      values ('Vitest Switchover', 'Vitest', ${`vitest-sw-${Date.now()}@example.test`}, ${`{"[4611,4612)"}`}::int4range[], true, true,
        ${db().json({ version: 1, phases: [1, 3], roofTypes: ["tin"], maxStoreys: 2, maxCableRunM: 10, switchboardOk: true, batteryLocations: ["garage", "outdoor_wall", "other"] })},
        ${db().json({ leadDays: 0, blackouts: [], jobsPerDay: 1, workingDays: [1, 2, 3, 4, 5, 6, 0] })}) returning id`;
    installerId = i!.id as string;
    const [c] = await db()`insert into installer_crews (installer_id, name, source, status) values (${installerId}, 'Vitest crew', 'test', 'connected') returning id`;
    crewId = c!.id as string;
  });

  afterAll(async () => {
    if (!installerId) return;
    const ids = (await db()`select id from quotes where token = any(${tokens})`).map((r) => r.id as string);
    for (const t of ["payments", "messages", "conversions"]) await db().unsafe(`delete from ${t} where quote_id = any($1::uuid[])`, [ids]).catch(() => null);
    await db()`delete from quotes where id = any(${ids}::uuid[])`.catch(() => null);
    await db()`delete from crew_busy_test where crew_id = ${crewId}`.catch(() => null);
    await db()`delete from installer_crews where installer_id = ${installerId}`.catch(() => null);
    await db()`delete from installers where id = ${installerId}`.catch(() => null);
  });

  it("while December has days: priced on today's window", async () => {
    const { rebateFromFor } = await import("@/lib/rebate-from");
    expect(await rebateFromFor(PC)).toBeNull();
  });

  it("once the crew is booked to 31 December: new prices use January, old prices are offered January and can accept", async () => {
    const { rebateFromFor } = await import("@/lib/rebate-from");
    const { clearNextDaysCache } = await import("@/lib/schedule");
    const J = await import("@/lib/jobs");
    const decToken = await secure();
    const dec = (await J.getQuote(decToken))!;
    expect(dec.result.rebate.battery_factor).toBe(6.8);

    await db()`insert into crew_busy_test (crew_id, starts_at, ends_at) values (${crewId}, now() - interval '1 day', '2027-01-01T00:00:00+10:00')`;
    clearNextDaysCache();
    expect(await rebateFromFor(PC)).toBe("2027-01-01");

    const janToken = await secure();
    const jan = (await J.getQuote(janToken))!;
    expect(jan.input.installDate).toBe("2027-01-01");
    expect(jan.result.rebate.battery_factor).toBe(5.7);
    expect(jan.result.stack.amount_payable).toBeGreaterThan(dec.result.stack.amount_payable);

    const offer = await J.forwardOffer(dec);
    expect(offer?.from).toBe("2027-01-01");
    expect(offer!.now).toBeCloseTo(jan.result.stack.amount_payable, 2);
    expect(await J.forwardOffer(jan)).toBeNull();

    await J.acceptForward(dec);
    const moved = (await J.getQuote(decToken))!;
    expect(moved.input.installDate).toBe("2027-01-01");
    expect(moved.result.stack.amount_payable).toBeCloseTo(offer!.now, 2);
    const [row] = await db()`select amount_payable::float8 a from quotes where token = ${decToken}`;
    expect(row!.a).toBeCloseTo(offer!.now, 2);
    expect(await J.forwardOffer(moved)).toBeNull();
  });
});
