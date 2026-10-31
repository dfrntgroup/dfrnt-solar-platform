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
