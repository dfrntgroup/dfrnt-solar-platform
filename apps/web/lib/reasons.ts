// Why a home needs the installer's eye, in words a homeowner reads as "they're checking", not "we won't do it".
// Input: the engine's instantPriceBlockers / config blocker strings (kept terse for Ops).
const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Photo missing: (.+)$/i, (m) => `A clear photo of your ${m[1]} so they can price it`],
  [/^Phases unknown$/i, () => "Whether your home is single or three phase (your switchboard photo shows it)"],
  [/^3-phase outside scope$/i, () => "Three-phase home: your installer checks the switchboard"],
  [/^1-phase outside scope$/i, () => "Single-phase home: your installer checks the switchboard"],
  [/^(\d+) storeys outside scope$/i, (m) => (m[1] === "2" ? "Two-storey roof: extra safety gear for working at height" : `${m[1]}-storey roof: extra safety gear for working at height`)],
  [/^tile roof outside scope$/i, () => "Tile roof: tile mounts instead of the standard tin ones"],
  [/^kliplok roof outside scope$/i, () => "Klip-Lok roof: the right clamps for your roof profile"],
  [/^Battery location (\w+) outside scope$/i, () => "Where the battery goes: your installer checks the spot meets the safety rules"],
  [/^Switchboard to be checked$/i, () => "Your switchboard: they check it has room for the new breakers"],
  [/^Switchboard needs a sub-board$/i, () => "Your switchboard needs a small extra board for the new circuits"],
  [/^Cable run (\d+(?:\.\d+)?) m over (\d+) m$/i, (m) => `A longer cable run (about ${m[1]} m) from the switchboard to the battery`],
  [/^Address incomplete$/i, () => "Your full address, so the rebate paperwork is right"],
  [/^No installer covers this postcode yet$/i, () => "We're finding an installer for your area"],
];

export function plainReason(r: string): string {
  for (const [re, f] of RULES) { const m = r.match(re); if (m) return f(m); }
  return r;
}
