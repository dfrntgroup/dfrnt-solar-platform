// S4: what the installer (and Ops) see about usage. Only what changes the install: no account numbers, no billing.
import { linkForQuote } from "@/lib/energy";

export async function UsageJobCard({ quoteId, ops }: { quoteId: string; ops?: boolean }) {
  const l = await linkForQuote(quoteId);
  if (!l) return ops ? <p className="small muted">Sizing: from the customer&apos;s answers (no meter data connected).</p> : null;
  const p = l.profile, s = l.sizing;
  if (l.status !== "ready") return <p className="small muted">Meter data: {l.status === "fallback" ? `not available (${l.fail_reason ?? "retailer"}), sized from answers` : "connecting"}.</p>;
  return (
    <>
      <h3 style={{ marginTop: 16 }}>Usage (from the meter)</h3>
      <table className="lines small"><tbody>
        {p && <tr><td>Use a year</td><td className="r">{Math.round(p.annual_import_kwh + p.annual_controlled_kwh).toLocaleString("en-AU")} kWh ({p.daily_kwh} a day, {p.night_kwh} after dark)</td></tr>}
        {p && <tr><td>Highest half-hour demand</td><td className="r">{p.peak_kw} kW</td></tr>}
        {p && <tr><td>Existing solar export</td><td className="r">{p.has_export ? `${p.daily_export_kwh} kWh a day` : "none"}</td></tr>}
        {p && <tr><td>Controlled load (hot water) circuit</td><td className="r">{p.annual_controlled_kwh > 0 ? `yes, ${Math.round(p.annual_controlled_kwh / 365 * 10) / 10} kWh a day` : "no"}</td></tr>}
        <tr><td>Meter</td><td className="r">{l.meter_type ?? "—"}{l.state ? ` · ${l.state}` : ""}{ops && l.nmi ? ` · NMI ${l.nmi}` : ""}</td></tr>
        {s && <tr><td>Sizing target</td><td className="r">{s.targets.panel_kw ? `${s.targets.panel_kw} kW + ` : ""}{s.targets.battery_kwh} kWh{s.targets.capped_by_roof ? " (roof-capped)" : ""}</td></tr>}
        {ops && <tr><td>Path</td><td className="r">{l.path === "interval" ? "Real half-hour data" : l.path === "totals" ? "Meter totals only" : "Bill estimate"} · tariff {s?.tariff_source ?? "—"}</td></tr>}
      </tbody></table>
    </>
  );
}
