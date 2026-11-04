// Product images by SKU. Manufacturer imagery from the live store; other brands show a spec tile until photos arrive.
const MAP: [RegExp, string, string][] = [
  [/^PNL-RISEN/, "/img/panel-risen.webp", "Risen 475 W panel"],
  [/^INV-SOLAX-VAST/, "/img/inv-solax-x1-vast.webp", "SolaX X1-VAST inverter"],
  [/^INV-SOLAX-HYB/, "/img/inv-solax-x3.webp", "SolaX X3-Hybrid inverter"],
  [/^PRT-SOLAX-TB-HS51/, "/img/bat-solax-hs51.webp", "SolaX T-BAT HS51 battery"],
];
export function imageFor(sku: string | undefined) {
  const m = sku ? MAP.find(([re]) => re.test(sku)) : undefined;
  return m ? { src: m[1], alt: m[2] } : null;
}

/** Friendly names for the parts people see. */
export function friendlyInverter(model: string | undefined, acW?: number) {
  if (!model) return "";
  const kw = acW ? `${Math.round(acW / 100) / 10} kW` : "";
  if (model.startsWith("X1-VAST")) return `SolaX X1-VAST ${kw} hybrid`;
  if (model.startsWith("X3-Hybrid")) return `SolaX X3-Hybrid ${kw} three-phase`;
  if (/^SH\d+T$/.test(model)) return `Sungrow ${model} ${kw} three-phase`;
  if (model.startsWith("SH")) return `Sungrow ${model} ${kw} hybrid`;
  if (model.includes("EHA")) return `GoodWe ESA ${kw} hybrid`;
  if (model.includes("ETA")) return `GoodWe ESA ${kw} three-phase`;
  if (model.startsWith("EC")) return `Sigenergy ${model}`;
  return `${model} ${kw}`;
}
export function friendlyPanel(model: string | undefined) {
  if (!model) return "";
  if (model.startsWith("RSM96")) return "Risen 475 W N-type";
  if (model.startsWith("LR7-54HVH")) return "Longi Hi-MO X10 475 W";
  if (model.startsWith("LR7-54HVB")) return "Longi Hi-MO X10 475 W all-black";
  if (model.startsWith("TSM")) return "Trina Vertex S+ 475 W";
  return model;
}

/** Swap part codes in a config summary for names people recognise. */
export function friendlySummary(summary: string | undefined) {
  if (!summary) return "";
  return summary
    .replace(/RSM96-11-475BNDG/g, "Risen 475 W panels").replace(/LR7-54HV[HB]-475M/g, "Longi 475 W panels").replace(/TSM-475NEG9RH\.28/g, "Trina 475 W panels")
    .replace(/X1-VAST-(\d+)K/g, "SolaX X1-VAST $1 kW inverter").replace(/X3-Hybrid-([\d.]+)-D/g, "SolaX X3-Hybrid $1 kW inverter")
    .replace(/(\d+)× TB-HS51/g, "$1 SolaX battery modules").replace(/TB-HS51/g, "SolaX battery module")
    .replace(/GW([\d.]+)K-EHA-G20/g, "GoodWe ESA $1 kW inverter").replace(/GW([\d.]+)K-ETA-G20/g, "GoodWe ESA $1 kW three-phase inverter")
    .replace(/SH([\d.]+)RS/g, "Sungrow SH$1RS inverter").replace(/\bSH(\d+)T\b/g, "Sungrow SH$1T three-phase inverter");
}

/** Plain-words version of engine warnings shown to customers. */
export function friendlyWarning(w: string) {
  const m = w.match(/^Battery limited to ([\d.]+) kW/);
  if (m) return `Battery delivers up to ${m[1]} kW at once`;
  return w;
}
