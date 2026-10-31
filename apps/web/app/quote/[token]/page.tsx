import { friendlySummary } from "@/lib/images";
import { leaveReview } from "./actions";
import { Share } from "@/components/Share";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@dfrnt/db";
import { BOARD, refundRule, type JobState, type Quote } from "@dfrnt/engine";
import { Header, Footer } from "@/components/Header";
import { PhotoInput } from "@/components/PhotoInput";
import { availableDates, getQuote } from "@/lib/jobs";
import { todayAEST } from "@/lib/api";
import { aud, aud2, longDate } from "@/lib/site";
import { addCode, approveVariation, declineVariation, cancelOrder, payByBank, pickDate, signAgreement, submitHome } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your solar record", robots: { index: false } };

const STEPS: [string, JobState[]][] = [
  ["Your home", ["saved", "secured", "lapsed"]],
  ["Price", ["pricing_instant", "pricing_installer", "tech_review", "priced"]],
  ["Sign + pay", ["signed", "payment_pending", "payment_review"]],
  ["Book", ["awaiting_date"]],
  ["Install", ["booked", "gear_ordered", "delivered", "on_site", "variation_pending"]],
  ["Done", ["installed", "lodged", "settled", "complete"]],
];

function Breakdown({ q }: { q: Quote }) {
  const st = q.stack;
  return (
    <table className="lines"><tbody>
      {st.lines.filter((l) => l.kind !== "hardware" && l.kind !== "bos").map((l) => (
        <tr key={l.code}><td>{l.description}{l.qty > 1 ? ` × ${l.qty}` : ""}</td><td className="r">{l.sell_ex_gst != null ? aud2(l.sell_ex_gst) : "pending"}</td></tr>
      ))}
      <tr><td>Equipment (panels, inverter, battery, racking and parts)</td><td className="r">{aud2(st.hardware_ex_gst)}</td></tr>
      {st.discounts.map((d) => <tr key={d.code}><td>Discount: {d.code.replace("_", " ")}</td><td className="r">−{aud2(d.amount_inc_gst)} inc GST</td></tr>)}
      <tr><td>GST</td><td className="r">{aud2(st.gst)}</td></tr>
      <tr><td><strong>Total inc GST</strong></td><td className="r"><strong>{aud2(st.price_inc_gst)}</strong></td></tr>
      <tr><td>Less assignment of STCs ({st.stcs} certificates)</td><td className="r">−{aud2(st.less_stcs)}</td></tr>
      <tr className="total"><td>You pay</td><td className="r">{aud2(st.amount_payable)}</td></tr>
    </tbody></table>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "block", margin: "10px 0" }}><span className="small muted" style={{ display: "block", marginBottom: 4 }}>{label}</span>{children}</label>
);
const input = { width: "100%", padding: "10px", border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;

export default async function Record({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f]{36}$/.test(token)) notFound();
  const q = await getQuote(token);
  const myReview = q ? (await db()`select status from reviews where quote_id = ${q.id}`)[0] as { status: string } | undefined : undefined;
  const inst = q?.installer_id ? (await db()`select id, business_name from installers where id = ${q.installer_id} and active and not is_test`)[0] : undefined;
  if (!q) notFound();
  const shown = q.snapshot ?? q.result;
  const state = q.status;
  const step = STEPS.findIndex(([, ss]) => ss.includes(state));
  const dates = state === "awaiting_date" ? await availableDates(q) : [];
  const variations = await db()`select id, description, sell_inc::float8 as sell_inc, status from variations where quote_id = ${q.id} order by created_at`;
  const [mine] = await db()`select code from codes where owner_quote_id = ${q.id} and active`;
  const myCode = mine?.code as string | undefined;
  const docs = ["Signed agreement", "Tax invoice", "Certificate of compliance", "STC assignment form", "Warranty cards"];
  const canCancel = ["signed", "payment_pending", "payment_review", "awaiting_date", "booked", "gear_ordered", "delivered"].includes(state);
  const rule = canCancel && q.signed_at ? refundRule(q.signed_at.toISOString().slice(0, 10), todayAEST(), state) : null;

  return (
    <>
      <Header postcode={q.postcode} back={`/quote/${token}`} />
      <section><div className="wrap" style={{ maxWidth: 720 }}>
        <p className="eyebrow">Your solar record · {BOARD[state]}</p>
        <h1 style={{ fontSize: 30 }}>{q.title ?? friendlySummary(shown.config.summary)}</h1>
        <p className="muted small">{friendlySummary(shown.config.summary)}</p>
        {inst && !["saved", "secured", "lapsed"].includes(state) && <p className="small">Installed by <Link href={`/installers/${inst.id}`}>{inst.business_name as string}</Link></p>}
        {step >= 0 && <div className="filters">{STEPS.map(([n], i) => <span key={n} className={`chip${i === step ? " on" : ""}`} style={{ opacity: i > step ? 0.5 : 1 }}>{i < step ? "✓ " : ""}{n}</span>)}</div>}
        {error && <div className="note" style={{ margin: "12px 0" }}>{error}</div>}

        {(state === "saved" || state === "secured" || state === "lapsed") && (<>
          <div className="pay" style={{ margin: "16px 0 6px" }}><small>You pay, installed</small>{aud(q.result.stack.amount_payable)}</div>
          <div className="ok">Price and rebate locked until <strong>{longDate(q.lock_until)}</strong>. Keep this link: it&apos;s your record.</div>
          <p style={{ marginTop: 10 }}><Share title="Our solar price" text={`${q.title ?? "Solar and battery"}: ${aud(q.result.stack.amount_payable)} installed, locked until ${longDate(q.lock_until)}.`} label="Send to someone at home" /></p>
          <h2 style={{ marginTop: 28 }}>Tell us about your home</h2>
          <p className="muted">Two minutes. If your home fits your installer&apos;s standard job, you get your confirmed price straight away.</p>
          <form action={submitHome}>
            <input type="hidden" name="token" value={token} />
            <Field label="Your name"><input name="name" style={input} required defaultValue={q.customer_name ?? ""} /></Field>
            <Field label="Email"><input name="email" type="email" style={input} required defaultValue={q.customer_email ?? ""} /></Field>
            <Field label="Mobile"><input name="phone" style={input} defaultValue={q.customer_phone ?? ""} /></Field>
            <Field label="Is your home a unit, townhouse, duplex or on a strata title?"><select name="multi" style={input}><option value="no">No — a house on its own block</option><option value="yes">Yes</option></select></Field>
            <Field label="Unit or lot number (needed if you answered yes — it must match your title exactly)"><input name="unit" style={input} /></Field>
            <Field label="Street address"><input name="line1" style={input} required /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <Field label="Suburb"><input name="suburb" style={input} required /></Field>
              <Field label="Postcode"><input name="postcode" style={input} defaultValue={q.postcode} required /></Field>
            </div>
            <Field label="Power supply"><select name="phases" style={input} defaultValue="1"><option value="1">Single phase</option><option value="3">Three phase</option><option value="unknown">Not sure</option></select></Field>
            <Field label="Roof"><select name="roofType" style={input}><option value="tin">Tin (Colorbond corrugated)</option><option value="tile">Tile</option><option value="kliplok">Klip-Lok</option></select></Field>
            <Field label="Storeys"><select name="storeys" style={input}><option value="1">Single storey</option><option value="2">Two storeys</option><option value="3">Three or more</option></select></Field>
            <Field label="Where the battery goes"><select name="batteryLocation" style={input}><option value="garage">Garage</option><option value="outdoor_wall">Outside wall</option><option value="other">Somewhere else</option></select></Field>
            <Field label="Is that wall shared with a bedroom or living area?"><select name="againstHabitableRoom" style={input}><option value="no">No</option><option value="yes">Yes</option></select></Field>
            <Field label="Could a car hit the battery there?"><select name="vehicleExposure" style={input}><option value="no">No</option><option value="yes">Yes</option></select></Field>
            <Field label="Switchboard"><select name="switchboard" style={input}><option value="ok">Modern, with spare space</option><option value="needs_subboard">Full or old</option><option value="unsure">Not sure</option></select></Field>
            <Field label="Has this home already claimed a battery rebate?"><select name="priorBatteryClaim" style={input}><option value="no">No</option><option value="yes">Yes</option></select></Field>
            <h3 style={{ marginTop: 18 }}>Photos</h3>
            <p className="muted small">Switchboard with the door open · electricity meter · roof from the street · where the battery goes.</p>
            {["switchboard", "meter", "roof", "battery_location"].map((k) => (
              <Field key={k} label={k.replace("_", " ")}><PhotoInput name={`photo_${k}`} /></Field>
            ))}
            <button className="btn block" type="submit">Get my confirmed price</button>
          </form>
        </>)}

        {(state === "pricing_installer" || state === "pricing_instant" || state === "tech_review") && (<>
          <div className="ok" style={{ marginTop: 16 }}><strong>Your installer is pricing your home.</strong> You&apos;ll get your confirmed price by email, usually today. Your lock is held while we price.</div>
          {q.pricing_reasons?.length ? <p className="muted small">Why it needs a look: {q.pricing_reasons.join(" · ")}</p> : null}
        </>)}

        {["secured", "priced", "pricing_installer"].includes(state) && (q.discount_code
          ? <p className="small ok" style={{ marginTop: 12 }}>Code {q.discount_code} applied: {aud(q.referral_discount ?? 0)} off before GST.</p>
          : <form action={addCode} style={{ display: "flex", gap: 8, marginTop: 12 }}><input type="hidden" name="token" value={token} />
              <input name="code" placeholder="Referral or creator code" style={{ ...input, width: 220 }} /><button className="btn ghost sm" type="submit">Apply</button></form>)}
        {state === "priced" && (<>
          <h2 style={{ marginTop: 20 }}>Your confirmed price</h2>
          <Breakdown q={shown} />
          <h2 style={{ marginTop: 28 }}>Sign</h2>
          <p className="muted small">One contract covers the equipment, the installation, and assigning your STCs to us. You have a 10 business-day cooling-off period after signing. <em>Agreement wording is a placeholder until legal review.</em></p>
          <form action={signAgreement}>
            <input type="hidden" name="token" value={token} />
            <Field label="Type your full name"><input name="name" style={input} defaultValue={q.customer_name ?? ""} /></Field>
            <label className="small"><input type="checkbox" name="agree" /> I accept the agreement and assign the STCs for this system to DFRNT Solar.</label>
            <p><button className="btn block" type="submit">Sign agreement</button></p>
          </form>
        </>)}

        {state === "signed" && (<>
          <h2 style={{ marginTop: 20 }}>How would you like to pay?</h2>
          <form action={payByBank}><input type="hidden" name="token" value={token} />
            <button className="btn block" type="submit">Bank transfer — save about 1%</button></form>
          <p><button className="btn ghost block" disabled>Card — available at launch</button></p>
          <Breakdown q={shown} />
        </>)}

        {(state === "payment_pending" || state === "payment_review") && (<>
          <h2 style={{ marginTop: 20 }}>{state === "payment_review" ? "We're checking your payment" : "Pay by bank transfer"}</h2>
          <table className="lines"><tbody>
            <tr><td>Amount</td><td className="r"><strong>{aud2(shown.stack.amount_payable)}</strong></td></tr>
            <tr><td>Reference</td><td className="r"><strong>{q.payment_reference}</strong></td></tr>
            <tr><td>Account name</td><td className="r">DFRNT Solar (bank details at launch)</td></tr>
          </tbody></table>
          <p className="muted small">Once your payment lands we&apos;ll email you to pick your install date.</p>
          <Breakdown q={shown} />
        </>)}

        {state === "awaiting_date" && (<>
          <h2 style={{ marginTop: 20 }}>Pick your install date</h2>
          <p className="muted">These are your installer&apos;s real free days{shown.window.window_end ? `, all on or before ${longDate(shown.window.window_end)} so your rebate holds` : ""}.</p>
          {dates.length ? (
            <form action={pickDate}><input type="hidden" name="token" value={token} />
              <div className="filters">{dates.map((d) => <label key={d} className="chip"><input type="radio" name="date" value={d} required /> {longDate(d)}</label>)}</div>
              <button className="btn block" type="submit">Book this date</button></form>
          ) : <div className="note">No dates free inside your rebate window right now. We&apos;ll call you today to arrange one.</div>}
        </>)}

        {["booked", "gear_ordered", "delivered", "on_site", "variation_pending", "installed", "lodged", "settled", "complete"].includes(state) && (<>
          <div className="ok" style={{ marginTop: 16 }}>{q.install_date ? <>Install date: <strong>{longDate(q.install_date)}</strong>, arriving 7–8 am.</> : "Installed."} Status: <strong>{BOARD[state]}</strong>.</div>
          {variations.length > 0 && <><h2 style={{ marginTop: 24 }}>Changes to your install</h2>
            {variations.map((v) => (
              <div key={v.id as string} className="card" style={{ marginBottom: 10 }}>
                <div>{v.description as string} — <strong>{aud2(v.sell_inc as number)}</strong> inc GST · {v.status as string}</div>
                {v.status === "proposed" && <form action={approveVariation} style={{ display: "flex", gap: 8 }}>
                  <input type="hidden" name="token" value={token} /><input type="hidden" name="variation" value={v.id as string} />
                  <button className="btn sm" type="submit">Approve and pay</button>
                  <button className="btn ghost sm" formAction={declineVariation}>Decline</button></form>}
              </div>))}</>}
          {["installed", "lodged", "settled", "complete"].includes(state) && myCode && <div className="ok" style={{ marginTop: 16 }}>Your referral code: <strong>{myCode}</strong>. Friends get $250 off, and we pay you $250 after their install.</div>}
          {["booked", "gear_ordered", "delivered"].includes(state) && <p className="small"><Link href={`/contact?quote=${token}&kind=question`}>Need a different date?</Link> Tell us and we&apos;ll offer the next free days{shown.window.window_end ? ` (moving past ${longDate(shown.window.window_end)} means re-pricing at the new rebate)` : ""}.</p>}
          <p className="small"><Link href={`/contact?quote=${token}`}>Questions about your system?</Link></p>
          <h2 style={{ marginTop: 24 }}>Your documents</h2>
          <table className="lines"><tbody>{docs.map((d) => <tr key={d}><td>{d}</td><td className="r muted">{["installed", "lodged", "settled", "complete"].includes(state) || d === "Signed agreement" ? "ready" : "after install"}</td></tr>)}</tbody></table>
          <h2 style={{ marginTop: 24 }}>What you paid</h2>
          <Breakdown q={shown} />
        </>)}

        {["installed", "lodged", "settled", "complete"].includes(state) && (myReview
          ? <div className="ok" style={{ marginTop: 20 }}>Thanks for your review{myReview.status === "published" ? ". It's live on our reviews page" : ". We publish every review, good or bad, once we've checked it's from this install"}.</div>
          : <form action={leaveReview} className="card" style={{ marginTop: 20 }}>
            <input type="hidden" name="token" value={token} />
            <h3>How did we go?</h3>
            <p className="small muted">We publish every review, good or bad. Your first name and suburb show; nothing else.</p>
            <div className="pills" role="radiogroup" aria-label="Rating">{[5, 4, 3, 2, 1].map((n) => <label key={n} style={{ display: "inline-block" }}><input type="radio" name="rating" value={n} required style={{ position: "absolute", opacity: 0 }} /><span className="pill-r">{n} ★</span></label>)}</div>
            <p><textarea name="body" placeholder="What went well, what didn't" style={{ minHeight: 100 }} required /></p>
            <p className="small"><label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="checkbox" name="showcase" /> You can show photos of my install (no address or faces) on your real installs page.</label></p>
            <button className="btn">Send review</button>
          </form>)}
        {state === "cancelled" && <div className="note" style={{ marginTop: 16 }}>This order is cancelled. Any refund due goes back to your original payment method. <Link href="/systems">See systems</Link></div>}
        {(state === "expired" || state === "declined") && <div className="note" style={{ marginTop: 16 }}>This quote is closed. <Link href="/systems">Get a new price</Link></div>}

        {canCancel && (
          <details style={{ marginTop: 32 }}><summary className="small muted">Cancel my order</summary>
            <p className="small">{rule === "full_cooling_off" ? "You're inside the 10 business-day cooling-off period: full refund." : rule === "less_restocking" ? "Your gear has been ordered: refund less restocking and freight actually incurred." : "Refund in full less any cost we can't recover, as the agreement sets out."}</p>
            <form action={cancelOrder}><input type="hidden" name="token" value={token} />
              <Field label="Reason (optional)"><input name="reason" style={input} /></Field>
              <label className="small"><input type="checkbox" name="confirm" /> Yes, cancel my order</label>
              <p><button className="btn ghost" type="submit">Cancel order</button></p></form>
          </details>)}
      </div></section>
      <Footer />
    </>
  );
}
