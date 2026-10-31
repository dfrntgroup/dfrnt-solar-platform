"use client";
import { useEffect, useRef, useState } from "react";

interface Price { ok: boolean; summary: string; solar_kw: number; usable_kwh: number; inverter?: string; towers: number; you_pay: number; before_rebates: number; rebates: number; gst: number; equipment: number; installation: number; solar_stcs: number; battery_stcs: number; warnings: string[]; blockers: string[] }
const aud = (n: number, d = 0) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: d, minimumFractionDigits: d });

export function Configurator(props: {
  slug: string; postcode: string; panels: number[]; modules: number[]; backupAvailable: boolean; moduleKwh: number; panelW: number;
  start: { panels: number; modules: number }; initial: Price; lockUntil: string;
  secure: (f: FormData) => Promise<void>;
}) {
  const [panels, setPanels] = useState(props.start.panels);
  const [modules, setModules] = useState(props.start.modules);
  const [backup, setBackup] = useState<"none" | "whole_home">("none");
  const [p, setP] = useState<Price>(props.initial);
  const [busy, setBusy] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setBusy(true);
    const t = setTimeout(async () => {
      const r = await fetch("/api/v1/price", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: props.slug, panels, modules, backup, postcode: props.postcode }) });
      if (r.ok) setP(await r.json());
      setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [panels, modules, backup, props.slug, props.postcode]);

  const step = (list: number[], v: number, dir: 1 | -1) => { const i = list.indexOf(v); return list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))] ?? v; };
  const Stepper = ({ label, value, sub, list, set }: { label: string; value: number; sub: string; list: number[]; set: (n: number) => void }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--line)" }}>
      <div><strong>{label}</strong><div className="small muted">{sub}</div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" className="btn ghost sm" aria-label={`Fewer ${label}`} disabled={list.indexOf(value) <= 0} onClick={() => set(step(list, value, -1))}>−</button>
        <strong style={{ minWidth: 28, textAlign: "center" }}>{value}</strong>
        <button type="button" className="btn ghost sm" aria-label={`More ${label}`} disabled={list.indexOf(value) >= list.length - 1} onClick={() => set(step(list, value, 1))}>+</button>
      </div>
    </div>);

  return (
    <div>
      {props.panels.length > 0 && <Stepper label="Solar panels" value={panels} sub={`${(panels * props.panelW / 1000).toFixed(2)} kW`} list={props.panels} set={setPanels} />}
      {props.modules.length > 0 && <Stepper label="Battery modules" value={modules} sub={`${Math.round(modules * props.moduleKwh * 10) / 10} kWh usable${p.towers > 1 ? ` · ${p.towers} towers` : ""}`} list={props.modules} set={setModules} />}
      {props.backupAvailable && (
        <label style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--line)", cursor: "pointer" }}>
          <span><strong>Whole-home backup</strong><div className="small muted">Keeps the house running in a blackout</div></span>
          <input type="checkbox" checked={backup === "whole_home"} onChange={(e) => setBackup(e.target.checked ? "whole_home" : "none")} />
        </label>)}
      <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 12, opacity: busy ? 0.5 : 1, transition: "opacity .15s" }}>
        <div className="pay"><small>You pay, installed</small>{aud(p.you_pay)}</div>
        <p className="before">{aud(p.before_rebates)} before {aud(p.rebates)} rebates · inc GST</p>
        <p className="small muted">{p.inverter} inverter · {p.solar_kw > 0 ? `${p.solar_kw} kW solar · ` : ""}{p.usable_kwh} kWh battery</p>
        {p.warnings.length > 0 && <p className="small muted">{p.warnings.join(" · ")}</p>}
        {!p.ok && <div className="note small">{p.blockers.join(" · ")}</div>}
        <details className="small" style={{ margin: "8px 0" }}><summary>How the price is made</summary>
          <table className="lines"><tbody>
            <tr><td>Equipment</td><td className="r">{aud(p.equipment, 2)}</td></tr>
            <tr><td>Installation</td><td className="r">{aud(p.installation, 2)}</td></tr>
            <tr><td>GST (on the full price before rebates)</td><td className="r">{aud(p.gst, 2)}</td></tr>
            <tr><td>Less assignment of STCs ({p.solar_stcs + p.battery_stcs})</td><td className="r">−{aud(p.rebates, 2)}</td></tr>
          </tbody></table></details>
      </div>
      <form action={props.secure}>
        <input type="hidden" name="slug" value={props.slug} /><input type="hidden" name="postcode" value={props.postcode} />
        <input type="hidden" name="panels" value={panels} /><input type="hidden" name="modules" value={modules} /><input type="hidden" name="backup" value={backup} />
        <button className="btn block" type="submit" disabled={!p.ok || busy}>Secure this price for 14 days</button>
      </form>
      <p className="small muted">No payment now. Price and rebate locked until {props.lockUntil}.</p>
    </div>
  );
}
