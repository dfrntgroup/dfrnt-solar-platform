import { Header, Footer } from "@/components/Header";
import { sitePostcode } from "@/lib/site";
import { getSetting } from "@/lib/settings";
import { SELLER } from "@/lib/legal";
import { contactUs } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Talk to a human", description: "Talk to DFRNT Solar: ask a question or book a call-back with a real person." };

/** The next five business days in Brisbane time. */
function days() {
  const out: { v: string; label: string }[] = [];
  const d = new Date(Date.now() + 10 * 3600_000);
  while (out.length < 5) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    out.push({ v: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" }) });
  }
  return out;
}

export default async function Contact({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp);
  const t = await getSetting("trust");
  const input = { width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
  return (
    <>
      <Header postcode={postcode} back="/contact" />
      <section><div className="wrap" style={{ maxWidth: 560 }}>
        <p className="eyebrow">Talk to a human</p><h1>Ask us anything, or book a call.</h1>
        <p className="lead">A real person replies within one business day. No salespeople: we&apos;ll answer the question, not chase a sale.</p>
        <div className="card" style={{ marginBottom: 18 }}>
          <strong>Talk to a real person</strong>
          <p style={{ margin: "6px 0 0" }}><a href={`tel:${SELLER.phone.replace(/\s/g, "")}`}><strong>{SELLER.phone}</strong></a>{t.hours ? ` · ${t.hours}` : ""}{t.address ? <><br /><span className="small muted">{t.address}</span></> : null}</p>
          <p className="small" style={{ margin: "6px 0 0" }}>{t.hours && t.callback_minutes ? `Ask for a call-back and we'll ring you within ${t.callback_minutes} minutes in those hours. ` : ""}Nobody will call you unless you ask.</p>
        </div>
        {sp.sent ? <div className="ok">Thanks — a real person will get back to you within one business day.</div> : (
          <form action={contactUs}>
            <input type="hidden" name="quote" value={sp.quote ?? ""} />
            <p><select name="kind" aria-label="What is this about" style={input} defaultValue={sp.kind ?? "question"}><option value="question">A question</option><option value="callback">Please call me</option><option value="fault">Something isn&apos;t working</option><option value="complaint">A complaint</option><option value="waitlist">Tell me when you cover my area</option></select></p>
            <p><input name="postcode" defaultValue={postcode} inputMode="numeric" maxLength={4} placeholder="Your postcode" aria-label="Your postcode" style={input} /></p>
            <p><input aria-label="Name" name="name" placeholder="Name" style={input} required /></p>
            <p><input aria-label="Email" name="email" type="email" placeholder="Email" style={input} required /></p>
            <p><input aria-label="Mobile (for a call back)" name="phone" placeholder="Mobile (for a call back)" style={input} /></p>
            <fieldset style={{ border: "1px solid var(--line)", borderRadius: 7, padding: 12, margin: "0 0 14px" }}>
              <legend className="small muted" style={{ padding: "0 6px" }}>Want a call? Pick a time (optional)</legend>
              <div className="pills" role="radiogroup" aria-label="Day">{days().map((d) => <label key={d.v}><input type="radio" name="day" value={d.v} style={{ position: "absolute", opacity: 0 }} /><span className="pill-r">{d.label}</span></label>)}</div>
              <div className="pills" role="radiogroup" aria-label="Time">{["Morning (8–12)", "Afternoon (12–5)"].map((t) => <label key={t}><input type="radio" name="slot" value={t} style={{ position: "absolute", opacity: 0 }} /><span className="pill-r">{t}</span></label>)}</div>
            </fieldset>
            <p><textarea aria-label="How can we help?" name="body" placeholder="How can we help?" style={{ ...input, minHeight: 120 }} required /></p>
            <p style={{ position: "absolute", left: -9999 }} aria-hidden><input name="website" tabIndex={-1} autoComplete="off" /></p>
            <button className="btn block" type="submit">Send</button>
          </form>)}
      </div></section>
      <Footer />
    </>
  );
}
