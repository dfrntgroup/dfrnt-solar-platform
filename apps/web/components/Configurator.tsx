"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "./Analytics";
import { outcome } from "@/lib/outcome";
import { friendlySummary, friendlyWarning } from "@/lib/images";

interface Price { ok: boolean; summary: string; solar_kw: number; usable_kwh: number; inverter?: string; towers: number; you_pay: number; before_rebates: number; rebates: number; gst: number; equipment: number; installation: number; solar_stcs: number; battery_stcs: number; warnings: string[]; blockers: string[];
  lines?: { label: string; amount: number }[]; steps?: { panel: { down: number | null; up: number | null }; modules: Record<number, number> } | null;
  inverters?: { sku: string; model: string; kw: number; you_pay: number | null; current: boolean; reason: string; blocker?: string }[]; inverter_sku?: string }
const aud = (n: number, d = 0) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: d, minimumFractionDigits: d });
const delta = (n: number | null | undefined) => n == null ? "" : n === 0 ? "same price" : `${n > 0 ? "+" : "−"}${aud(Math.abs(n))}`;

export function Configurator(props: {
  slug: string; postcode: string; panels: number[]; modules: number[]; backupAvailable: boolean; moduleKwh: number; panelW: number;
  start: { panels: number; modules: number; inverter?: string }; initial: Price; lockUntil: string;
  /** false = no installer covers this postcode: show the waitlist instead of Secure. */
  served?: boolean;
  secure: (f: FormData) => Promise<void>;
}) {
  const [panels, setPanels] = useState(props.start.panels);
  const [modules, setModules] = useState(props.start.modules);
  const [backup, setBackup] = useState<"none" | "whole_home">("none");
  const [inverter, setInverter] = useState<string | undefined>(props.start.inverter);
  const [p, setP] = useState<Price>(props.initial);
  const [busy, setBusy] = useState(false);
  const first = useRef(true);
  const router = useRouter();

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setBusy(true);
    track("configure", { slug: props.slug, panels, modules, backup, inverter });
    const t = setTimeout(async () => {
      const r = await fetch("/api/v1/price", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: props.slug, panels, modules, backup, postcode: props.postcode, inverterSku: inverter }) });
      if (r.ok) {
        setP(await r.json());
        // Re-render the rest of the page (what it does, the kit, how the price is made) for these counts.
        const q = new URLSearchParams(window.location.search);
        q.set("panels", String(panels)); q.set("modules", String(modules)); if (inverter) q.set("inverter", inverter); else q.delete("inverter");
        router.replace(`${window.location.pathname}?${q}`, { scroll: false });
      }
      setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [panels, modules, backup, inverter, props.slug, props.postcode]);

  useEffect(() => {
    if (!p.ok || (panels === props.start.panels && modules === props.start.modules)) return;
    const kw = Math.round(p.solar_kw * 10) / 10, kwh = Math.round(p.usable_kwh * 10) / 10;
    const t = document.getElementById("sys-title"), o = document.getElementById("sys-outcome");
    if (t) t.textContent = kwh ? `${kw} kW solar + ${kwh} kWh battery` : `${kw} kW solar`;
    if (o) o.textContent = outcome(p.usable_kwh, p.solar_kw);
  }, [p, panels, modules, props.start.panels, props.start.modules]);

  const step = (list: number[], v: number, dir: 1 | -1) => { const i = list.indexOf(v); return list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))] ?? v; };
  const Stepper = ({ label, value, sub, list, set, down, up }: { label: string; value: number; sub: string; list: number[]; set: (n: number) => void; down?: number | null; up?: number | null }) => (
    <div className="cfg-row">
      <div><strong>{label}</strong><div className="small muted">{sub}</div></div>
      <div className="stepper">
        <button type="button" aria-label={`Fewer ${label}${down != null ? `, ${delta(down)}` : ""}`} disabled={list.indexOf(value) <= 0} onClick={() => set(step(list, value, -1))}>−{down != null && <small>{delta(down)}</small>}</button>
        <output>{value}</output>
        <button type="button" aria-label={`More ${label}${up != null ? `, ${delta(up)}` : ""}`} disabled={list.indexOf(value) >= list.length - 1} onClick={() => set(step(list, value, 1))}>+{up != null && <small>{delta(up)}</small>}</button>
      </div>
    </div>);
  const modDelta = (m: number) => { const v = p.steps?.modules[m]; return v == null || m === modules ? null : Math.round(v - p.you_pay); };

  return (
    <div>
      {props.panels.length > 0 && <Stepper label="Solar panels" value={panels} sub={`${(panels * props.panelW / 1000).toFixed(2)} kW · the buttons show what one panel more or fewer costs after rebates`} list={props.panels} set={setPanels} down={p.steps?.panel.down} up={p.steps?.panel.up} />}
      {(p.inverters?.length ?? 0) > 1 && (
        <div className="cfg-row" style={{ display: "block" }}>
          <div><strong>Inverter</strong><div className="small muted">Chosen for this system. Pick a bigger one for more battery power and room to add panels later.</div></div>
          <div className="pills" role="group" aria-label="Inverter">{p.inverters!.map((o) => {
            const here = p.inverters!.find((x) => x.current)?.you_pay ?? p.you_pay;
            return <button key={o.sku} type="button" className={o.current ? "on" : ""} disabled={o.you_pay == null} title={o.blocker ?? o.reason} onClick={() => setInverter(o.sku)} aria-pressed={o.current}>{o.kw}<small>kW</small>{o.current ? <span className="delta">current</span> : o.you_pay == null ? <span className="delta">doesn&apos;t fit</span> : <span className="delta">{delta(o.you_pay - here)}</span>}</button>; })}</div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>{p.inverters!.find((x) => x.current)?.reason}{props.panels.length > 0 && panels >= (props.panels[props.panels.length - 1] ?? 0) && p.inverters!.some((x) => !x.current && x.you_pay != null && x.kw > (p.inverters!.find((y) => y.current)?.kw ?? 0)) ? " · at this inverter's panel limit: pick a bigger one to go further" : ""}</p>
        </div>)}
      {props.modules.length > 0 && (
        <div className="cfg-row" style={{ display: "block" }}>
          <div><strong>Battery size</strong><div className="small muted">{modules} module{modules === 1 ? "" : "s"} of {props.moduleKwh} kWh · usable capacity{p.towers > 1 ? ` · ${p.towers} towers` : ""} · each size shows what it adds or saves</div></div>
          <div className="pills" role="group" aria-label="Battery size">{props.modules.map((m) => (
            <button key={m} type="button" className={m === modules ? "on" : ""} onClick={() => setModules(m)} aria-pressed={m === modules}>{Math.round(m * props.moduleKwh * 10) / 10}<small>kWh</small>{m === modules ? <span className="delta">current</span> : modDelta(m) != null && <span className="delta">{delta(modDelta(m))}</span>}</button>))}</div>
        </div>)}
      {props.backupAvailable && (
        <label style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--line)", cursor: "pointer" }}>
          <span><strong>Whole-home backup</strong><div className="small muted">Keeps the house running in a blackout</div></span>
          <input type="checkbox" checked={backup === "whole_home"} onChange={(e) => setBackup(e.target.checked ? "whole_home" : "none")} />
        </label>)}
      <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 12, opacity: busy ? 0.5 : 1, transition: "opacity .15s" }}>
        <div className="pay"><small>You pay, installed</small>{aud(p.you_pay)}</div>
        <p className="before">{aud(p.before_rebates)} before {aud(p.rebates)} rebates · inc GST</p>
        <p className="small muted">{friendlySummary(p.inverter ?? "")}{/inverter$/.test(friendlySummary(p.inverter ?? "")) ? "" : " inverter"} · {p.solar_kw > 0 ? `${p.solar_kw} kW solar · ` : ""}{p.usable_kwh} kWh battery</p>
        {p.warnings.length > 0 && <p className="small muted">{p.warnings.map(friendlyWarning).join(" · ")}</p>}
        {!p.ok && <div className="note small">{p.blockers.join(" · ")}</div>}
        <details className="small" style={{ margin: "8px 0" }}><summary>How the price is made</summary>
          <table className="lines"><tbody>
            {p.lines?.length ? p.lines.map((l, i) => <tr key={i}><td>{l.label}</td><td className="r">{aud(l.amount, 2)}</td></tr>) : <>
              <tr><td>Equipment</td><td className="r">{aud(p.equipment, 2)}</td></tr>
              <tr><td>Installation</td><td className="r">{aud(p.installation, 2)}</td></tr></>}
            <tr><td>GST (on the full price before rebates)</td><td className="r">{aud(p.gst, 2)}</td></tr>
            <tr><td>Less assignment of STCs ({p.solar_stcs + p.battery_stcs})</td><td className="r">−{aud(p.rebates, 2)}</td></tr>
          </tbody></table></details>
      </div>
      <form id="secure-form" action={props.secure} onSubmit={() => track("secure_click", { slug: props.slug, panels, modules, backup })}>
        <input type="hidden" name="slug" value={props.slug} /><input type="hidden" name="postcode" value={props.postcode} />
        <input type="hidden" name="panels" value={panels} /><input type="hidden" name="modules" value={modules} /><input type="hidden" name="backup" value={backup} />{inverter && <input type="hidden" name="inverter" value={inverter} />}
        {props.served === false
          ? <a className="btn block" href={`/contact?kind=waitlist&postcode=${props.postcode}`}>Join the waitlist for {props.postcode}</a>
          : <button className="btn block" type="submit" disabled={!p.ok || busy}>Secure this price for 14 days</button>}
      </form>
      {props.served === false
        ? <p className="small muted">We don&apos;t install at {props.postcode} yet. This is the price you&apos;d pay once an installer covers your area; we&apos;ll email you when one does.</p>
        : <p className="small muted">No payment now. Price and rebate locked until {props.lockUntil}.</p>}
      <div className="paybar" style={{ opacity: busy ? 0.6 : 1 }}>
        <div><div className="small muted" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700 }}>You pay, installed</div><div className="pay">{aud(p.you_pay)}</div></div>
        {props.served === false
          ? <a className="btn" href={`/contact?kind=waitlist&postcode=${props.postcode}`}>Join waitlist →</a>
          : <button className="btn" type="submit" form="secure-form" disabled={!p.ok || busy}>Secure price →</button>}
      </div>
      <div className="paybar-space" style={{ height: 70 }} />
    </div>
  );
}
