// The record link must never show our costs, margin or installer pay (9 Nov 2026). Needs TEST_POSTGRES_URL; skipped otherwise.
import { afterAll, describe, expect, it } from "vitest";

const URL_ = process.env.TEST_POSTGRES_URL;
if (URL_) { process.env.POSTGRES_URL = URL_; process.env.DB_SSL ??= "disable"; }
const run = URL_ ? describe : describe.skip;
const SECRET = /cost_ex_gst|unit_cost|gross_margin|installer_pay|margin_pct|"cost"/;

run("record-link API privacy (real database)", () => {
  const tokens: string[] = [];
  afterAll(async () => { const { db } = await import("@dfrnt/db"); await db()`delete from quotes where token = any(${tokens})`.catch(() => null); await db().end?.(); });

  it("an anonymous read shows the customer's price and nothing internal", async () => {
    const { createQuote } = await import("@/lib/quotes");
    const { pricingData } = await import("@/lib/pricing-data");
    const { findSystem } = await import("@dfrnt/engine");
    const s = findSystem("solax-10kw-15kwh", (await pricingData()).catalogue)!;
    const out = await createQuote({ type: "customer", id: "anonymous" }, { config: { backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, ...s.config, postcode: "4551" }, systemSlug: s.slug } as never);
    tokens.push(out.result.token);
    const { GET } = await import("@/app/api/v1/quotes/[token]/route");
    const res = await GET(new Request(`http://x/api/v1/quotes/${out.result.token}`), { params: Promise.resolve({ token: out.result.token }) });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(SECRET);
    const body = JSON.parse(text);
    expect(body.price.you_pay).toBe(out.result.amount_payable);
    expect(body.price.included.length).toBeGreaterThan(0);
    expect(body.internal).toBeUndefined();
    expect(body.status_label).toBe("Saved");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});
