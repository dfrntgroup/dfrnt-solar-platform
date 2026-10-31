/** Plain-words description of what a battery size does for a home. */
export function outcome(kwh: number, kw: number) {
  if (!kwh) return kw ? "Daytime solar for your home" : "";
  if (kwh < 12) return "Covers most evenings";
  if (kwh < 18) return "Evenings and into the night";
  if (kwh < 26) return "Evening to morning for most homes";
  return "Big homes, EVs and long blackouts";
}
