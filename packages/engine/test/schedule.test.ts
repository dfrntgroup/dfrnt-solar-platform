import { describe, expect, it } from "vitest";
import { busyMinutes, cannotDo, DEFAULT_PROFILE, freeCrewDays, freeOn, freeSlots, jobDays, loadFrom, type CrewCalendar, type JobNeeds } from "../src";

const needs: JobNeeds = { brand: "SolaX", kind: "solar_battery", panelKw: 9.975, phases: 1, roofType: "tin", storeys: 1, postcode: "4556" };
const crew = (busy: CrewCalendar["busy"] = [], load: Record<string, number> = {}, id = "c1"): CrewCalendar => ({ id, busy, load });
const at = (d: string, h: number) => new Date(Date.parse(`${d}T00:00:00Z`) - 10 * 3600_000 + h * 3600_000).toISOString();
// 2026-11-02 is a Monday
const MON = "2026-11-02", TUE = "2026-11-03", WED = "2026-11-04", FRI = "2026-11-06", SAT = "2026-11-07", NEXT_MON = "2026-11-09";

describe("how: job size", () => {
  it("solar + battery is a day, battery only half a day", () => {
    expect(jobDays(DEFAULT_PROFILE, needs)).toBe(1);
    expect(jobDays(DEFAULT_PROFILE, { ...needs, kind: "battery_only", panelKw: 0 })).toBe(0.5);
  });
  it("big arrays and two storeys take longer", () => {
    expect(jobDays(DEFAULT_PROFILE, { ...needs, panelKw: 15 })).toBe(2);
    expect(jobDays(DEFAULT_PROFILE, { ...needs, storeys: 2 })).toBe(1.5);
  });
});

describe("who: capability", () => {
  it("an unset profile takes anything", () => expect(cannotDo(DEFAULT_PROFILE, needs)).toEqual([]));
  it("brand, roof, storeys and phase rule installers out", () => {
    const p = { ...DEFAULT_PROFILE, brands: ["Sungrow"], roofTypes: ["tin"], maxStoreys: 1, phases: [1] };
    expect(cannotDo(p, needs)).toEqual(["Not accredited for SolaX"]);
    expect(cannotDo({ ...p, brands: [] }, { ...needs, roofType: "tile", storeys: 2, phases: 3 })).toHaveLength(3);
  });
  it("roof type doesn't matter for a battery-only job", () => {
    expect(cannotDo({ ...DEFAULT_PROFILE, roofTypes: ["tin"] }, { ...needs, kind: "battery_only", roofType: "tile" })).toEqual([]);
  });
});

describe("when: busy rule", () => {
  it("an all-day event blocks the day", () => {
    expect(busyMinutes(MON, [{ start: at(MON, 0), end: at(TUE, 0) }])).toBe(480);
    expect(freeOn(MON, crew([{ start: at(MON, 0), end: at(TUE, 0) }]), DEFAULT_PROFILE)).toBe(0);
  });
  it("a 30-minute call doesn't; overlapping events aren't double counted", () => {
    expect(freeOn(MON, crew([{ start: at(MON, 9), end: at(MON, 9.5) }]), DEFAULT_PROFILE)).toBe(1);
    expect(busyMinutes(MON, [{ start: at(MON, 8), end: at(MON, 10) }, { start: at(MON, 9), end: at(MON, 11) }])).toBe(180);
  });
  it("evening events don't count", () => expect(busyMinutes(MON, [{ start: at(MON, 17), end: at(MON, 21) }])).toBe(0));
  it("weekends aren't offered unless they work them", () => {
    expect(freeOn(SAT, crew(), DEFAULT_PROFILE)).toBe(0);
    expect(freeOn(SAT, crew(), { workingDays: [6] })).toBe(1);
  });
  it("our own half-day booking leaves half a day", () => expect(freeOn(MON, crew([], { [MON]: 0.5 }), DEFAULT_PROFILE)).toBe(0.5));
});

describe("when: slots", () => {
  const base = { today: "2026-10-28", profile: DEFAULT_PROFILE, until: null, gearLeadDays: 3 };
  it("starts after notice and gear lead, on working days", () => {
    const s = freeSlots({ ...base, crews: [crew()], days: 1, max: 3 });
    expect(s.map((x) => x.date)).toEqual([MON, TUE, WED]);
  });
  it("skips days the installer is busy", () => {
    const s = freeSlots({ ...base, crews: [crew([{ start: at(MON, 7), end: at(MON, 12) }])], days: 1, max: 1 });
    expect(s[0]!.date).toBe(TUE);
  });
  it("two-day jobs need back-to-back free days, over the weekend if needed", () => {
    const s = freeSlots({ ...base, crews: [crew([{ start: at(TUE, 0), end: at(WED, 0) }])], days: 2, max: 5 });
    expect(s[0]!.date).toBe(WED);
    expect(s.find((x) => x.date === FRI)!.dates).toEqual([FRI, NEXT_MON]);
  });
  it("a second crew fills a day the first can't", () => {
    const s = freeSlots({ ...base, crews: [crew([{ start: at(MON, 0), end: at(TUE, 0) }]), crew([], {}, "c2")], days: 1, max: 1 });
    expect(s[0]).toMatchObject({ date: MON, crewId: "c2" });
  });
  it("never runs past the rebate deadline", () => {
    const s = freeSlots({ ...base, crews: [crew()], days: 2, until: TUE, max: 9 });
    expect(s.map((x) => x.date)).toEqual([MON]);
  });
  it("a half-day job fits beside another half-day job", () => {
    const s = freeSlots({ ...base, crews: [crew([], { [MON]: 0.5 })], days: 0.5, max: 1 });
    expect(s[0]).toMatchObject({ date: MON, part: "am" });
    expect(freeSlots({ ...base, crews: [crew([], { [MON]: 1 })], days: 0.5, max: 1 })[0]!.date).toBe(TUE);
  });
  it("no crews, no slots", () => expect(freeSlots({ ...base, crews: [], days: 1 })).toEqual([]));
});

describe("load and capacity", () => {
  it("a 1.5-day job uses a full day then half the next working day", () => {
    expect(loadFrom([{ date: FRI, days: 1.5 }], [1, 2, 3, 4, 5])).toEqual({ [FRI]: 1, [NEXT_MON]: 0.5 });
  });
  it("counts free crew-days in a range", () => {
    expect(freeCrewDays(MON, FRI, [crew(), crew([], { [MON]: 1 }, "c2")], DEFAULT_PROFILE)).toBe(9);
  });
});
