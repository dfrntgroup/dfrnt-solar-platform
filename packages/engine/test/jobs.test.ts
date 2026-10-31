import { describe, expect, it } from "vitest";
import { bookableDates, canTransition, DEFAULT_SCOPE, earliestDate, instantPriceBlockers, refundRule, STATES, TRANSITIONS, type SiteAnswers } from "../src";

const site: SiteAnswers = {
  address: { line1: "9 Example St", unit: "", suburb: "Buderim", state: "QLD", postcode: "4556" },
  phases: 1, roofType: "tin", storeys: 1, batteryLocation: "garage", switchboard: "ok", cableRunM: 5,
  photos: { switchboard: true, meter: true, roof: true, battery_location: true },
};

describe("state machine", () => {
  it("every target is a known state", () => { for (const t of Object.values(TRANSITIONS).flat()) expect(STATES).toContain(t); });
  it("happy path is allowed end to end", () => {
    const path = ["saved", "secured", "pricing_instant", "priced", "signed", "payment_pending", "awaiting_date", "booked", "gear_ordered", "delivered", "on_site", "installed", "lodged", "settled", "complete"] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1]!, path[i]!)).toBe(true);
  });
  it("cannot skip payment", () => expect(canTransition("signed", "booked")).toBe(false));
  it("installed jobs cannot be cancelled", () => expect(canTransition("installed", "cancelled")).toBe(false));
});

describe("instant price (I8 scope)", () => {
  it("in-scope site prices instantly", () => expect(instantPriceBlockers(site, DEFAULT_SCOPE)).toEqual([]));
  it("T3: sub-board goes to the installer", () => expect(instantPriceBlockers({ ...site, switchboard: "needs_subboard" }, DEFAULT_SCOPE)).toEqual(["Switchboard needs a sub-board"]));
  it("missing photo goes to the installer", () => expect(instantPriceBlockers({ ...site, photos: { ...site.photos, meter: false } }, DEFAULT_SCOPE)[0]).toMatch(/meter/));
  it("three storeys outside a two-storey scope", () => expect(instantPriceBlockers({ ...site, storeys: 3 }, DEFAULT_SCOPE)).toHaveLength(1));
});

describe("earliest install date", () => {
  const cap = { jobsPerDay: 1, leadDays: 3, workingDays: [1, 2, 3, 4, 5], blackouts: ["2026-11-05"], booked: { "2026-11-04": 1 } };
  it("skips booked days, blackouts and weekends", () => expect(earliestDate("2026-11-01", cap)).toBe("2026-11-06"));
  it("gear lead time pushes it out", () => expect(earliestDate("2026-11-01", cap, 10)).toBe("2026-11-13"));
  it("T4: booking inside the 2026 window only offers dates up to 31 Dec", () => {
    const d = bookableDates("2026-12-20", { ...cap, blackouts: [], booked: {} }, "2026-12-31");
    expect(d.every((x) => x <= "2026-12-31")).toBe(true);
    expect(d.length).toBeGreaterThan(0);
  });
});

describe("refund rules", () => {
  it("within 10 business days of signing is a full refund", () => expect(refundRule("2026-11-02", "2026-11-13", "booked")).toBe("full_cooling_off"));
  it("after gear ordered loses restocking", () => expect(refundRule("2026-11-02", "2026-12-01", "gear_ordered")).toBe("less_restocking"));
});
