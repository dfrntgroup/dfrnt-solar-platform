// C1: the three-step checkout after "Secure this price": 1 you · 2 your home · 3 photos. Each step saves as it goes.
import Link from "next/link";
import QRCode from "qrcode";
import type { QuoteRow } from "@/lib/jobs";
import type { InstallerOption } from "@/lib/installers";
import { AddressInput } from "./AddressInput";
import { PhotoInput } from "./PhotoInput";
import { PhotoCount } from "./PhotoCount";
import { CallBack } from "./CallBack";
import { Trust } from "./Trust";
import { aud, longDate } from "@/lib/site";
import { emailMeLink, saveContact, saveHome, savePhotos, submitHome } from "@/app/quote/[token]/actions";

const input = { width: "100%", padding: "10px", border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label style={{ display: "block", margin: "10px 0" }}><span className="small" style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>{label}</span>
    {hint && <span className="small muted" style={{ display: "block", marginBottom: 4 }}>{hint}</span>}{children}</label>
);
const Sel = ({ name, value, opts }: { name: string; value?: string; opts: [string, string][] }) => (
  <select name={name} style={input} defaultValue={value ?? opts[0]![0]}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
);

export const PHOTOS: [string, string, string][] = [
  ["switchboard", "Switchboard, door open", "Stand back so the whole board and its labels are in the shot."],
  ["meter", "Electricity meter", "Close enough to read the numbers on it."],
  ["roof", "Roof, from the street", "The side the panels would go on, if you can."],
  ["battery_location", "Where the battery goes", "The wall, with a metre or so of space either side showing."],
];

export function stepFor(q: QuoteRow, asked?: string) {
  const max = !q.customer_email || !q.checkout_at ? 1 : !q.site_draft?.address ? 2 : 3;
  const want = Number(asked);
  return want >= 1 && want <= max ? want : max;
}

export async function Checkout({ q, step, sp, have, installers, recordUrl }: {
  q: QuoteRow; step: number; sp: Record<string, string | undefined>; have: Set<string>; installers: InstallerOption[]; recordUrl: string;
}) {
  const token = q.token;
  const d = q.site_draft ?? {};
  const back = `/quote/${token}?step=${step}`;
  const names = ["You", "Your home", "Photos"];
  const qr = step === 3 ? await QRCode.toString(recordUrl + "?step=3", { type: "svg", margin: 1, width: 132 }) : "";
  return (
    <div id="checkout" style={{ marginTop: 22 }}>
      <h2 style={{ marginBottom: 4 }}>Get your confirmed price</h2>
      <p className="muted small" style={{ marginTop: 0 }}>Three short steps, about two minutes. Saved as you go: come back to this link any time.</p>
      <ol className="progress" aria-label="Checkout progress">
        {names.map((n, i) => {
          const k = i + 1, reachable = k <= stepFor(q);
          const label = <><b>{k < step ? "✓" : k}</b>{n}</>;
          return <li key={n} className={k === step ? "on" : k < step ? "done" : ""} aria-current={k === step ? "step" : undefined}>
            {reachable && k !== step ? <Link href={`/quote/${token}?step=${k}#checkout`}>{label}</Link> : <span>{label}</span>}</li>;
        })}
      </ol>
      {sp.error && <div className="note" style={{ margin: "12px 0" }}>{sp.error}</div>}

      {step === 1 && (
        <form action={saveContact}>
          <input type="hidden" name="token" value={token} />
          <Field label="Your name"><input name="name" style={input} required defaultValue={q.customer_name ?? ""} autoComplete="name" /></Field>
          <Field label="Mobile" hint="Only for your install and anything urgent about it."><input aria-label="0412 345 678" name="phone" style={input} required inputMode="tel" autoComplete="tel" defaultValue={q.customer_phone ?? ""} placeholder="0412 345 678" /></Field>
          <Field label="Email" hint="We send your record link here, so you can pick up where you left off."><input name="email" type="email" style={input} required autoComplete="email" defaultValue={q.customer_email ?? ""} /></Field>
          <button className="btn block" type="submit">Next: your home →</button>
        </form>)}

      {step === 2 && (
        <form action={saveHome}>
          <input type="hidden" name="token" value={token} />
          <h3 style={{ marginTop: 6 }}>Address</h3>
          <AddressInput start={{ unit: d.address?.unit, line1: d.address?.line1, suburb: d.address?.suburb, postcode: d.address?.postcode ?? q.postcode, gnafPid: d.address?.gnafPid }} />
          <Field label="Is it a unit, townhouse, duplex or on a strata title?"><Sel name="multi" value={d.address?.unit ? "yes" : "no"} opts={[["no", "No, a house on its own block"], ["yes", "Yes"]]} /></Field>
          <h3 style={{ marginTop: 18 }}>Your home</h3>
          <Field label="Power supply" hint="Three phase has three main switches side by side on the switchboard. Not sure is fine."><Sel name="phases" value={String(d.phases ?? "1")} opts={[["1", "Single phase (most homes)"], ["3", "Three phase"], ["unknown", "Not sure"]]} /></Field>
          <Field label="Roof"><Sel name="roofType" value={d.roofType} opts={[["tin", "Metal (Colorbond corrugated)"], ["tile", "Tiles"], ["kliplok", "Klip-Lok (flat metal ribs)"]]} /></Field>
          <Field label="Storeys"><Sel name="storeys" value={String(d.storeys ?? 1)} opts={[["1", "Single storey"], ["2", "Two storeys"], ["3", "Three or more"]]} /></Field>
          <Field label="Switchboard"><Sel name="switchboard" value={d.switchboard} opts={[["ok", "Modern, with spare space"], ["needs_subboard", "Full or old (ceramic fuses)"], ["unsure", "Not sure"]]} /></Field>
          <h3 style={{ marginTop: 18 }}>The battery spot</h3>
          <Field label="Where would the battery go?"><Sel name="batteryLocation" value={d.batteryLocation} opts={[["garage", "In the garage"], ["outdoor_wall", "On an outside wall"], ["other", "Somewhere else"]]} /></Field>
          <Field label="Is that wall shared with a bedroom or living room?"><Sel name="againstHabitableRoom" value={d.againstHabitableRoom ? "yes" : "no"} opts={[["no", "No"], ["yes", "Yes"]]} /></Field>
          <Field label="Could a car bump it there?"><Sel name="vehicleExposure" value={d.vehicleExposure ? "yes" : "no"} opts={[["no", "No"], ["yes", "Yes"]]} /></Field>
          <details style={{ margin: "14px 0" }}><summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>From your power bill (optional, saves a step later)</summary>
            <Field label="NMI" hint="10 or 11 letters and numbers on your electricity bill."><input aria-label="e.g. 3120123456" name="nmi" style={input} defaultValue={d.nmi ?? ""} placeholder="e.g. 3120123456" autoComplete="off" /></Field>
            <Field label="Electricity retailer"><input aria-label="e.g. Origin, AGL" name="energyRetailer" style={input} defaultValue={d.energyRetailer ?? ""} placeholder="e.g. Origin, AGL" /></Field>
            <Field label="Has this home already claimed a battery rebate?"><Sel name="priorBatteryClaim" value={d.priorBatteryClaim ? "yes" : "no"} opts={[["no", "No"], ["yes", "Yes"]]} /></Field>
          </details>
          <button className="btn block" type="submit">Next: photos →</button>
        </form>)}

      {step === 3 && (<>
        <form action={submitHome}>
          <input type="hidden" name="token" value={token} />
          <p className="small" style={{ marginTop: 6 }}>Four photos from your phone. Your installer uses them instead of a site visit. <PhotoCount initial={[...have]} /></p>
          {PHOTOS.map(([k, t, hint]) => (
            <div key={k} className="card" style={{ marginBottom: 10, padding: 12, borderColor: have.has(k) ? "var(--teal)" : undefined }}>
              <strong>{have.has(k) ? "✓ " : ""}{t}</strong><span className="small muted">{hint}</span>
              {have.has(k) ? <span className="small">Got it. Add another to replace it:</span> : null}
              <PhotoInput name={`photo_${k}`} token={token} kind={k} />
            </div>))}
          {installers.length > 1 && (<>
            <h3 style={{ marginTop: 18 }}>Choose your installer</h3>
            <p className="small muted" style={{ marginTop: 0 }}>Same price whoever you pick. Every installer is a licensed electrician with Solar Accreditation Australia accreditation.</p>
            {installers.map((i, n) => (
              <label key={i.id} className="card" style={{ display: "flex", flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 8, padding: 12, cursor: "pointer" }}>
                <input type="radio" name="installer" value={i.id} defaultChecked={q.chosen_installer_id ? q.chosen_installer_id === i.id : n === 0} style={{ marginTop: 4 }} />
                <span><strong>{i.business_name}</strong><br />
                  <span className="small">{i.earliest ? <>Earliest install <strong>{longDate(i.earliest)}</strong></> : "Dates confirmed after pricing"}
                    {i.average ? ` · ${i.average} ★ from ${i.reviews} reviews` : i.reviews ? ` · ${i.reviews} review${i.reviews > 1 ? "s" : ""}` : ""}{i.installs ? ` · ${i.installs} installs with us` : ""}</span><br />
                  <span className="small muted">{i.licence_no ? `Licence ${i.licence_no} · ` : ""}{i.saa_accreditation ? `SAA ${i.saa_accreditation} · ` : ""}<Link href={`/installers/${i.id}`} target="_blank">Profile</Link></span></span>
              </label>))}
          </>)}
          {installers.length === 1 && <p className="small muted">Your installer: <Link href={`/installers/${installers[0]!.id}`} target="_blank">{installers[0]!.business_name}</Link>{installers[0]!.earliest ? `, earliest install ${longDate(installers[0]!.earliest)}` : ""}.</p>}
          <p style={{ marginTop: 14 }}><button className="btn block" type="submit">Get my confirmed price</button></p>
          <p className="small" style={{ textAlign: "center" }}><button className="btn ghost sm" formAction={savePhotos} type="submit">Save these and finish later</button></p>
          <p className="small muted">Standard homes get the confirmed price straight away. Anything unusual, your installer checks the photos and confirms it, usually the same day. Either way you see the price before you pay anything.</p>
        </form>
        <div className="card" style={{ marginTop: 12, padding: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div className="hide-sm" aria-hidden dangerouslySetInnerHTML={{ __html: qr }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong className="hide-sm">Easier on your phone?</strong><strong className="show-sm" style={{ fontSize: 16 }}>Not at home right now?</strong>
            <span className="small muted" style={{ display: "block" }}><span className="hide-sm">Scan this with your phone camera, or get the link by email and take the photos when you&apos;re next home.</span><span className="show-sm" style={{ fontSize: 13 }}>Email yourself the link and take the photos later.</span></span>
            {sp.sent ? <p className="small ok" style={{ margin: "6px 0 0" }}>Sent to {q.customer_email}.</p> :
              <form action={emailMeLink} style={{ marginTop: 8 }}><input type="hidden" name="token" value={token} /><button className="btn ghost sm" type="submit">Email me the link</button></form>}
          </div>
        </div>
      </>)}

      <CallBack back={back} token={token} state={sp.callback} compact />
      <Trust />
      <p className="small muted" style={{ marginTop: 10 }}>Price {aud(q.result.stack.amount_payable)} locked until {longDate(q.lock_until)}. Nothing to pay until you&apos;ve seen your confirmed price and signed.</p>
    </div>
  );
}
