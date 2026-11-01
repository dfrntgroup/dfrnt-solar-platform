// Scheduling S2: the customer picks a real install day (live from their installer's calendar, or the days their installer offered).
import type { DayChoice } from "@/lib/schedule";
import { longDate } from "@/lib/site";

export function dayLabel(dates: string[], part?: string | null) {
  const first = longDate(dates[0]!), last = dates.length > 1 ? longDate(dates[dates.length - 1]!) : null;
  return `${first}${last ? ` – ${last}` : ""}${part === "am" ? ", morning" : ""}`;
}

export function DayPicker({ token, choice, action, rebook }: { token: string; choice: DayChoice; action: (f: FormData) => Promise<void>; rebook?: boolean }) {
  const until = choice.until ? ` All on or before ${longDate(choice.until)}, so your rebate holds.` : "";
  const len = choice.days <= 0.5 ? "a morning" : choice.days === 1 ? "one day" : `${choice.days} days`;
  if (choice.mode === "offer" && !choice.slots.length) return (
    <div className="ok" style={{ marginTop: 12 }}><strong>Your installer is choosing days for you.</strong> We&apos;ve asked them for three free days that suit your install. You&apos;ll get an email to pick one, usually the same day.</div>);
  if (!choice.slots.length) return <div className="note" style={{ marginTop: 12 }}>No free days inside your rebate window right now. We&apos;ll be in touch today with the next one.</div>;
  return (
    <form action={action} style={{ marginTop: 12 }}>
      <input type="hidden" name="token" value={token} />
      <p className="muted small">{choice.mode === "live" ? "These are your installer's free days right now." : "Your installer offered these days."} Your install takes {len}; we arrive 7–8 am.{until}</p>
      <div className="days" role="radiogroup" aria-label="Install day">
        {choice.slots.map((s, i) => (
          <label key={s.date} className="day"><input type="radio" name="date" value={s.date} required defaultChecked={i === 0} /><span>{dayLabel(s.dates, s.part)}</span></label>))}
      </div>
      <button className="btn block" type="submit" style={{ marginTop: 12 }}>{rebook ? "Book my new day" : "Book this day"}</button>
      <p className="small muted" style={{ marginTop: 6 }}>It goes straight into your installer&apos;s calendar. You&apos;ll get a confirmation email.</p>
    </form>
  );
}
