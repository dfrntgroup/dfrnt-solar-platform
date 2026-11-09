import { describe, expect, it } from "vitest";
import { LIFECYCLES, lifecycleLabel, PAYMENT, PURCHASE_ORDER, STC_RECEIVABLE } from "../src";

describe("other lifecycles (golden)", () => {
  it("every declared machine has a label per state and no self-loops", () => {
    for (const [table, mch] of Object.entries(LIFECYCLES)) for (const s of mch.states) {
      expect(mch.labels[s], `${table}.${s}`).toBeTruthy();
      expect(mch.transitions[s], `${table}.${s}`).not.toContain(s);
    }
  });
  it("terminal states are the ones meant to be terminal", () => {
    expect([...PAYMENT.terminal].sort()).toEqual(["failed", "received", "refunded"]);
    expect([...PURCHASE_ORDER.terminal].sort()).toEqual(["cancelled", "delivered"]);
    expect([...STC_RECEIVABLE.terminal].sort()).toEqual(["failed", "paid"]);
    expect(LIFECYCLES.energy_links!.terminal).toEqual(["disconnected"]);
  });
  it("guards that used to be missing are now edges", () => {
    expect(PURCHASE_ORDER.can("delivered", "cancelled")).toBe(false);
    expect(STC_RECEIVABLE.can("paid", "lodged")).toBe(false);
    expect(LIFECYCLES.memberships!.can("cancelled", "active")).toBe(false);
    expect(LIFECYCLES.installer_applications!.can("new", "declined")).toBe(true);
    expect(LIFECYCLES.credits!.can("applied", "issued")).toBe(true);
    expect(LIFECYCLES.energy_links!.can("failed", "ready")).toBe(false);
  });
  it("labels fall back to the raw value", () => { expect(lifecycleLabel("payments", "review")).toBe("Processing"); expect(lifecycleLabel("payments", "weird")).toBe("weird"); });
});
