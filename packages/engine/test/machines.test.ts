import { describe, expect, it } from "vitest";
import { BOARD, BOARD_COLUMNS, defineMachine, isManualEdge, JOB_EFFECTS, JOB_LABELS, JOB_SETS, JOB_STEPS, JOB_TIERS, nextMoves, ownerOf, QUOTE, STATES, statusLabel, subStatus, TRANSITIONS } from "../src";

describe("defineMachine", () => {
  it("rejects unknown targets, missing labels and edge keys that aren't transitions", () => {
    expect(() => defineMachine({ name: "x", states: ["a", "b"] as const, transitions: { a: ["c"], b: [] } as never, labels: { a: "A", b: "B" } })).toThrow(/unknown state/);
    expect(() => defineMachine({ name: "x", states: ["a", "b"] as const, transitions: { a: ["b"], b: [] }, labels: { a: "A" } as never })).toThrow(/label/);
    expect(() => defineMachine({ name: "x", states: ["a", "b"] as const, transitions: { a: ["b"], b: [] }, labels: { a: "A", b: "B" }, effects: { "b->a": "nope" } })).toThrow(/not a transition/);
  });
  it("exact edge keys win over wildcards", () => {
    const m = defineMachine({ name: "x", states: ["a", "b", "c"] as const, transitions: { a: ["b", "c"], b: ["c"], c: [] }, labels: { a: "A", b: "B", c: "C" },
      effects: { "*->c": "wild", "b->c": "exact" }, tiers: { "a->*": "A" }, defaultTier: "H" });
    expect(m.effectsOf("a", "c")).toEqual(["wild"]); expect(m.effectsOf("b", "c")).toEqual(["exact"]); expect(m.effectsOf("a", "b")).toEqual([]);
    expect(m.tierOf("a", "b")).toBe("A"); expect(m.tierOf("b", "c")).toBe("H");
    expect(m.terminal).toEqual(["c"]); expect(m.from("c")).toEqual(["a", "b"]);
  });
});

describe("quote machine (golden)", () => {
  it("every state has a label, a board column and a step", () => {
    for (const s of STATES) {
      expect(JOB_LABELS[s]).toBeTruthy();
      expect(BOARD[s]).toBeTruthy();
      if (!JOB_SETS.CLOSED.includes(s)) expect(JOB_STEPS.some((g) => g.states.includes(s))).toBe(true);
    }
  });
  it("every effect and tier key names a real edge (defineMachine throws otherwise)", () => {
    expect(QUOTE.edges.length).toBe(Object.values(TRANSITIONS).flat().length);
    for (const k of Object.keys(JOB_EFFECTS).concat(Object.keys(JOB_TIERS))) expect(k).toMatch(/^([a-z_]+|\*)->([a-z_]+|\*)$/);
  });
  it("every state is reachable from saved or secured, and only the closed and complete states are terminal", () => {
    const seen = new Set<string>(["saved", "secured"]);
    const todo = [...seen];
    while (todo.length) for (const t of TRANSITIONS[todo.shift() as keyof typeof TRANSITIONS]) if (!seen.has(t)) { seen.add(t); todo.push(t); }
    for (const s of STATES) expect(seen.has(s), `${s} unreachable`).toBe(true);
    expect([...QUOTE.terminal].sort()).toEqual(["cancelled", "complete", "declined", "expired"]);
  });
  it("no self-loops", () => { for (const s of STATES) expect(TRANSITIONS[s]).not.toContain(s); });
  it("money and customer edges are owned by an action; stage edges are manual", () => {
    expect(ownerOf("signed", "payment_pending")).toBe("createPayment");
    expect(ownerOf("payment_pending", "awaiting_date")).toBe("markPaid");
    expect(ownerOf("awaiting_date", "booked")).toBe("bookDay");
    expect(ownerOf("pricing_installer", "priced")).toBe("freezePrice");
    expect(ownerOf("booked", "cancelled")).toBe("cancel");
    expect(isManualEdge("booked", "gear_ordered")).toBe(true);
    expect(isManualEdge("on_site", "installed")).toBe(true);      // inline hook
    expect(isManualEdge("settled", "complete")).toBe(true);
    expect(isManualEdge("pricing_installer", "priced")).toBe(false);
    expect(isManualEdge("awaiting_date", "cancelled")).toBe(false);
  });
  it("every edge that moves money, a price, a day or a cancellation is tier H or P, never A", () => {
    for (const e of QUOTE.edges) if (e.effects.some((x) => !x.endsWith("!"))) expect(e.tier, `${e.from}->${e.to}`).not.toBe("A");
  });
  it("named sets only contain real states and CAN_CANCEL is derived from the table", () => {
    for (const [k, set] of Object.entries(JOB_SETS)) for (const s of set) expect(STATES, `${k}:${s}`).toContain(s);
    expect([...JOB_SETS.CAN_CANCEL].sort()).toEqual(STATES.filter((s) => TRANSITIONS[s].includes("cancelled")).sort());
    expect(JOB_SETS.CAN_CANCEL).toContain("variation_pending");
    expect(JOB_SETS.BOOKED).toEqual(["booked", "gear_ordered", "delivered", "on_site", "variation_pending"]);
  });
  it("board columns follow the journey and start at Checkout", () => {
    expect(BOARD_COLUMNS[0]).toBe("Checkout"); expect(BOARD_COLUMNS).toContain("Complete"); expect(BOARD_COLUMNS).not.toContain("Saved"); expect(BOARD_COLUMNS).not.toContain("Closed");
  });
  it("a stuck instant price can be rescued to tech review", () => expect(QUOTE.can("pricing_instant", "tech_review")).toBe(true));
  it("sub-status and labels", () => {
    expect(statusLabel({ status: "booked", rebook: true, install_date: null })).toBe("Booked · needs a day");
    expect(statusLabel({ status: "booked", rebook: false, install_date: "2026-12-01" })).toBe("Booked");
    expect(subStatus({ status: "secured", design_fee_status: "due" })).toBe("fee due");
    expect(subStatus({ status: "priced", lock_until: "2026-11-01" }, "2026-11-09")).toBe("lock expired");
    expect(statusLabel({ status: "secured" })).toBe("Checkout");
  });
  it("nextMoves filters by tier", () => {
    const all = nextMoves("booked");
    expect(all.map((m) => m.to).sort()).toEqual(["awaiting_date", "cancelled", "gear_ordered"]);
    expect(nextMoves("booked", "A").map((m) => m.to)).toEqual(["gear_ordered"]);
    expect(nextMoves("payment_pending", "P").map((m) => m.to)).toEqual(["awaiting_date"]);
  });
});
