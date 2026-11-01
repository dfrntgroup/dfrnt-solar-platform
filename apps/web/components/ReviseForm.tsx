// C6: change the design (panels, battery, backup, named work). Priced on the job's own locked prices; the customer accepts or keeps the original.
import { configOptions } from "@dfrnt/engine";
import type { QuoteRow } from "@/lib/jobs";
import { pricingDataFor } from "@/lib/pricing-data";
import { aud } from "@/lib/site";
import { input } from "./Admin";

const WORK = ["SVC-SWB-HALF", "SVC-SWB-FULL", "SVC-BAT-SLAB", "SVC-CABLE-1P", "SVC-CABLE-3P", "SVC-TERRACOTTA", "SVC-INST-2STY", "SVC-TRAVEL"];

export async function ReviseForm({ q, action, hidden }: { q: QuoteRow; action: (f: FormData) => Promise<void>; hidden: React.ReactNode }) {
  const data = await pricingDataFor(q.result.versions);
  const o = configOptions(q.input, data.rules);
  const cur = q.input;
  const items = data.menu.items.filter((i) => WORK.includes(i.code));
  return (
    <form action={action} className="card" style={{ marginBottom: 12 }}>{hidden}
      <strong>Change the design</strong>
      <span className="small muted">Panel count, battery size, backup or extra work. Priced on this job&apos;s locked prices and rebate date; the customer sees old against new and accepts or keeps the original.</span>
      {q.revision && <span className="small note">Waiting on the customer: {aud(q.revision.from.amount)} → {aud(q.revision.priced.stack.amount_payable)}. Sending a new one replaces it.</span>}
      {cur.panelCount > 0 && <label className="small">Panels<select name="panels" defaultValue={String(cur.panelCount)} style={input}>{o.panels.map((n) => <option key={n} value={n}>{n} × {o.panelW} W ({(n * o.panelW / 1000).toFixed(2)} kW)</option>)}</select></label>}
      {cur.panelCount === 0 && <input type="hidden" name="panels" value="0" />}
      <label className="small">Battery modules<select name="modules" defaultValue={String(cur.batteryModules)} style={input}>{o.modules.map((m) => <option key={m} value={m}>{m} ({Math.round(m * o.moduleKwh * 10) / 10} kWh)</option>)}</select></label>
      {o.backup ? <label className="small">Backup<select name="backup" defaultValue={cur.backup} style={input}><option value="none">Essential circuits / none</option><option value="whole_home">Whole home</option></select></label> : <input type="hidden" name="backup" value="none" />}
      <span className="small">Extra work the photos show:</span>
      {items.map((i) => <label key={i.code} className="small"><input type="checkbox" name="codes" value={i.code} /> {i.description}</label>)}
      <input name="reason" placeholder="Why (the customer reads this)" style={input} required />
      <button className="btn ghost" type="submit">Send the change to the customer</button>
    </form>
  );
}
