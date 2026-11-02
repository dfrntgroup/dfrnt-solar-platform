// Customer wording for installer labour lines (launch copy, 3 Nov 2026). The labour menu keeps its trade wording
// for installers and Ops; customers see what the line does for them. Unknown codes fall back to the menu text.
const PLAIN: Record<string, string> = {
  "SVC-BATTERY-INSTALL": "Installing your battery",
  "SVC-BAT-ADD": "Installing each extra battery stack",
  "SVC-METER-1P": "Fitting the energy meter that runs your system",
  "SVC-METER-3P": "Fitting the energy meter that runs your system (three phase)",
  "SVC-3P-PROPERTY": "Extra work for a three-phase home",
  "SVC-EPS-WH-1P": "Whole-home backup wiring",
  "SVC-EPS-WH-3P": "Whole-home backup wiring (three phase)",
  "SVC-TERRACOTTA": "Extra care for a terracotta roof",
  "SVC-TILT": "Tilt frames to angle your panels",
  "SVC-INST-2STY": "Working on a two-storey roof",
  "SVC-BARRIER": "Fire-safe backing board behind the battery",
  "SVC-BOLLARDS": "Bollards to protect the battery from cars",
  "SVC-EXTRA-STRING": "Extra panel circuit and isolator",
  "SVC-BAT-SLAB": "Concrete pad for the battery",
  "SVC-CABLE-1P": "Extra cable run",
  "SVC-CABLE-3P": "Extra cable run (three phase)",
  "SVC-SWB-HALF": "Switchboard upgrade (part)",
  "SVC-SWB-FULL": "Switchboard upgrade (full)",
  "SVC-TRAVEL": "Travel to a home more than 50 km out",
  "SVC-EV-STD": "Installing your EV charger",
};
const M = new Set(["SVC-CABLE-1P", "SVC-CABLE-3P"]);
const KM = new Set(["SVC-TRAVEL"]);

export function plainLine(code: string, fallback: string, qty: number, panelKw?: number | null): string {
  if (code === "SVC-SOLAR-INSTALL") return panelKw ? `Installing your ${Math.round(panelKw * 100) / 100} kW of panels` : "Installing your panels";
  const base = PLAIN[code] ?? fallback;
  if (qty <= 1) return base;
  if (M.has(code)) return `${base}, ${qty} m`;
  if (KM.has(code)) return `${base}, ${qty} km`;
  return `${base} × ${qty}`;
}
