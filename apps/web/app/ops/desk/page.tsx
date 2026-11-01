import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { getQuote } from "@/lib/jobs";
import { daysFor, type DayChoice } from "@/lib/schedule";
import { dayLabel } from "@/components/DayPicker";
import { aud, longDate } from "@/lib/site";
import { deskBook, deskCalled, setDeskMode } from "../actions";

export const dynamic = "force-dynamic";

/** Scheduling S7: the optional booking desk. Customers book themselves; the desk calls, confirms and handles exceptions. */
export default async function Desk({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const { mode } = await getSetting("booking_desk");
  const rows = await db()`select q.id, q.token, q.status, q.customer_name, q.customer_phone, q.title, q.postcode, q.install_date::text install_date, q.install_part, q.rebook,
      q.paid_at, q.desk_called_at, q.desk_notes, q.amount_payable::float8 amount, i.business_name installer,
      (select status from date_offers o where o.quote_id = q.id and o.kind = 'installer' and o.status in ('requested','open') limit 1) offer,
      (select count(*)::int from date_moves m where m.quote_id = q.id) moves
    from quotes q left join installers i on i.id = q.installer_id
    where (q.status = 'awaiting_date' or q.rebook or (q.status in ('booked','gear_ordered') and q.paid_at > now() - interval '14 days'))
    order by (q.status = 'awaiting_date' or q.rebook) desc, q.paid_at`;
  const needsHelp = (r: Record<string, unknown>) => r.rebook || r.offer === "requested" || (r.status === "awaiting_date" && Date.now() - new Date(r.paid_at as string).getTime() > 24 * 3600_000);
  const queue = rows.filter((r) => mode === "all" ? !r.desk_called_at || needsHelp(r) : needsHelp(r));
  const choices: Record<string, DayChoice> = Object.fromEntries(await Promise.all(queue.filter((r) => r.status === "awaiting_date" || r.rebook).slice(0, 15).map(async (r) => [r.id as string, await daysFor((await getQuote(r.token as string))!, { max: 8 })])));
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Booking desk</h1>
      {sp.error && <div className="note">{sp.error}</div>}
      <form action={setDeskMode} className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong>Desk</strong>
        <select name="mode" defaultValue={mode} style={{ ...input, width: "auto" }}><option value="off">Off: customers book themselves</option><option value="all">Call every new customer</option><option value="help">Only those who need help</option></select>
        <button className="btn sm">Save</button>
        <span className="small muted">Self-booking works the same whichever you pick.</span>
      </form>
      {mode === "off" && <p className="muted" style={{ marginTop: 12 }}>The desk is off. Exceptions still show below so nothing is missed.</p>}
      <p className="small muted" style={{ marginTop: 12 }}>Call guide: welcome them, confirm the day (or book it with them below), check access, pets and parking, tell them we arrive 7–8 am and they&apos;ll get an email the day before. Note anything for the installer in Access on the job.</p>
      {queue.length === 0 && <p className="ok">Nothing waiting.</p>}
      {queue.map((r) => { const c = choices[r.id as string]; return (
        <div key={r.id as string} className="card" style={{ marginBottom: 10 }}>
          <strong><Link href={`/ops/job/${r.id}`}>{(r.customer_name as string) ?? "Customer"}</Link> · {r.title as string}</strong>
          <span className="small">{r.customer_phone ? <a href={`tel:${r.customer_phone}`}>{r.customer_phone as string}</a> : "no phone"} · {r.postcode as string} · {aud(r.amount as number)} · {(r.installer as string) ?? "no installer"}</span>
          <span className="small">{r.rebook ? "Needs a new day (moved)" : r.status === "awaiting_date" ? (r.offer === "requested" ? "Paid; waiting for the installer to offer days" : r.offer === "open" ? "Paid; installer offered days, customer to pick" : "Paid; hasn't picked a day yet") : `Booked ${dayLabel([r.install_date as string], r.install_part as string)}`}
            {(r.moves as number) ? ` · moved ${r.moves}×` : ""} · paid {r.paid_at ? longDate(new Date(r.paid_at as string).toISOString().slice(0, 10)) : ""}</span>
          {c && c.slots.length > 0 && <form action={deskBook} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input type="hidden" name="id" value={r.id as string} />
            <select name="date" style={{ ...input, width: "auto" }}>{c.slots.map((s) => <option key={s.date} value={s.date}>{dayLabel(s.dates, s.part)}</option>)}</select>
            <button className="btn sm">Book this day for them</button></form>}
          {c && !c.slots.length && <span className="small note">{c.mode === "offer" ? "Installer isn't on a live calendar: chase their three days." : "No free days inside their rebate window: call the installer."}</span>}
          <form action={deskCalled} style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input type="hidden" name="id" value={r.id as string} />
            <input name="notes" defaultValue={(r.desk_notes as string) ?? ""} placeholder="Call notes" style={input} />
            <button className="btn ghost sm">{r.desk_called_at ? "Update" : "Called"}</button></form>
        </div>); })}
    </AdminShell>
  );
}
