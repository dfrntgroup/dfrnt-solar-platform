import { friendlySummary } from "@/lib/images";
import { leaveReview } from "./actions";
import { Share } from "@/components/Share";
import { LegalText } from "@/components/Legal";
import { AGREEMENT, SELLER } from "@/lib/legal";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@dfrnt/db";
import { JOB_SETS, JOB_STEPS, refundRule, statusLabel, type Quote } from "@dfrnt/engine";
import { Header, Footer } from "@/components/Header";
import { PhotoInput } from "@/components/PhotoInput";
import { getQuote, REVISABLE } from "@/lib/jobs";
import { plainLine } from "@/lib/plain-lines";
import { plainReason } from "@/lib/reasons";
import { daysFor, needsOf } from "@/lib/schedule";
import { DayPicker, dayLabel } from "@/components/DayPicker";
import { JobThread } from "@/components/JobThread";
import { SystemRecord } from "@/components/SystemRecord";
import { RecordUsage } from "@/components/RecordUsage";
import { AddOns } from "@/components/AddOns";
import { ServicePlan } from "@/components/ServicePlan";
import { Checkout, stepFor } from "@/components/Checkout";
import { CallBack } from "@/components/CallBack";
import { Trust } from "@/components/Trust";
import { StripePay } from "@/components/StripePay";
import { stripeReady, publishableKey, clientSecretFor, isOnline, PAYTO_MAX } from "@/lib/stripe";
import { financeLink } from "@/lib/jobs";
import { getSetting } from "@/lib/settings";
import { installersFor } from "@/lib/installers";
import { activeKinds, PHOTO_COPY, pricePromise, retakeKinds } from "@/lib/photos";
import { resendPhotos } from "./actions";
import { siteUrl } from "@/lib/messages";
import { dateAEST, todayAEST } from "@/lib/api";
import { aud, aud2, longDate } from "@/lib/site";
import { joinPlan, addAddonAction, removeAddonAction, reportProblem, passRecord, saveHeard, takeEarlierDay, changeMyDay, saveAccess, customerMessage, acceptRevision, keepOriginal, addCode, approveVariation, declineVariation, cancelOrder, payByBank, payOnline, changeHowIPay, payFinance, payVariation, acceptNextWindow, pickDate, signAgreement, submitHome } from "./actions";

export const dynamic = "force-dynamic";
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const metadata = { title: "Your solar record", robots: { index: false } };


function BankRows({ b }: { b: { account_name: string; bsb: string; account_number: string; bank: string } }) {
  if (!b.bsb || !b.account_number) return <tr><td colSpan={2} className="muted">Bank details are on their way. Call us on 1300 133 768 and we&apos;ll give them to you.</td></tr>;
  return <><tr><td>Account name</td><td className="r">{b.account_name}</td></tr>{b.bank ? <tr><td>Bank</td><td className="r">{b.bank}</td></tr> : null}
    <tr><td>BSB</td><td className="r"><strong>{b.bsb}</strong></td></tr><tr><td>Account number</td><td className="r"><strong>{b.account_number}</strong></td></tr></>;
}
function Breakdown({ q }: { q: Quote }) {
  const st = q.stack;
  return (
    <table className="lines"><tbody>
      {st.lines.filter((l) => l.kind !== "hardware" && l.kind !== "bos").map((l) => (
        <tr key={l.code}><td>{plainLine(l.code, l.description, l.qty, q.config?.panel_kw)}</td><td className="r">{l.sell_ex_gst != null ? aud2(l.sell_ex_gst) : "pending"}</td></tr>
      ))}
      <tr><td>Equipment: panels, inverter, battery, racking and cabling</td><td className="r">{aud2(st.hardware_ex_gst)}</td></tr>
      {st.discounts.map((d) => <tr key={d.code}><td>Discount: {d.code.replace("_", " ")}</td><td className="r">−{aud2(d.amount_inc_gst)} inc GST</td></tr>)}
      <tr><td>GST</td><td className="r">{aud2(st.gst)}</td></tr>
      <tr><td><strong>Total inc GST</strong></td><td className="r"><strong>{aud2(st.price_inc_gst)}</strong></td></tr>
      <tr><td>Government rebates<br /><span className="small muted">{st.stcs} certificates, assigned to us</span></td><td className="r">−{aud2(st.less_stcs)}</td></tr>
      <tr className="total"><td>You pay</td><td className="r">{aud2(st.amount_payable)}</td></tr>
    </tbody></table>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "block", margin: "10px 0" }}><span className="small muted" style={{ display: "block", marginBottom: 4 }}>{label}</span>{children}</label>
);
const input = { width: "100%", padding: "10px", border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;

export default async function Record({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const error = sp.error;
  if (!/^[0-9a-f]{36}$/.test(token)) notFound();
  const q = await getQuote(token);
  if (!q) {
    const { movedTo } = await import("@/lib/record");
    const moved = await movedTo(token);
    if (moved) return (<><Header postcode="4551" /><section><div className="wrap" style={{ maxWidth: 640 }}><h1 style={{ fontSize: 28 }}>This record has moved</h1>
      <p>It was passed to the home&apos;s new owner on {moved.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" })}, with a new private link. Questions? <Link href="/contact">Talk to a human</Link>.</p></div></section><Footer /></>);
  }
  if (q && sp.c && /^[0-9a-f-]{36}$/.test(sp.c)) await db()`update campaign_sends set clicked_at = coalesce(clicked_at, now()) where id = ${sp.c} and quote_id = ${q.id}`;
  const myReview = q ? (await db()`select status, rating, body from reviews where quote_id = ${q.id}`)[0] as { status: string; rating: number; body: string } | undefined : undefined;
  const googleReview = myReview && myReview.rating >= 4 ? (await getSetting("trust")).google_review_url : undefined;
  const inst = q?.installer_id ? (await db()`select id, business_name, licence_no, saa_accreditation from installers where id = ${q.installer_id} and active and not is_test`)[0] : undefined;
  if (!q) notFound();
  const shown = q.snapshot ?? q.result;
  const state = q.status;
  const step = JOB_STEPS.findIndex((g) => g.states.includes(state));
  const online = stripeReady() && !!publishableKey();
  const financeOpts = (await getSetting("finance")).providers.filter((x) => x.on && x.url);
  const bankAcct = await getSetting("bank");
  const bankOn = !!(bankAcct.bsb && bankAcct.account_number);
  const sysPay = JOB_SETS.AWAITING_PAYMENT.includes(state)
    ? (await db()`select id, method, status from payments where quote_id = ${q.id} and kind = 'system' and status in ('pending','review') order by created_at desc limit 1`)[0] : undefined;
  const paySecret = sysPay && isOnline(sysPay.method as string) && sysPay.status === "pending" && !sp.paid ? await clientSecretFor(sysPay.id as string).catch(() => null) : null;
  const varPays = await db()`select id, variation_id, amount::float8 amount from payments where quote_id = ${q.id} and kind = 'variation' and status = 'pending'`;
  const varSecret = sp.payv && /^[0-9a-f-]{36}$/.test(sp.payv) ? await clientSecretFor(sp.payv).catch(() => null) : null;
  const payReturn = `${siteUrl()}/quote/${token}?paid=1`;
  const lapsedRow = state === "lapsed" ? (await db()`select system_slug, input from quotes where id = ${q.id}`)[0] : undefined;
  const lapsedSlug = (lapsedRow?.system_slug as string | null) ?? null;
  const lapsedBuild = lapsedRow && !lapsedSlug && String(q.title ?? "").startsWith("Custom") ? (await import("@/lib/builder")).buildHref(lapsedRow.input as never, q.postcode as string) : null;
  const finProv = q.payment_method?.startsWith("finance:") ? (await getSetting("finance")).providers.find((x) => `finance:${x.id}` === q.payment_method) : undefined;
  const picking = state === "awaiting_date" || (JOB_SETS.HAS_DAY.includes(state) && q.rebook);
  const choice = picking ? await daysFor(q) : null;
  const { forwardOffer } = await import("@/lib/jobs");
  const fwd = q ? await forwardOffer(q).catch(() => null) : null;
  // Paid but no day left inside the window their price was for: a person sorts it (Ops sees it on the board).
  const stuck = state === "awaiting_date" && choice && choice.mode === "live" && !choice.slots.length && choice.until ? addDay(choice.until, 1) : null;
  const signDays = state === "priced" && q.installer_id ? await daysFor(q, { max: 3 }).catch(() => null) : null;
  const [earlier] = ["booked", "gear_ordered"].includes(state) && !q.rebook && sp.offer && /^[0-9a-f-]{36}$/.test(sp.offer)
    ? await db()`select id, dates::text[] dates from date_offers where id = ${sp.offer} and quote_id = ${q.id} and kind = 'earlier' and status = 'open' and expires_at > now()` : [];
  const threadOpen = ["awaiting_date", ...JOB_SETS.BOOKED, "installed"].includes(state);
  const variations = await db()`select id, description, sell_inc::float8 as sell_inc, status from variations where quote_id = ${q.id} order by created_at`;
  const [mine] = await db()`select code from codes where owner_quote_id = ${q.id} and active`;
  const myCode = mine?.code as string | undefined;
  const docs = ["Signed agreement", "Tax invoice", "Certificate of compliance", "STC assignment form", "Warranty cards"];
  const canCancel = JOB_SETS.CAN_CANCEL.includes(state);
  const open = JOB_SETS.OPEN_CHECKOUT.includes(state);
  const have = open ? await activeKinds(q.id) : new Set<string>();
  const pricing = JOB_SETS.PRICING.includes(state);
  const retakes = pricing ? await retakeKinds(q.id) : [];
  // The launch rule ("installer confirms every job") is not a thing wrong with the home; don't list it as one.
  const checks = (q.pricing_reasons ?? []).filter((r) => r !== "Installer confirms every job" && r !== "No installer covers this postcode yet");
  const choices = open && q.site_draft?.address ? await installersFor(q.site_draft.address.postcode ?? q.postcode, needsOf(q)) : [];
  const [fee] = q.design_fee_status === "due" ? await db()`select amount::float8 amount, reference from payments where quote_id = ${q.id} and kind = 'report' and status = 'pending' limit 1` : [];
  const rev = q.revision && REVISABLE.includes(state) ? q.revision : null;
  const rule = canCancel && q.signed_at ? refundRule(dateAEST(q.signed_at), todayAEST(), state) : null;

  return (
    <>
      <Header postcode={q.postcode} back={`/quote/${token}`} />
      <section><div className="wrap" style={{ maxWidth: 720 }}>
        <p className="eyebrow">Your solar record · {statusLabel(q, todayAEST())}</p>
        <h1 style={{ fontSize: 30 }}>{q.title ?? friendlySummary(shown.config.summary)}</h1>
        <p className="muted small">{friendlySummary(shown.config.summary)}</p>
        {inst && !open && <p className="small">Installed by <Link href={`/installers/${inst.id}`}>{inst.business_name as string}</Link></p>}
        {step >= 0 && !open && <div className="filters">{JOB_STEPS.map(({ label: n }, i) => <span key={n} className={`chip${i === step ? " on" : ""}`} style={{ opacity: i > step ? 0.5 : 1 }}>{i < step ? "✓ " : ""}{n}</span>)}</div>}
        {error && !open && <div className="note" style={{ margin: "12px 0" }}>{error}</div>}

        {rev && (
          <div className="card" style={{ marginTop: 16, borderColor: "var(--teal)" }}>
            <strong>We&apos;ve suggested a change to your system</strong>
            <span className="small">{rev.reason}</span>
            <table className="lines"><tbody>
              <tr><td className="muted">Was</td><td>{friendlySummary(rev.from.summary)}</td><td className="r">{aud(rev.from.amount)}</td></tr>
              <tr><td><strong>Now</strong></td><td>{friendlySummary(rev.priced.config.summary)}</td><td className="r"><strong>{aud(rev.priced.stack.amount_payable)}</strong></td></tr>
              <tr className="total"><td>Difference</td><td /><td className="r">{rev.priced.stack.amount_payable >= rev.from.amount ? "+" : "−"}{aud(Math.abs(rev.priced.stack.amount_payable - rev.from.amount))}</td></tr>
            </tbody></table>
            <span className="small muted">Same locked prices and rebate as your original. Installed after rebates, inc GST.</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <form action={acceptRevision}><input type="hidden" name="token" value={token} /><button className="btn" type="submit">Accept the change</button></form>
              <form action={keepOriginal}><input type="hidden" name="token" value={token} /><button className="btn ghost" type="submit">Keep my original</button></form>
            </div>
          </div>)}

        <RecordUsage q={q} sp={sp} />
        {fwd && <div className="card" style={{ marginTop: 16, borderLeft: "4px solid var(--teal)" }}>
          <strong>Installs up to {longDate(addDay(fwd.from, -1))} are fully booked in your area.</strong>
          <span className="small">Your price ({aud2(fwd.was)}) was for an install by then, and there are no days left to give you. The rebate is lower from {longDate(fwd.from)}, so today&apos;s price for an install from then is <strong>{aud2(fwd.now)}</strong>.</span>
          <form action={acceptNextWindow} style={{ marginTop: 10 }}><input type="hidden" name="token" value={token} /><button className="btn" type="submit">Accept {aud2(fwd.now)} for an install from {longDate(fwd.from)}</button></form>
          <span className="small muted" style={{ marginTop: 6 }}>Or don&apos;t go ahead: {["signed", "payment_pending"].includes(state) ? "cancel below for a full refund of anything you've paid" : "nothing is owed"}. Questions? Call 1300 133 768.</span>
        </div>}
        {stuck && <div className="note" style={{ marginTop: 16 }}><strong>Installs up to {longDate(addDay(stuck, -1))} are fully booked in your area.</strong> We&apos;ll call you today to sort your install date. Nothing is lost: your payment is safe.</div>}
        {state === "lapsed" && (<>
          <div className="note" style={{ marginTop: 16 }}><strong>This price expired on {longDate(q.lock_until)}.</strong> Prices and the rebate move over time, so we can&apos;t hold it any longer.</div>
          <p style={{ marginTop: 12 }}><Link className="btn block" href={lapsedSlug ? `/systems/${lapsedSlug}?postcode=${q.postcode}` : lapsedBuild ?? `/systems?postcode=${q.postcode}`}>See today&apos;s price for this system</Link></p>
          <CallBack back={`/quote/${token}`} token={token} state={sp.callback} compact />
        </>)}
        {(state === "saved" || state === "secured") && (<>
          <div className="pay" style={{ margin: "16px 0 6px" }}><small>You pay, installed</small>{aud(q.result.stack.amount_payable)}</div>
          {!fwd && <div className="ok">Price and rebate locked until <strong>{longDate(q.lock_until)}</strong>. Keep this link: it&apos;s your record.</div>}
          <p style={{ marginTop: 10 }}><Share title="Our solar price" text={`${q.title ?? "Solar and battery"}: ${aud(q.result.stack.amount_payable)} installed, locked until ${longDate(q.lock_until)}.`} label="Send to someone at home" /></p>
          {q.design_fee_status === "due" ? (
            <div className="card" style={{ marginTop: 20 }}>
              <strong>One step left: your design check</strong>
              <span className="small">Your home needs an installer to check your photos before we confirm the price{q.pricing_reasons?.length ? ` (${q.pricing_reasons.map(plainReason).join("; ").toLowerCase()})` : ""}. The design check is {aud(fee?.amount ?? 99)}, and it comes off your system price when you go ahead.</span>
              <table className="lines"><tbody>
                <tr><td>Amount</td><td className="r"><strong>{aud(fee?.amount ?? 99)}</strong></td></tr>
                <tr><td>Reference</td><td className="r"><strong>{fee?.reference}</strong></td></tr>
                <BankRows b={bankAcct} />
              </tbody></table>
              <span className="small muted">Once it lands, your installer checks your photos and we email your confirmed price.</span>
              <CallBack back={`/quote/${token}`} token={token} state={sp.callback} compact />
            </div>
          ) : <Checkout q={q} step={stepFor(q, sp.step)} sp={sp} have={have} installers={choices} recordUrl={`${siteUrl()}/quote/${token}`} />}
        </>)}

        {pricing && (<>
          {retakes.length > 0 ? (
            <form action={resendPhotos} className="card" style={{ marginTop: 16, borderColor: "var(--teal)" }}>
              <input type="hidden" name="token" value={token} />
              <strong>Your installer needs {retakes.length === 1 ? "one photo" : `${retakes.length} photos`} again.</strong>
              <p className="small muted" style={{ margin: "4px 0 8px" }}>Your price stays held while you do this. Take it in daylight, hold still, and get the whole thing in the frame.</p>
              {retakes.map((r) => (
                <div key={r.kind} className="card" style={{ marginBottom: 10, padding: 12 }}>
                  <strong>{PHOTO_COPY[r.kind][0]}</strong><span className="small muted">{PHOTO_COPY[r.kind][1]}</span>
                  {r.reason ? <span className="small">Your installer said: &ldquo;{r.reason}&rdquo;</span> : null}
                  <PhotoInput name={`photo_${r.kind}`} token={token} kind={r.kind} />
                </div>))}
              <button className="btn block" type="submit">Send</button>
            </form>
          ) : (
            <div className="ok" style={{ marginTop: 16 }}>
              <strong>{state === "tech_review" ? "We're finding the right installer for your home." : checks.length ? `Your installer is checking ${checks.length === 1 ? "one thing" : `${["", "", "two", "three", "four", "five"][checks.length] ?? checks.length} things`} on your home.` : "Your installer is checking your photos and confirming your price."}</strong> You&apos;ll get your confirmed price by email, {pricePromise()}. Your price stays held while they do.
              {checks.length ? <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{checks.map((r) => <li key={r}>{plainReason(r)}</li>)}</ul> : null}
            </div>
          )}
          <CallBack back={`/quote/${token}`} token={token} state={sp.callback} compact />
        </>)}

        {JOB_SETS.CODE_OK.includes(state) && (q.discount_code
          ? <p className="small ok" style={{ marginTop: 12 }}>Code {q.discount_code} applied: {aud(q.referral_discount ?? 0)} off before GST.</p>
          : <form action={addCode} style={{ display: "flex", gap: 8, marginTop: 12 }}><input type="hidden" name="token" value={token} />
              <input aria-label="Referral or creator code" name="code" placeholder="Referral or creator code" style={{ ...input, width: 220 }} /><button className="btn ghost sm" type="submit">Apply</button></form>)}
        {state === "priced" && (<>
          <h2 style={{ marginTop: 20 }}>Your confirmed price</h2>
          <Breakdown q={shown} />
          <AddOns q={q} add={addAddonAction} remove={removeAddonAction} />
          <ServicePlan q={q} join={joinPlan} />
          <h2 style={{ marginTop: 28 }}>Sign</h2>
          <p className="muted small">One agreement covers the equipment, the installation, and assigning your STCs to us. You have 10 business days after signing to cancel for any reason with a full refund.</p>
          <table className="incl" style={{ marginBottom: 12 }}><tbody>
            <tr><td className="k">Your system</td><td>{q.title ?? shown.config.summary}</td></tr>
            {q.site && <tr><td className="k">Install address</td><td>{[q.site.address.unit ? `Unit ${q.site.address.unit}` : "", q.site.address.line1, q.site.address.suburb, q.site.address.state, q.site.address.postcode].filter(Boolean).join(", ")}</td></tr>}
            <tr><td className="k">Your price</td><td><strong>{aud2(shown.stack.amount_payable)}</strong> installed, inc GST, rebate of {aud2(shown.stack.less_stcs)} already off</td></tr>
            <tr><td className="k">Your installer</td><td>{inst ? <>{inst.business_name as string}{inst.licence_no ? ` · electrical licence ${inst.licence_no as string}` : ""}{inst.saa_accreditation ? ` · SAA ${inst.saa_accreditation as string}` : ""}</> : "A licensed, SAA-accredited electrician assigned before your install day"}</td></tr>
            <tr><td className="k">Install day</td><td>{signDays?.slots.length ? <>You pick after paying. Next free: {signDays.slots.slice(0, 3).map((d) => longDate(d.date)).join(" · ")}</> : "You pick from your installer's free days after paying"}{signDays?.until ? <><br /><span className="small muted">Every day offered is on or before {longDate(signDays.until)}, so your rebate holds.</span></> : null}</td></tr>
            <tr><td className="k">Price held until</td><td>{longDate(q.lock_until)}</td></tr>
          </tbody></table>
          <LegalText sections={AGREEMENT} compact />
          <p className="small"><Link href="/agreement" target="_blank">Open the agreement in full</Link> · <Link href="/privacy" target="_blank">Privacy policy</Link></p>
          <form action={signAgreement}>
            <input type="hidden" name="token" value={token} />
            <Field label="Type your full name"><input name="name" style={input} defaultValue={q.customer_name ?? ""} /></Field>
            <label className="small"><input type="checkbox" name="agree" /> I have read and accept the installation agreement, and assign the STCs for this system to DFRNT Solar.</label>
            <p><button className="btn block" type="submit">Sign agreement</button></p>
          </form>
          <Trust installer={inst ? { business_name: inst.business_name as string, licence_no: (inst.licence_no as string) ?? null, saa_accreditation: (inst.saa_accreditation as string) ?? null } : null} />
          <CallBack back={`/quote/${token}`} token={token} state={sp.callback} compact />
        </>)}

        {state === "signed" && (<>
          <h2 style={{ marginTop: 20 }}>How would you like to pay?</h2>
          <p className="muted small">One payment for everything. Paying from your bank{shown.stack.amount_payable <= PAYTO_MAX ? " (PayTo or transfer)" : " by transfer"} saves about 1%.</p>
          <ul className="guar small" style={{ margin: "4px 0 12px" }}><li>10 business days to change your mind, full refund</li><li>Paid straight to {SELLER.name}, never to an installer</li></ul>
          {online && shown.stack.amount_payable <= PAYTO_MAX && <form action={payOnline}><input type="hidden" name="token" value={token} /><input type="hidden" name="method" value="payto" />
            <button className="btn block" type="submit">PayTo: approve in your banking app (save about 1%)</button></form>}
          {online && <form action={payOnline} style={{ marginTop: 8 }}><input type="hidden" name="token" value={token} /><input type="hidden" name="method" value="card" />
            <button className="btn ghost block" type="submit">Card, Apple Pay or Google Pay</button></form>}
          {bankOn && <form action={payByBank} style={{ marginTop: 8 }}><input type="hidden" name="token" value={token} />
            <button className={online ? "btn ghost block" : "btn block"} type="submit">Bank transfer (save about 1%)</button></form>}
          {!online && !bankOn && financeOpts.length === 0 && <div className="note">Our payment page is being set up. Call us on {SELLER.phone} and we&apos;ll take your payment over the phone or email you our bank details, with your reference, straight away. Your signed price is safe.</div>}
          {financeOpts.map((fp) => <form key={fp.id} action={payFinance} style={{ marginTop: 8 }}><input type="hidden" name="token" value={token} /><input type="hidden" name="provider" value={fp.id} />
            <button className="btn ghost block" type="submit">Finance with {fp.name}{fp.blurb ? `: ${fp.blurb.toLowerCase()}` : ""}</button></form>)}
          <div className="scam"><strong>We&apos;ll never email you new bank details.</strong> If anyone asks you to pay a different account, don&apos;t pay. Call us on {SELLER.phone} to check.</div>
          <Breakdown q={shown} />
        </>)}

        {(state === "payment_pending" || state === "payment_review") && (<>
          {isOnline(q.payment_method) ? (state === "payment_review" || sp.paid ? (<>
            <h2 style={{ marginTop: 20 }}>{state === "payment_review" ? "Your payment is on its way" : "Confirming your payment"}</h2>
            <div className="ok">{state === "payment_review" ? "Your bank is processing it. We'll email you as soon as it lands, then you pick your install day." : "Thanks. We're confirming it with your bank; this page updates by itself."}</div>
            {state === "payment_pending" && <meta httpEquiv="refresh" content="5" />}
          </>) : (<>
            <h2 id="pay" style={{ marginTop: 20 }}>Pay {aud2(shown.stack.amount_payable)} by {q.payment_method === "payto" ? "PayTo" : "card"}</h2>
            {paySecret && publishableKey()
              ? <StripePay publishableKey={publishableKey()} clientSecret={paySecret} returnUrl={payReturn} label={`Pay ${aud2(shown.stack.amount_payable)}`} />
              : <div className="note">We couldn&apos;t load the payment form. Try again in a minute, or choose another way to pay.</div>}
            <form action={changeHowIPay} style={{ marginTop: 8 }}><input type="hidden" name="token" value={token} /><button className="btn ghost sm" type="submit">Change how I pay</button></form>
          </>)) : finProv ? (<>
            <h2 style={{ marginTop: 20 }}>Finish your application with {finProv.name}</h2>
            <p className="small">Apply for {aud2(shown.stack.amount_payable)} using reference <strong>{q.payment_reference}</strong>. Once {finProv.name} approves and pays us, we&apos;ll email you to pick your install day.</p>
            <p><a className="btn block" href={financeLink(finProv.url, q.payment_reference ?? "", shown.stack.amount_payable)} target="_blank" rel="noreferrer">Apply with {finProv.name}</a></p>
            {state === "payment_pending" && <form action={changeHowIPay}><input type="hidden" name="token" value={token} /><button className="btn ghost sm" type="submit">Change how I pay</button></form>}
          </>) : (<>
            <h2 style={{ marginTop: 20 }}>{state === "payment_review" ? "We're checking your payment" : "Pay by bank transfer"}</h2>
            <table className="lines"><tbody>
              <tr><td>Amount</td><td className="r"><strong>{aud2(shown.stack.amount_payable)}</strong></td></tr>
              <tr><td>Reference</td><td className="r"><strong>{q.payment_reference}</strong></td></tr>
              <BankRows b={bankAcct} />
            </tbody></table>
            <p className="muted small">Once your payment lands we&apos;ll email you to pick your install day.</p>
            <div className="scam"><strong>We&apos;ll never email you new bank details.</strong> If anyone asks you to pay a different account, don&apos;t pay. Call us on {SELLER.phone} to check.</div>
            {state === "payment_pending" && <form action={changeHowIPay}><input type="hidden" name="token" value={token} /><button className="btn ghost sm" type="submit">Change how I pay</button></form>}
          </>)}
          <p className="small"><a href={`/quote/${token}/doc/agreement`} target="_blank">Your signed agreement (PDF)</a></p>
          <Breakdown q={shown} />
        </>)}

        {JOB_SETS.AFTER_PAY.includes(state) && !q.heard_from && (
          <form action={saveHeard} className="card" style={{ marginTop: 16 }}><input type="hidden" name="token" value={token} />
            <strong>Quick one: how did you hear about us?</strong>
            <div className="filters">{([["facebook", "Facebook or Instagram"], ["google", "Google"], ["youtube", "YouTube"], ["friend", "A friend or family"], ["saw_install", "Saw one of our installs"], ["other", "Something else"]] as const).map(([v, t]) =>
              <button key={v} className="chip" name="heard" value={v} type="submit">{t}</button>)}</div>
            <input aria-label="Anything more? (optional, e.g. which video)" name="note" placeholder="Anything more? (optional, e.g. which video)" style={{ ...input, marginTop: 6 }} />
          </form>)}
        {picking && choice && (<>
          <h2 style={{ marginTop: 20 }}>{q.rebook ? "Pick your new install day" : "Pick your install day"}</h2>
          <DayPicker token={token} choice={choice} action={pickDate} rebook={q.rebook} />
          <CallBack back={`/quote/${token}`} token={token} state={sp.callback} compact />
        </>)}
        {earlier && (
          <div className="card" style={{ marginTop: 16, borderColor: "var(--teal)" }}>
            <strong>An earlier day opened up: {longDate((earlier.dates as string[])[0]!)}</strong>
            <span className="small">Want it instead of {q.install_date ? longDate(q.install_date) : "your current day"}? First to tap gets it. If it&apos;s gone, your current day stays.</span>
            <form action={takeEarlierDay}><input type="hidden" name="token" value={token} /><input type="hidden" name="offer" value={earlier.id as string} /><button className="btn" type="submit">Yes, move me earlier</button></form>
          </div>)}

        {[...JOB_SETS.BOOKED, ...JOB_SETS.INSTALLED].includes(state) && (<>
          {!q.rebook && <div className="ok" style={{ marginTop: 16 }}>{q.install_date ? <>Install day: <strong>{dayLabel([q.install_date], q.install_part)}{q.job_days && q.job_days > 1 ? ` (${q.job_days} days)` : ""}</strong>, arriving 7–8 am.</> : "Installed."} Status: <strong>{statusLabel(q)}</strong>.</div>}
          {JOB_SETS.HAS_DAY.includes(state) && <AddOns q={q} add={addAddonAction} remove={removeAddonAction} />}
          {JOB_SETS.HAS_DAY.includes(state) && !q.rebook && (
            <form action={saveAccess} className="card" style={{ marginTop: 12 }}><input type="hidden" name="token" value={token} />
              <strong>Access on the day</strong><span className="small muted">Gate code, pets, where to park, who&apos;ll be home. Your installer sees this.</span>
              <textarea name="access" defaultValue={q.access_notes ?? ""} maxLength={1000} style={{ minHeight: 60, padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" }} />
              <button className="btn ghost sm" type="submit">Save</button></form>)}
          {state === "booked" && !q.rebook && q.install_date && <details style={{ marginTop: 8 }}><summary className="small muted">Need a different day?</summary>
            <form action={changeMyDay} style={{ marginTop: 8 }}><input type="hidden" name="token" value={token} />
              <p className="small">You&apos;ll pick a new day from your installer&apos;s free days, inside your rebate deadline. Within 3 working days of install, call us instead.</p>
              <button className="btn ghost sm" type="submit">Release my day and pick another</button></form></details>}
          {variations.length > 0 && <><h2 style={{ marginTop: 24 }}>Changes to your install</h2>
            {variations.map((v) => (
              <div key={v.id as string} className="card" style={{ marginBottom: 10 }}>
                <div>{v.description as string} — <strong>{aud2(v.sell_inc as number)}</strong> inc GST · {v.status as string}</div>
                {v.status === "proposed" && <form action={approveVariation} style={{ display: "flex", gap: 8 }}>
                  <input type="hidden" name="token" value={token} /><input type="hidden" name="variation" value={v.id as string} />
                  <button className="btn sm" type="submit">Approve and pay</button>
                  <button className="btn ghost sm" formAction={declineVariation}>Decline</button></form>}
                {online && varPays.filter((vp) => vp.variation_id === v.id).map((vp) => (
                  <form key={vp.id as string} action={payVariation} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    <input type="hidden" name="token" value={token} /><input type="hidden" name="payment" value={vp.id as string} />
                    <span className="small">To pay: <strong>{aud2(vp.amount as number)}</strong></span>
                    {(vp.amount as number) <= PAYTO_MAX && <button className="btn sm" name="method" value="payto" type="submit">Pay by PayTo</button>}
                    <button className="btn ghost sm" name="method" value="card" type="submit">Pay by card</button></form>))}
              </div>))}
            {varSecret && publishableKey() && <div id="pay"><StripePay publishableKey={publishableKey()} clientSecret={varSecret} returnUrl={payReturn} label="Pay for this change" /></div>}</>}
          {JOB_SETS.INSTALLED.includes(state) && myCode && <div className="ok" style={{ marginTop: 16 }}>Your referral code: <strong>{myCode}</strong>. Friends get $250 off, and we pay you $250 after their install.</div>}
          {threadOpen && <JobThread quoteId={q.id} action={customerMessage} hidden={<input type="hidden" name="token" value={token} />} me="customer" />}
          <p className="small"><Link href={`/contact?quote=${token}`}>Questions about your system?</Link></p>
          {JOB_SETS.INSTALLED.includes(state) ? <><ServicePlan q={q} join={joinPlan} /><SystemRecord q={q} report={reportProblem} transfer={passRecord} sent={sp.sent} /></> : <>
          <h2 style={{ marginTop: 24 }}>Your documents</h2>
          <table className="lines"><tbody>{docs.map((d) => {
            const href = d === "Signed agreement" ? `/quote/${token}/doc/agreement` : d === "Tax invoice" && q.paid_at ? `/quote/${token}/doc/invoice` : null;
            return <tr key={d}><td>{href ? <a href={href} target="_blank">{d}</a> : d}</td><td className="r muted">{href ? "PDF" : d === "Tax invoice" ? "once paid" : "after install"}</td></tr>;
          })}</tbody></table></>}
          <h2 style={{ marginTop: 24 }}>What you paid</h2>
          <Breakdown q={shown} />
        </>)}

        {JOB_SETS.INSTALLED.includes(state) && (myReview
          ? <><div className="ok" style={{ marginTop: 20 }}>Thanks for your review{myReview.status === "published" ? ". It's live on our reviews page" : ". We publish every review, good or bad, once we've checked it's from this install"}.</div>
            {googleReview && <div className="card" style={{ marginTop: 10 }}><strong>Would you post it on Google too?</strong>
              <span className="small muted">It helps local families find an installer they can trust. Copy your words, then tap the button.</span>
              <textarea readOnly defaultValue={myReview.body} style={{ ...input, minHeight: 80 }} />
              <a className="btn" href={googleReview} target="_blank" rel="noreferrer">Post on Google</a></div>}</>
          : <form action={leaveReview} className="card" style={{ marginTop: 20 }}>
            <input type="hidden" name="token" value={token} />
            <h3>How did we go?</h3>
            <p className="small muted">We publish every review, good or bad. Your first name and suburb show; nothing else.</p>
            <div className="pills" role="radiogroup" aria-label="Rating">{[5, 4, 3, 2, 1].map((n) => <label key={n} style={{ display: "inline-block" }}><input type="radio" name="rating" value={n} required style={{ position: "absolute", opacity: 0 }} /><span className="pill-r">{n} ★</span></label>)}</div>
            <p><textarea aria-label="What went well, what didn't" name="body" placeholder="What went well, what didn't" style={{ minHeight: 100 }} required /></p>
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
