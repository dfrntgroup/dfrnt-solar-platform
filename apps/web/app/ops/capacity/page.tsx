import { AdminShell } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { capacityView, scorecards } from "@/lib/schedule";
import { longDate } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Scheduling S6: where you'll run short of crews, four weeks before customers notice. */
export default async function Capacity() {
  const me = await requireStaff();
  const v = await capacityView(6);
  const cards = await scorecards();
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Capacity</h1>
      <p className="muted">Free crew-days in installers&apos; calendars against booked and likely jobs. An area goes red when the next 4 weeks are over 85% full: recruit or ask an installer for another day now. Likely jobs = open quotes × the {pct(v.signRate)} sign rate of the last 60 days.</p>
      <table className="lines small"><tbody>
        <tr><th>Area</th><th>Installers</th>{v.weeks.map((w) => <th key={w.from} className="r">w/c {longDate(w.from)}</th>)}<th className="r">Likely</th><th className="r">Next 4 wks</th></tr>
        {v.areas.map((a) => (
          <tr key={a.area} style={a.red ? { background: "#ffe9e3" } : undefined}>
            <td><strong>{a.area}</strong></td><td>{a.installers.join(", ") || <span style={{ color: "var(--red, #c00)" }}>nobody</span>}</td>
            {a.free.map((f, i) => <td key={i} className="r">{f.toFixed(1)} free<br /><span className="muted">{(a.booked[i] ?? 0).toFixed(1)} booked</span></td>)}
            <td className="r">{a.likely}</td><td className="r"><strong>{pct(a.util)}</strong>{a.red ? " ⚠" : ""}</td>
          </tr>))}
      </tbody></table>
      <p className="small muted">Areas are postcode groups (455x = 4550–4559). An installer covering several areas counts in each, so shared areas look roomier than they are.</p>
      <h2 style={{ marginTop: 24 }}>Installers</h2>
      <table className="lines small"><tbody>
        <tr><th>Installer</th><th className="r">Calendars</th><th className="r">Bookings 90d</th><th className="r">Declined</th><th className="r">Moved</th><th className="r">Installs</th><th className="r">Reviews</th></tr>
        {cards.map((c) => (
          <tr key={c.id as string}><td>{c.business_name as string}{c.is_test ? " (test)" : ""}</td>
            <td className="r">{c.connected as number}/{c.crews as number} connected</td><td className="r">{c.bookings as number}</td>
            <td className="r">{c.declines as number}{(c.bookings as number) ? ` (${pct((c.declines as number) / (c.bookings as number))})` : ""}</td>
            <td className="r">{c.moves as number}</td><td className="r">{c.installs as number}</td><td className="r">{c.reviews ? `${c.rating} ★ (${c.reviews})` : "–"}</td></tr>))}
      </tbody></table>
      <p className="small muted">Reliable installers (few declines and moves, good reviews) are shown first when customers choose an installer.</p>
      <h3 style={{ marginTop: 18 }}>Free crew-days by installer</h3>
      <table className="lines small"><tbody>{v.perInstaller.map((p) => <tr key={p.id}><td>{p.name}<br /><span className="muted">{p.live ? "live calendar" : "estimate from stated days"}</span></td>{p.free.map((f, i) => <td key={i} className="r">{f.toFixed(1)}</td>)}</tr>)}</tbody></table>
    </AdminShell>
  );
}
