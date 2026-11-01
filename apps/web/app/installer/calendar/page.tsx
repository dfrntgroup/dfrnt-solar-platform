import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireInstaller } from "@/lib/auth";
import { googleReady, listCalendars } from "@/lib/google";
import { previewFor } from "@/lib/schedule";
import { longDate } from "@/lib/site";
import { addCrew, disconnectCrew, removeCrew, saveCrewCalendars, saveJobProfile, testBusy } from "../actions";

export const dynamic = "force-dynamic";
const DAYS: [number, string][] = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];
const BRANDS = ["SolaX", "Sungrow", "GoodWe", "Sigenergy"];

/** Scheduling S1: what jobs this installer does, how long they take, and each crew's Google Calendar. */
export default async function Calendar({ searchParams }: { searchParams: Promise<{ as?: string; error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const me = await requireInstaller(sp.as);
  const as = me.viaStaff ? <input type="hidden" name="as" value={me.id} /> : null;
  const q = me.viaStaff ? `&as=${me.id}` : "";
  const [inst] = await db()`select is_test from installers where id = ${me.id}`;
  const crews = await db()`select id, name, source, status, google_email, busy_calendar_ids, last_error from installer_crews where installer_id = ${me.id} and active order by created_at`;
  const cals = Object.fromEntries(await Promise.all(crews.filter((c) => c.source === "google" && c.status === "connected")
    .map(async (c) => [c.id as string, await listCalendars(c.id as string).catch(() => [])])));
  const { days, profile: p } = await previewFor(me.id, 4);
  const C = ({ name, value, on, label }: { name: string; value: string | number; on: boolean; label: string }) =>
    <label className="small" style={{ marginRight: 12, display: "inline-flex", gap: 5, alignItems: "center" }}><input type="checkbox" name={name} value={value} defaultChecked={on} /> {label}</label>;
  const N = ({ name, label, value, hint }: { name: string; label: string; value: number; hint?: string }) =>
    <label className="small">{label}{hint && <span className="muted"> · {hint}</span>}<input name={name} defaultValue={value} inputMode="decimal" style={input} /></label>;
  return (
    <AdminShell who={me.business_name} area="installer">
      <h1 style={{ fontSize: 28 }}>Calendar and jobs</h1>
      <p className="muted">Customers book your free days themselves, straight into your calendar. We only ever see when you&apos;re busy, never what&apos;s in your events.</p>
      {sp.error && <div className="note">{sp.error}</div>}
      {sp.ok === "connected" && <div className="ok">Google Calendar connected. Tick which calendars show when this crew is busy.</div>}

      <h2 style={{ marginTop: 20 }}>1. Your crews and their calendars</h2>
      <p className="small muted">One calendar per crew. Anything in it (other jobs, days off) blocks that day: an all-day event, or 2 hours or more between 7 am and 3 pm. Your DFRNT bookings land in a calendar we create called &quot;DFRNT Solar&quot;. Using ServiceM8, Outlook or another app? Sync it into Google, two-way if your app offers it.</p>
      {!googleReady() && <div className="note small">Google connection is being switched on. Set up your crews and job details now; we&apos;ll email you when you can connect.</div>}
      {crews.map((c) => (
        <div key={c.id as string} className="card" style={{ marginBottom: 10 }}>
          <strong>{c.name as string}</strong>
          <span className="small">{c.source === "google" ? (c.status === "connected" ? `Connected: ${c.google_email ?? "Google"}` : `Connection problem: ${c.last_error ?? "reconnect"}`) : c.source === "test" ? "Test crew (no Google; mark busy days below)" : "Not connected"}</span>
          {c.source !== "test" && <a className="btn sm" href={`/api/v1/google/connect?crew=${c.id}${q}`}>{c.source === "google" ? "Reconnect Google Calendar" : "Connect Google Calendar"}</a>}
          {cals[c.id as string]?.length ? (
            <form action={saveCrewCalendars} style={{ marginTop: 8 }}>{as}<input type="hidden" name="crew" value={c.id as string} />
              <span className="small">Calendars that show when this crew is busy:</span><br />
              {(cals[c.id as string] as { id: string; name: string; primary: boolean }[]).filter((x) => !x.name.startsWith("DFRNT Solar")).map((x) =>
                <C key={x.id} name="cal" value={x.id} on={(c.busy_calendar_ids as string[]).includes(x.id) || (x.primary && (c.busy_calendar_ids as string[]).includes("primary"))} label={x.name} />)}
              <button className="btn ghost sm">Save</button></form>) : null}
          {c.source === "test" && <form action={testBusy} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{as}<input type="hidden" name="crew" value={c.id as string} />
            <input type="date" name="date" style={{ ...input, width: 170 }} required /><button className="btn ghost sm">Mark busy</button>
            <button className="btn ghost sm" name="clear" value="1">Clear day</button></form>}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {c.source === "google" && <form action={disconnectCrew}>{as}<input type="hidden" name="crew" value={c.id as string} /><button className="btn ghost sm">Disconnect</button></form>}
            <form action={removeCrew}>{as}<input type="hidden" name="crew" value={c.id as string} /><button className="btn ghost sm">Remove crew</button></form>
          </div>
        </div>))}
      <form action={addCrew} className="card" style={{ display: "flex", gap: 8 }}>{as}
        <input name="name" placeholder={crews.length ? "Crew name, e.g. Crew 2" : "Crew name, e.g. Nathan's crew"} style={input} /><button className="btn sm">Add crew</button></form>
      {inst?.is_test && <p className="small muted">Test installer: crews use test busy days instead of Google.</p>}

      <h2 style={{ marginTop: 24 }}>2. Jobs you do and how long they take</h2>
      <form action={saveJobProfile} className="card">{as}
        <span className="small"><strong>Brands you&apos;re accredited to install</strong> (none ticked = any)</span>
        <div>{BRANDS.map((b) => <C key={b} name="brands" value={b} on={p.brands.includes(b)} label={b} />)}</div>
        <span className="small"><strong>Roofs</strong> (none ticked = any)</span>
        <div><C name="roofTypes" value="tin" on={p.roofTypes.includes("tin")} label="Metal" /><C name="roofTypes" value="tile" on={p.roofTypes.includes("tile")} label="Tile" /><C name="roofTypes" value="kliplok" on={p.roofTypes.includes("kliplok")} label="Klip-Lok" /></div>
        <span className="small"><strong>Power</strong> (none ticked = any)</span>
        <div><C name="phases" value={1} on={p.phases.includes(1)} label="Single phase" /><C name="phases" value={3} on={p.phases.includes(3)} label="Three phase" /></div>
        <label className="small">Up to how many storeys<select name="maxStoreys" defaultValue={String(p.maxStoreys)} style={input}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
          <N name="d_battery" label="Battery only (crew-days)" value={p.durations.battery_only} hint="0.5 = a morning" />
          <N name="d_solar" label="Solar + battery (crew-days)" value={p.durations.solar_battery} />
          <N name="largeKw" label="Add a day over (kW of panels)" value={p.largeKw} />
          <N name="twoStoreyExtra" label="Extra for two storeys (days)" value={p.twoStoreyExtra} />
          <N name="noticeDays" label="Working days' notice" value={p.noticeDays} />
        </div>
        <span className="small"><strong>Days you install</strong></span>
        <div>{DAYS.map(([v, d]) => <C key={v} name="workingDays" value={v} on={p.workingDays.includes(v)} label={d} />)}</div>
        <button className="btn sm">Save</button>
      </form>

      <h2 style={{ marginTop: 24 }}>3. Your next 4 weeks: what customers can book</h2>
      {days.length && days[0]!.crews.length ? (<>
        <p className="small muted">Free days are open to customers, from {p.noticeDays} working days ahead (or when the gear can arrive, if later). If this looks wrong, fix your Google Calendar and reload.</p>
        <div className="days">{days.map((d) => (
          <div key={d.date} className="day" style={{ flexDirection: "column", alignItems: "flex-start", cursor: "default", background: d.crews.some((c) => c.free > 0) ? undefined : "#eee" }}>
            <span>{longDate(d.date)}</span>
            {d.crews.map((c) => <span key={c.name} className="small" style={{ fontWeight: 400 }}>{c.name}: {c.free >= 1 ? "free" : c.free > 0 ? "half free" : "taken"}</span>)}
          </div>))}</div>
      </>) : <p className="small muted">Connect a crew&apos;s calendar to see this. Until then, when a customer pays we&apos;ll email you to offer three days.</p>}
    </AdminShell>
  );
}
