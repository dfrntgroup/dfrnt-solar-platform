import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOGUE, priceSystem } from "../src";

describe("launch catalogue", () => {
  for (const s of DEFAULT_CATALOGUE.systems) {
    it(`${s.slug} resolves and can be checked out`, () => {
      const q = priceSystem(s, { postcode: "4551", asOf: "2026-11-01" });
      expect(q.config.blockers).toEqual([]);
      expect(q.stack.price_pending).toEqual([]);
      expect(q.checkout_allowed).toBe(true);
      expect(q.stack.amount_payable).toBeGreaterThan(0);
    });
  }
  it("slugs are unique", () => expect(new Set(DEFAULT_CATALOGUE.systems.map((s) => s.slug)).size).toBe(DEFAULT_CATALOGUE.systems.length));
  it("prints the price list", () => {
    const rows = DEFAULT_CATALOGUE.systems.map((s) => { const q = priceSystem(s, { postcode: "4551", asOf: "2026-11-01" }); return `${s.slug.padEnd(24)} ${q.config.inverter?.sku?.padEnd(20)} pay ${q.stack.amount_payable.toFixed(2).padStart(10)}  before ${q.stack.price_inc_gst.toFixed(2).padStart(10)}  gm ${q.stack.gross_margin_pct}%`; });
    console.log(rows.join("\n"));
  });
});
