// Manufacturer warranties for every product we sell (Australian terms), checked 3 Nov 2026.
// `confirmed: false` means the published documents disagree for this exact model: the site says we confirm it
// for the customer's panel before they sign, and never prints a number we can't stand behind.
export interface Warranty { part: "Panels" | "Inverter" | "Battery"; brand: string; product: string; years: number | null; performance?: string; note?: string; confirmed: boolean; source: string }

export const WARRANTIES: Record<string, Warranty> = {
  "PNL-RISEN-475": { part: "Panels", brand: "Risen", product: "RSM96 475 W (n-type, dual glass)", years: null, performance: "30-year power warranty", confirmed: false,
    note: "Risen Australia residential rooftop warranty", source: "Risen Australia residential warranty (2022 extension to 25 years for selected models); global TOPCon datasheets list 15" },
  "PNL-LONGI-475": { part: "Panels", brand: "LONGi", product: "Hi-MO X10 Explorer 475 W", years: 15, performance: "30-year power warranty", confirmed: true, source: "LONGi LR7-54HVH-475M, Australian listing" },
  "INV-SOLAX-VAST": { part: "Inverter", brand: "SolaX", product: "X1-VAST", years: 10, note: "Keep it connected to SolaX Cloud (we set this up)", confirmed: true, source: "SolaX Warranty Terms & Conditions (Australia)" },
  "INV-SOLAX-HYB": { part: "Inverter", brand: "SolaX", product: "X3-Hybrid G4", years: 10, note: "Keep it connected to SolaX Cloud (we set this up)", confirmed: true, source: "SolaX Warranty Terms & Conditions (Australia)" },
  "INV-SGR-SH": { part: "Inverter", brand: "Sungrow", product: "SH-RS hybrid", years: 10, confirmed: true, source: "Sungrow Inverters 10-Year Limited Warranty (Australia)" },
  "INV-SGR-SH15T": { part: "Inverter", brand: "Sungrow", product: "SH-T three-phase hybrid", years: 10, confirmed: true, source: "Sungrow Inverters 10-Year Limited Warranty (Australia)" },
  "INV-GW-EHA": { part: "Inverter", brand: "GoodWe", product: "ESA single phase (EHA)", years: 10, confirmed: true, source: "GoodWe Limited Warranty for ESA 3–10 kW (AU/NZ)" },
  "INV-GW-ETA": { part: "Inverter", brand: "GoodWe", product: "ESA three phase (ETA)", years: 10, confirmed: true, source: "GoodWe Limited Warranty for Inverter System (AU/NZ)" },
  "BAT-SOLAX-HS51": { part: "Battery", brand: "SolaX", product: "T-BAT HS51", years: 10, performance: "70% of capacity at 10 years", confirmed: true, source: "SolaX warranty table, T-BAT HS" },
  "BAT-SGR-SBH": { part: "Battery", brand: "Sungrow", product: "SBH", years: 10, performance: "70% of capacity at 10 years", note: "After year 5 Sungrow covers the battery itself; labour and freight are not included", confirmed: true, source: "Sungrow battery warranty (Australia)" },
  "BAT-GW-LXD": { part: "Battery", brand: "GoodWe", product: "Lynx D G2 9.0", years: 10, performance: "70% of usable energy at 10 years", confirmed: true, source: "GoodWe Limited Warranty for LX D G2 BAT 6.0 & 9.0 (AU/NZ)" },
};

/** Map a bill-of-materials SKU to its warranty entry. */
export function warrantyFor(sku: string): Warranty | null {
  if (WARRANTIES[sku]) return WARRANTIES[sku]!;
  if (sku.startsWith("PNL-LONGI-475")) return WARRANTIES["PNL-LONGI-475"]!;
  if (sku.startsWith("INV-SOLAX-VAST")) return WARRANTIES["INV-SOLAX-VAST"]!;
  if (sku.startsWith("INV-SOLAX-HYB")) return WARRANTIES["INV-SOLAX-HYB"]!;
  if (sku.startsWith("INV-SGR-SH15T")) return WARRANTIES["INV-SGR-SH15T"]!;
  if (sku.startsWith("INV-SGR-SH")) return WARRANTIES["INV-SGR-SH"]!;
  if (sku.startsWith("INV-GW-EHA")) return WARRANTIES["INV-GW-EHA"]!;
  if (sku.startsWith("INV-GW-ETA")) return WARRANTIES["INV-GW-ETA"]!;
  if (sku.startsWith("PRT-SOLAX-HS51") || sku.includes("TB-HS51")) return WARRANTIES["BAT-SOLAX-HS51"]!;
  if (sku.startsWith("PRT-SGR-SBH") || sku.includes("SMR050")) return WARRANTIES["BAT-SGR-SBH"]!;
  if (sku.startsWith("PRT-GW-LX-D")) return WARRANTIES["BAT-GW-LXD"]!;
  return null;
}

export const yearsText = (w: Warranty) => (w.years ? `${w.years} years` : "confirmed for your model");
