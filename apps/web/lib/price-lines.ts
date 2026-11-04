// "How the price is made", by component: every part of the installed price named in dollars (sell ex GST) before anyone buys.
// Built from the quote's price stack, so it always adds up to the same equipment and installation totals.
import type { Quote } from "@dfrnt/engine";
import { friendlyInverter, friendlyPanel } from "./images";

export interface ComponentLine { label: string; amount: number }

const BRAND_OF: [RegExp, string][] = [[/SOLAX/, "SolaX"], [/SGR/, "Sungrow"], [/GW/, "GoodWe"], [/SIG/, "Sigenergy"]];
const brandOf = (sku: string) => BRAND_OF.find(([re]) => re.test(sku))?.[1] ?? "";

export function componentLines(q: Quote, panels: number): ComponentLine[] {
  const c = q.config;
  const moduleSkus = new Set(c.bom.filter((b) => b.serial === "module").map((b) => b.sku));
  const out: ComponentLine[] = [];
  let parts = 0, materials = 0, backupParts = 0;
  for (const raw of q.stack.lines) {
    const l = { ...raw, sell_ex_gst: raw.sell_ex_gst ?? 0 };
    if (!l.sell_ex_gst && l.kind !== "installation") continue;
    if (l.kind === "hardware" && l.code.startsWith("PNL-")) out.push({ label: `${l.qty} × ${friendlyPanel(l.description)} panels`, amount: l.sell_ex_gst });
    else if (l.code.startsWith("MNT-")) out.push({ label: `Racking for a ${/tile/i.test(l.description) ? "tile" : /klip/i.test(l.description) ? "Klip-Lok" : "tin"} roof`, amount: l.sell_ex_gst });
    else if (l.kind === "hardware" && l.code.startsWith("INV-")) out.push({ label: `${friendlyInverter(c.inverter?.model ?? l.description, c.inverter?.ac_w)} inverter`, amount: l.sell_ex_gst });
    else if (l.kind === "hardware" && moduleSkus.has(l.code)) out.push({ label: `${l.qty} × ${brandOf(l.code)} ${l.description.replace(/\s*\(.*\)$/, "")}${c.usable_kwh ? ` (${c.usable_kwh} kWh usable)` : ""}`, amount: l.sell_ex_gst });
    else if (l.kind === "hardware" && l.code.startsWith("EV-")) out.push({ label: l.description, amount: l.sell_ex_gst });
    else if (l.kind === "hardware" && /GATEWAY|EPS|MATEBOX|CHANGEOVER/i.test(l.code)) backupParts += l.sell_ex_gst;
    else if (l.kind === "hardware" || l.kind === "bos") { if (l.kind === "bos") materials += l.sell_ex_gst; else parts += l.sell_ex_gst; }
    else if (l.kind === "installation") {
      const code = l.code;
      const label = code === "SVC-SOLAR-INSTALL" ? `Solar installation (${panels} panels, licensed electrician)`
        : code === "SVC-BATTERY-INSTALL" ? "Battery installation"
        : code === "SVC-BAT-ADD" ? `Second battery tower installation${l.qty > 1 ? ` × ${l.qty}` : ""}`
        : code.startsWith("SVC-METER") ? "Meter and monitoring connection"
        : code === "SVC-3P-PROPERTY" ? "Three-phase switchboard work"
        : code.startsWith("SVC-EPS") ? "Whole-home backup switchover"
        : l.description;
      if (l.sell_ex_gst || raw.sell_ex_gst === null) out.push({ label, amount: l.sell_ex_gst });
    } else if (l.kind === "variation") out.push({ label: l.description, amount: l.sell_ex_gst });
  }
  if (parts) out.push({ label: "Battery management and mounting parts", amount: parts });
  if (backupParts) out.push({ label: "Backup switchgear", amount: backupParts });
  if (materials) out.push({ label: "Standard materials", amount: materials });
  // Keep equipment before installation, in the order built above (panels, racking, inverter, battery, parts…, then labour).
  const rank = (x: ComponentLine) => /installation|connection|switchboard|switchover/i.test(x.label) ? 1 : 0;
  return out.sort((a, b) => rank(a) - rank(b));
}
