import Link from "next/link";
import { BANDS, bandFor, type CatalogueSystem, type Quote } from "@dfrnt/engine";
import { aud } from "@/lib/site";
import { imageFor } from "@/lib/images";
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

/** Band pill: one of four fixed names, so the same name means the same job across brands. */
export function BandPill({ s, q }: { s: CatalogueSystem; q: Quote }) {
  const band = s.band ?? bandFor(q.config.usable_kwh);
  return <span className={`band ${band}`}>{BANDS[band].label}</span>;
}

/** kW the way Australians say it: 14 × 475 W is "6.6 kW", 21 × 475 W is "10 kW" (round half down to one decimal). */
export const kwLabel = (kw: number) => String(Math.ceil(kw * 10 - 0.5) / 10);

/** The four facts, always in the same order: panels, inverter, battery, backup. Battery-only cards answer "do I keep my solar?" first. */
export function Facts({ s, q, backup }: { s: CatalogueSystem; q: Quote; backup?: string }) {
  const c = q.config;
  const panelW = c.bom.find((b) => b.serial === "panel") ? 475 : 0;
  const inv = c.inverter ? `${Math.round(c.inverter.ac_w / 100) / 10} kW hybrid` : "";
  return (
    <ul className="facts">
      {s.kind === "battery_only"
        ? <><li><span>Works with</span><span>Any existing solar</span></li><li><span>Includes</span><span>Its own hybrid inverter{inv ? ` (${inv})` : ""}</span></li></>
        : <><li><span>Panels</span><span>{s.config.panelCount} × {panelW} W = {kwLabel(c.panel_kw)} kW</span></li>{inv && <li><span>Inverter</span><span>{inv}</span></li>}</>}
      {c.usable_kwh > 0 && <li><span>Battery</span><span>{c.usable_kwh} kWh usable</span></li>}
      <li><span>Backup</span><span>{backup ?? "Optional"}</span></li>
      {s.config.phases === 3 && <li><span>Power</span><span>Three phase</span></li>}
    </ul>
  );
}

export function SystemCard({ s, q, compare, earliest, highlight }: { s: CatalogueSystem; q: Quote; compare?: boolean; earliest?: string | null; highlight?: boolean }) {
  return (
    <div className={`card${highlight || s.badge ? " pick" : ""}`}>
      <Media s={s} q={q} />
      <BandPill s={s} q={q} />
      <div className="tag"><span>{s.brand} · {s.kind === "battery_only" ? "Battery only" : s.size ? s.size : "Solar + battery"}</span>{s.badge && <span className="sticker">{s.badge}</span>}</div>
      <h3>{s.title}</h3>
      {s.who && <p className="who">{s.who}</p>}
      <Facts s={s} q={q} />
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <div className="pay"><small>You pay, installed</small>{aud(q.stack.amount_payable)}</div>
        <div className="before">{aud(q.stack.price_inc_gst)} before {aud(q.stack.less_stcs)} rebates · inc GST</div>
        {earliest !== undefined && <div className="small" style={{ marginTop: 6 }}>{earliest ? <>Earliest install <strong>{longDate(earliest)}</strong></> : "We don't install at this postcode yet"}</div>}
      </div>
      <div className="card-foot" style={compare ? undefined : { gridTemplateColumns: "1fr" }}>
        {compare && <label className="cmp"><input type="checkbox" name="s" value={s.slug} /> Compare</label>}
        <Link className="btn" href={`/systems/${s.slug}`}>See and adjust{compare ? "" : " →"}</Link>
      </div>
    </div>
  );
}
