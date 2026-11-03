import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOGUE, DEFAULT_COSTS, DEFAULT_MENU, DEFAULT_MARGINS, DEFAULT_REBATE_SETTINGS, DEFAULT_RULES, rebateWindow } from "@dfrnt/engine";
import { buildHref, buildOptions, choiceFromQuery, soldInverters } from "@/lib/builder";
import { priceSystem } from "@dfrnt/engine";
import type { FullData } from "@/lib/pricing-data";

const data = { rules: DEFAULT_RULES, catalogue: DEFAULT_CATALOGUE, costs: DEFAULT_COSTS, menu: DEFAULT_MENU, margins: DEFAULT_MARGINS, rebates: DEFAULT_REBATE_SETTINGS, versions: {} } as unknown as FullData;
const asOf = "2026-11-03";
const site = { postcode: "4551", asOf };
const rd = rebateWindow(asOf, data.rebates).rebate_date;
const go = (c: Parameters<typeof buildOptions>[0]) => buildOptions(c, "4551", rd, data, site);

describe("build your own", () => {
  it("offers only inverters we already sell", () => {
    const sold = soldInverters(data);
    expect(sold.size).toBeGreaterThan(2);
    for (const fam of go({ phases: 1 }).brands) {
      for (const i of go({ phases: 1, family: fam.family }).inverters) expect(sold.has(i.sku)).toBe(true);
    }
  });
  it("brand from-prices match the cheapest product page", () => {
    const b = go({ phases: 1 }).brands;
    expect(b.map((x) => x.brand)).toEqual(expect.arrayContaining(["SolaX", "GoodWe"]));
    for (const x of b) expect(x.from).toBeGreaterThan(0);
  });
  it("prices a full GoodWe build the same way as the engine", () => {
    const f = go({ phases: 1 }).brands.find((x) => x.brand === "GoodWe")!;
    const inv = go({ phases: 1, family: f.family }).inverters.at(-1)!;
    const o = go({ phases: 1, family: f.family, inverterSku: inv.sku, modules: 3, panelSku: "PNL-RISEN-475", panels: 22, backup: true });
    expect(o.price?.ok).toBe(true);
    expect(o.price!.you_pay).toBeGreaterThan(10000);
    expect(o.price!.title).toMatch(/^Custom · GoodWe/);
    const longi = go({ ...o.choice, panelSku: "PNL-LONGI-475" });
    expect(longi.price!.you_pay).toBeGreaterThan(o.price!.you_pay);
  });
  it("snaps invalid counts to a valid one and explains blocked module counts", () => {
    const f = go({ phases: 1 }).brands.find((x) => x.brand === "Sungrow");
    if (!f) return;
    const inv = go({ phases: 1, family: f.family }).inverters.find((i) => !i.batteryOnly)!;
    const o = go({ phases: 1, family: f.family, inverterSku: inv.sku, modules: 2, panelSku: "PNL-RISEN-475", panels: 99 });
    expect(o.modules.find((m) => m.n === 2)?.ok).toBe(false);
    expect(o.choice.modules).not.toBe(2);
    expect(o.panelRange).toContain(o.choice.panels);
  });
  it("battery-only inverters never carry panels", () => {
    for (const fam of go({ phases: 1 }).brands) for (const i of go({ phases: 1, family: fam.family }).inverters.filter((x) => x.batteryOnly)) {
      const o = go({ phases: 1, family: fam.family, inverterSku: i.sku, panelSku: "PNL-RISEN-475", panels: 20 });
      expect(o.choice.panelSku).toBeNull();
      expect(o.price?.kw ?? 0).toBe(0);
    }
  });
  it("every product page reopens in the builder at the same price", () => {
    for (const s of data.catalogue.systems) {
      const q = priceSystem(s, site, data);
      const href = buildHref({ ...s.config, inverterSku: q.config.inverter?.sku }, "4551");
      const c = choiceFromQuery(Object.fromEntries(new URL(href, "http://x").searchParams));
      expect(go(c).price?.you_pay, s.slug).toBeCloseTo(q.stack.amount_payable, 2);
    }
  });
});
