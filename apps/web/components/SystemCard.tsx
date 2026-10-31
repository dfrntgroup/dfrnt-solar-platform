import Link from "next/link";
import type { CatalogueSystem, Quote } from "@dfrnt/engine";
import { aud } from "@/lib/site";
import { imageFor } from "@/lib/images";
import { outcome } from "@/lib/capacity";
import { longDate } from "@/lib/site";

export function Media({ s, q, className = "card-media" }: { s: CatalogueSystem; q: Quote; className?: string }) {
  const mod = q.config.bom.find((b) => b.serial === "module")?.sku;
  const tiles = [
    s.config.panelCount > 0 ? { img: imageFor(s.config.panelSku), stat: `${q.config.panel_kw} kW`, sub: `${s.config.panelCount} panels` } : null,
    { img: imageFor(q.config.inverter?.sku), stat: q.config.inverter ? `${Math.round(q.config.inverter.ac_w / 100) / 10} kW` : "", sub: "inverter" },
    q.config.usable_kwh > 0 ? { img: imageFor(mod), stat: `${q.config.usable_kwh} kWh`, sub: "usable battery" } : null,
  ].filter(Boolean) as { img: { src: string; alt: string } | null; stat: string; sub: string }[];
  return (
    <div className={className} style={{ gridTemplateColumns: `repeat(${tiles.length}, 1fr)` }}>
      {tiles.map((t, i) => <div key={i}>{t.img ? <img src={t.img.src} alt={t.img.alt} loading="lazy" /> : <span className="stat">{t.stat}<small>{t.sub}</small></span>}</div>)}
    </div>
  );
}

export function SystemCard({ s, q, compare, earliest }: { s: CatalogueSystem; q: Quote; compare?: boolean; earliest?: string | null }) {
  const c = q.config;
  return (
    <div className="card">
      <Media s={s} q={q} />
      <div className="tag"><span>{s.brand} · {s.kind === "battery_only" ? "Battery only" : "Solar + battery"}</span>{s.badge && <span className="badge">{s.badge}</span>}</div>
      <h3>{s.title}</h3>
      {outcome(c.usable_kwh, c.panel_kw) && <p className="small" style={{ margin: "-4px 0 0", color: "var(--teal-dark)", fontWeight: 700 }}>{outcome(c.usable_kwh, c.panel_kw)}</p>}
      <div className="chips">
        {c.panel_kw > 0 && <span>{s.config.panelCount} × 475 W panels</span>}
        {c.inverter && <span>{Math.round(c.inverter.ac_w / 100) / 10} kW inverter</span>}
        {c.usable_kwh > 0 && <span>{c.usable_kwh} kWh usable</span>}
        <span>{s.config.phases === 3 ? "Three phase" : "Single phase"}</span>
      </div>
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <div className="pay"><small>You pay, installed</small>{aud(q.stack.amount_payable)}</div>
        <div className="before">{aud(q.stack.price_inc_gst)} before {aud(q.stack.less_stcs)} rebates · inc GST</div>
        {earliest !== undefined && <div className="small" style={{ marginTop: 6 }}>{earliest ? <>Earliest install <strong>{longDate(earliest)}</strong></> : "We don't install at this postcode yet"}</div>}
      </div>
      <div className="card-foot" style={compare ? undefined : { gridTemplateColumns: "1fr" }}>
        {compare && <label className="cmp"><input type="checkbox" name="s" value={s.slug} /> Compare</label>}
        <Link className="btn" href={`/systems/${s.slug}`}>View system</Link>
      </div>
    </div>
  );
}
