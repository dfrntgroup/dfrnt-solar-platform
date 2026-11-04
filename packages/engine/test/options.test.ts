import { describe, expect, it } from "vitest";
import { autoStacks, configOptions, DEFAULT_CATALOGUE, type ConfigInput } from "../src";

const base = (slug: string): ConfigInput => ({ backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, postcode: "4551", installDate: "2026-11-15", ...DEFAULT_CATALOGUE.systems.find((s) => s.slug === slug)!.config } as ConfigInput);

describe("configurator options", () => {
  it("SolaX VAST offers 2–11 HS51 modules (60 kWh home cap; the rule allows 16) and a panel range", () => {
    const o = configOptions(base("solax-10kw-15kwh"));
    expect(o.modules[0]).toBe(2);
    expect(o.modules).toContain(11);
    expect(o.modules).not.toContain(12);
    expect(o.panels).toContain(21);
    console.log("solax panels", o.panels.join(","), "modules", o.modules.join(","));
  });
  it("Sungrow modules only in allowed equal stacks", () => {
    const o = configOptions(base("sungrow-10kw-20kwh"));
    expect(o.modules).not.toContain(7);
    console.log("sungrow modules", o.modules.join(","));
  });
  it("GoodWe ESA allows 2–6 modules", () => expect(configOptions(base("goodwe-10kw-18kwh")).modules).toEqual([2, 3, 4, 5, 6]));
  it("auto stacks splits 10 HS51 modules into two towers", () => expect(autoStacks({ ...base("solax-10kw-15kwh"), batteryModules: 10 })).toBe(2));
});
