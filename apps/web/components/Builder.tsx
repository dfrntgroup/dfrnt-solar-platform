"use client";
import { useEffect, useRef, useState } from "react";
import { track } from "./Analytics";
import { outcome } from "@/lib/outcome";
import { friendlyInverter, friendlyWarning } from "@/lib/images";
import type { BuildChoice, BuildOptions } from "@/lib/builder";
import type { BuildExtras } from "@/lib/builder-extras";
import { Share } from "./Share";

type Opts = BuildOptions & BuildExtras;
const aud = (n: number, d = 0) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: d, minimumFractionDigits: d });
const r1 = (n: number) => Math.round(n * 10) / 10;
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function Builder(props: { postcode: string; initial: Opts; served: boolean; changed?: boolean; saved?: string; secure: (f: FormData) => Promise<void>; save: (f: FormData) => Promise<void>; trust?: React.ReactNode }) {
  const [o, setO] = useState<Opts>(props.initial);
  const [want, setWant] = useState<BuildChoice>(props.initial.choice);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null); // phone: which finished step is reopened
  // What the server last settled on; choices show straight away and the server's answer replaces them.
  const settled = useRef(JSON.stringify(props.initial.choice));
  const seq = useRef(0);
  const c: BuildChoice = want;

  useEffect(() => {
    if (JSON.stringify(want) === settled.current) return;
    setBusy(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const r = await fetch("/api/v1/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...want, postcode: props.postcode }) });
      if (mine !== seq.current) return; // a newer choice is on its way
      if (r.ok) {
        const n: Opts = await r.json();
        settled.current = JSON.stringify(n.choice);
        setO(n); setWant(n.choice);
        const ch = n.choice;
        track("build_step", { phases: ch.phases, family: ch.family, inverter: ch.inverterSku, modules: ch.modules, panel: ch.panelSku ?? "none", panels: ch.panels, backup: !!ch.backup });
        const q = new URLSearchParams({ ph: String(ch.phases) });
        if (ch.family) q.set("f", ch.family); if (ch.inverterSku) q.set("inv", ch.inverterSku); if (ch.modules) q.set("m", String(ch.modules));
        if (ch.panelSku === null) q.set("p", "none"); else if (ch.panelSku) { q.set("p", ch.panelSku); if (ch.panels) q.set("n", String(ch.panels)); }
        if (ch.backup) q.set("b", "1");
        window.history.replaceState(null, "", `/build?${q}`);
      }
      setBusy(false);
    }, 200);
    return () => clearTimeout(t);
  }, [want, props.postcode]);

  const set = (patch: Partial<BuildChoice>) => setWant((w) => ({ ...w, ...patch }));
  const inv = o.inverters.find((i) => i.sku === c.inverterSku);
  const validModules = o.modules.filter((m) => m.ok).map((m) => m.n);
  // Show every size that works, and greyed ones only below the smallest (to explain the minimum). Same sizes as product pages.
  const shownModules = o.modules.filter((m) => m.ok || m.n < (validModules[0] ?? 0));
  const why = shownModules.find((m) => !m.ok)?.why;
  const step = (list: number[], v: number | undefined, dir: 1 | -1) => { const i = list.indexOf(v ?? -1); return list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))]; };
  const p = o.price;
  const panel = o.panels.find((x) => x.sku === c.panelSku);

  return (
    <div className="pdp" style={{ alignItems: "start" }}>
      <div>
        {props.changed && <div className="note small" style={{ marginBottom: 12 }}>One of your choices doesn&apos;t work with the rest, so we&apos;ve moved it to the nearest one that does. Check it below.</div>}
        <div className={`bstep${c.family ? " done" : ""}${open === 1 ? " open" : ""}`}><h3><span className="n">01</span>Your home</h3>
          <Sum show={c.phases === 3 ? "Three phase" : "Single phase"} onChange={() => setOpen(1)} />
          <div className="bopts bfull">
            {([1, 3] as const).map((ph) => (
              <button key={ph} type="button" className={`bopt${c.phases === ph ? " on" : ""}`} aria-pressed={c.phases === ph} onClick={() => { setWant({ phases: ph }); setOpen(null); }}>
                <strong>{ph === 1 ? "Single phase" : "Three phase"}</strong><span>{ph === 1 ? "Most homes. Not sure? Your switchboard photo tells us." : "Bigger homes, pools, EV chargers"}</span></button>))}
          </div></div>

        <div className={`bstep${c.family ? " done" : ""}${open === 2 ? " open" : ""}`}><h3><span className="n">02</span>Brand</h3>
          <Sum show={o.brands.find((b) => b.family === c.family)?.brand ?? ""} onChange={() => setOpen(2)} />
          <div className="bopts bfull">
            {o.brands.map((b) => (
              <button key={b.family} type="button" className={`bopt${c.family === b.family ? " on" : ""}`} aria-pressed={c.family === b.family} onClick={() => { setWant({ phases: c.phases, family: b.family }); setOpen(null); }}>
                <strong>{b.brand}</strong><span>10 yr inverter warranty{b.family_price ? ` · Family size (${b.family_title}) ${aud(b.family_price)}` : b.from ? ` · systems from ${aud(b.from)}` : ""}{b.battery_from ? ` · battery only from ${aud(b.battery_from)}` : ""}</span></button>))}
          </div></div>

        {c.family && <div className={`bstep${c.inverterSku ? " done" : ""}${open === 3 ? " open" : ""}`}><h3><span className="n">03</span>Inverter</h3>
          <Sum show={inv ? `${inv.kw} kW · ${inv.model}` : ""} onChange={() => setOpen(3)} />
          <div className="bopts bfull">
            {o.inverters.map((i) => (
              <button key={i.sku} type="button" className={`bopt${c.inverterSku === i.sku ? " on" : ""}`} aria-pressed={c.inverterSku === i.sku} onClick={() => { set({ inverterSku: i.sku }); setOpen(null); }}>
                <strong>{o.brands.find((b) => b.family === c.family)?.brand} {i.kw} kW</strong>
                <span>{i.model} · {i.batteryOnly ? "battery only, keeps your solar" : i.maxPanels ? `up to ${i.maxPanels} panels` : "panels checked on your roof"}{i.batteryKw ? ` · battery ${i.batteryKw} kW` : ""}{i.backup ? " · whole-home backup" : ""}</span></button>))}
          </div></div>}

        {c.inverterSku && <div className="bstep"><h3><span className="n">04</span>Battery</h3>
          <div className="pills" role="group" aria-label="Battery modules">
            {shownModules.map((m) => (
              <button key={m.n} type="button" className={m.n === c.modules ? "on" : ""} aria-pressed={m.n === c.modules} disabled={!m.ok} title={m.why} onClick={() => set({ modules: m.n })}>
                {r1(m.kwh)}<small>{m.n} module{m.n === 1 ? "" : "s"}</small></button>))}
          </div>
          <p className="small muted">{p?.moduleLabel ?? o.moduleName} · {validModules.length ? `${validModules[0]} to ${validModules.at(-1)} modules on this inverter` : ""}
            {p?.powerKw ? ` · delivers up to ${p.powerKw} kW` : ""}{p?.batteryRebate ? ` · battery rebate ${aud(p.batteryRebate)}` : ""}{c.modules && p ? ` · ${outcome(p.kwh, p.kw)}` : ""}</p>
          {o.sizeNote && <div className="note small" style={{ margin: "8px 0" }}>{o.sizeNote} <a href="/estimate">Check it against my bill</a></div>}
          {why && validModules[0] && <p className="small muted">Greyed sizes are too small for this inverter: it needs at least {validModules[0]} modules.</p>}
        </div>}

        {c.inverterSku && <div className="bstep"><h3><span className="n">05</span>Panels</h3>
          <div className="bopts">
            <button type="button" className={`bopt${c.panelSku === null ? " on" : ""}`} aria-pressed={c.panelSku === null} onClick={() => set({ panelSku: null })}>
              <strong>I already have solar</strong><span>Battery only</span></button>
            {!inv?.batteryOnly && o.panels.map((x) => (
              <button key={x.sku} type="button" className={`bopt${c.panelSku === x.sku ? " on" : ""}`} aria-pressed={c.panelSku === x.sku} onClick={() => set({ panelSku: x.sku })}>
                <strong>{x.name}</strong><span>{x.sku.includes("RISEN") ? "n-type, dual glass" : "Hi-MO X10"}{x.costDelta ? ` · +${aud(x.costDelta)} a panel` : ""}</span></button>))}
          </div>
          {inv?.batteryOnly && <p className="small muted">The {inv.model} runs a battery alongside your existing solar. Pick the bigger inverter to add panels.</p>}
          {c.panelSku && o.panelRange.length > 0 && <>
            <div className="cfg-row">
              <div><strong>{c.panels} panels</strong><div className="small muted">{r1((c.panels ?? 0) * (panel?.watts ?? 475) / 1000)} kW · about {Math.round((c.panels ?? 0) * (panel?.watts ?? 475) / 1000 * o.dayKwhPerKw)} kWh a day here</div></div>
              <div className="stepper">
                <button type="button" aria-label="Fewer panels" disabled={o.panelRange.indexOf(c.panels ?? -1) <= 0} onClick={() => set({ panels: step(o.panelRange, c.panels, -1) })}>−</button>
                <output>{c.panels}</output>
                <button type="button" aria-label="More panels" disabled={o.panelRange.indexOf(c.panels ?? -1) >= o.panelRange.length - 1} onClick={() => set({ panels: step(o.panelRange, c.panels, 1) })}>+</button>
              </div></div>
            <p className="small muted">This inverter takes {o.panelRange[0]} to {o.panelRange.at(-1)} panels. Your roof photo confirms they fit.</p></>}
        </div>}

        {c.inverterSku && o.backupAvailable && <div className="bstep"><h3><span className="n">06</span>Extras</h3>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "6px 0", cursor: "pointer" }}>
            <span><strong>Whole-home backup</strong><div className="small muted">Every circuit stays on in a blackout{p?.backupDelta ? ` · +${aud(p.backupDelta)}` : ""}</div></span>
            <input type="checkbox" checked={!!c.backup} onChange={(e) => set({ backup: e.target.checked })} style={{ width: 22, height: 22 }} />
          </label></div>}
      </div>

      <aside className="buybox" style={{ opacity: busy ? 0.6 : 1, transition: "opacity .15s" }}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>Your system</p>
        {!p ? <p className="muted">Pick a brand and inverter to see your price.</p> : <>
          <div className="pay"><small>You pay, installed</small>{aud(p.you_pay)}</div>
          <p className="before">inc GST, rebates of {aud(p.rebates)} already off · postcode {props.postcode}</p>
          <table className="incl"><tbody>
            {p.kw > 0 && <tr><td className="k">Panels</td><td>{c.panels} × {panel?.name} · {r1(p.kw)} kW</td></tr>}
            <tr><td className="k">Inverter</td><td>{friendlyInverter(p.inverter, inv ? inv.kw * 1000 : undefined)}</td></tr>
            <tr><td className="k">Battery</td><td>{c.modules} × {p.moduleLabel} · {r1(p.kwh)} kWh</td></tr>
            {c.backup && <tr><td className="k">Backup</td><td>Whole-home, included</td></tr>}
            <tr><td className="k">Install</td><td>{p.kw > 0 ? "Racking, " : ""}cabling, meter and installation included</td></tr>
          </tbody></table>
          {p.warnings.length > 0 && <p className="small muted">{p.warnings.map(friendlyWarning).join(" · ")}</p>}
          {!p.ok && <div className="note small">{p.blockers.join(" · ")}</div>}
          <details className="small" style={{ margin: "8px 0" }}><summary>How the price is made</summary>
            <table className="lines"><tbody>
              <tr><td>Equipment</td><td className="r">{aud(p.equipment, 2)}</td></tr>
              <tr><td>Installation</td><td className="r">{aud(p.installation, 2)}</td></tr>
              <tr><td>GST (on the full price before rebates)</td><td className="r">{aud(p.gst, 2)}</td></tr>
              <tr><td>Price before rebates</td><td className="r">{aud(p.before, 2)}</td></tr>
              <tr><td>Less assignment of STCs ({p.stcs})</td><td className="r">−{aud(p.rebates, 2)}</td></tr>
            </tbody></table></details>
          {o.nearest && <p className="small" style={{ margin: "8px 0" }}>Close to our ready-made <a href={`/systems/${o.nearest.slug}?postcode=${props.postcode}`}>{o.nearest.title}</a>: <strong>{aud(o.nearest.you_pay)}</strong> ({o.nearest.diff.join(", ")}).</p>}
        </>}
        <form id="build-form" action={props.secure} onSubmit={() => track("build_secure", { family: c.family, inverter: c.inverterSku, modules: c.modules, panel: c.panelSku ?? "none", panels: c.panels, backup: !!c.backup, you_pay: p?.you_pay })}>
          <input type="hidden" name="postcode" value={props.postcode} /><input type="hidden" name="ph" value={c.phases} />
          <input type="hidden" name="f" value={c.family ?? ""} /><input type="hidden" name="inv" value={c.inverterSku ?? ""} />
          <input type="hidden" name="m" value={c.modules ?? ""} /><input type="hidden" name="p" value={c.panelSku === null ? "none" : c.panelSku ?? ""} />
          <input type="hidden" name="n" value={c.panels ?? ""} /><input type="hidden" name="b" value={c.backup ? "1" : ""} />
          {!props.served
            ? <a className="btn block" href={`/contact?kind=waitlist&postcode=${props.postcode}`}>Join the waitlist for {props.postcode}</a>
            : <button className="btn block" type="submit" disabled={!p?.ok || busy}>Secure this price for 14 days</button>}
        </form>
        <p className="small muted">{props.served ? `Nothing to pay now. Price and rebate held until ${longDate(o.lockUntil)}. Send 4 photos; your installer confirms it fits before you pay.` : `We don't install at ${props.postcode} yet. This is the price once an installer covers your area.`}</p>
        {p && <table className="incl" style={{ marginTop: 6 }}><tbody>
          <tr><td className="k">Next free days</td><td>{o.nextDays?.length ? <strong>{o.nextDays.map(longDate).join(" · ")}</strong> : o.nextDays === null ? "Not in your area yet — join the waitlist" : "Confirmed when you book"}<br /><span className="small muted">{o.nextDays?.length ? "From installers' live calendars. You pick your day after paying." : "From your installer's real free days"}</span></td></tr>
          <tr><td className="k">Rebate</td><td>{aud(p.rebates)} off now. {o.rebateLine}</td></tr>
        </tbody></table>}
        {p && o.saving && <div className="card small" style={{ marginTop: 12 }}>
          <strong>What it could save you</strong>
          <p style={{ margin: "4px 0 0" }}>About <strong>{aud(o.saving.saving)} a year</strong> for a typical home in {props.postcode}{o.saving.payback_years ? <>, paying for itself in about <strong>{o.saving.payback_years} years</strong></> : null}.</p>
          <p className="muted" style={{ margin: "6px 0 0" }}>Estimate only. Assumes a home using {o.saving.day_kwh} kWh a day{o.saving.existing_kw ? `, ${o.saving.existing_kw} kW of existing solar` : ""}, panels making {o.saving.yield} kWh per kW a day ({o.saving.city} average), {o.saving.usage_c}c per kWh to buy and {o.saving.fit_c}c to sell, less {o.saving.allowance_pct}% for cloudy spells. Your bills will differ. <a href="/estimate">Use your own bill</a>.</p>
        </div>}
        <ul className="guar card small" style={{ marginTop: 14, padding: 14 }}>
          <li>Your installer confirms the price from your photos before you pay anything</li>
          <li>Change your mind within 10 business days of signing: full refund</li>
          <li>Nothing is added on the day without your written OK</li>
        </ul>
        {props.trust}
        {p && <p style={{ marginTop: 12 }}><Share title={p.title.replace(/^Custom · /, "")} text={`${p.title.replace(/^Custom · /, "")}: ${aud(p.you_pay)} installed after rebates.`} label="Share this build" /></p>}
        <div id="save">{props.saved === "1" ? <p className="small ok" style={{ marginTop: 10 }}>Saved. We&apos;ve emailed you the link.</p> : p?.ok && (
          <form action={props.save} style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input type="hidden" name="postcode" value={props.postcode} /><input type="hidden" name="ph" value={c.phases} />
            <input type="hidden" name="f" value={c.family ?? ""} /><input type="hidden" name="inv" value={c.inverterSku ?? ""} />
            <input type="hidden" name="m" value={c.modules ?? ""} /><input type="hidden" name="p" value={c.panelSku === null ? "none" : c.panelSku ?? ""} />
            <input type="hidden" name="n" value={c.panels ?? ""} /><input type="hidden" name="b" value={c.backup ? "1" : ""} />
            <input aria-label="Email me this build" name="email" type="email" placeholder="Email me this build" style={{ flex: 1, padding: 8, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" }} required />
            <button className="btn ghost sm" type="submit" disabled={busy}>Save</button></form>)}
          {props.saved === "bad" && <p className="small note" style={{ marginTop: 6 }}>Check the email address.</p>}</div>
      </aside>

      <div className="paybar" style={{ opacity: busy ? 0.6 : 1 }}>
        <div><div className="small muted" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700 }}>You pay, installed</div><div className="pay">{p ? aud(p.you_pay) : "—"}</div></div>
        {!props.served
          ? <a className="btn" href={`/contact?kind=waitlist&postcode=${props.postcode}`}>Join waitlist →</a>
          : <button className="btn" type="submit" form="build-form" disabled={!p?.ok || busy}>Secure price →</button>}
      </div>
      <div className="paybar-space" style={{ height: 70 }} />
    </div>
  );
}

/** Phone only: a finished step folds to one line with a Change link. */
function Sum({ show, onChange }: { show: string; onChange: () => void }) {
  return <div className="bsum"><span>{show} <span style={{ color: "var(--teal)" }}>✓</span></span><button type="button" className="link" onClick={onChange}>Change</button></div>;
}
