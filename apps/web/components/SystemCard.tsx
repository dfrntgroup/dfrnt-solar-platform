import Link from "next/link";
import type { CatalogueSystem, Quote } from "@dfrnt/engine";
import { aud } from "@/lib/site";

export function SystemCard({ s, q }: { s: CatalogueSystem; q: Quote }) {
  const c = q.config;
  return (
    <div className="card">
      <div className="tag"><span>{s.brand} · {s.tier}</span>{s.badge && <span className="badge">{s.badge}</span>}</div>
      <h3>{s.title}</h3>
      <ul>
        {c.panel_kw > 0 && <li>{s.config.panelCount} × 475 W panels</li>}
        <li>{c.inverter?.model} {c.inverter ? `${Math.round(c.inverter.ac_w / 100) / 10} kW` : ""} inverter</li>
        {c.usable_kwh > 0 && <li>{c.usable_kwh} kWh usable battery</li>}
        {s.config.phases === 3 && <li>Three-phase homes</li>}
      </ul>
      <div className="pay"><small>You pay, installed</small>{aud(q.stack.amount_payable)}</div>
      <div className="before">{aud(q.stack.price_inc_gst)} before {aud(q.stack.less_stcs)} rebates</div>
      <Link className="btn" href={`/systems/${s.slug}`}>View system</Link>
    </div>
  );
}
