// R0: everything about an installed system on one page, for as long as the customer owns it.
import Link from "next/link";
import type { QuoteRow } from "@/lib/jobs";
import { brandOf, MONITORING, productDocs, productSkus, recordDocuments, WARRANTY_YEARS } from "@/lib/record";
import { SELLER } from "@/lib/legal";

const box = { width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
const fullDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const addYears = (d: string, y: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCFullYear(x.getUTCFullYear() + y); return x.toISOString().slice(0, 10); };

export async function SystemRecord({ q, report, transfer, sent }: { q: QuoteRow; report: (f: FormData) => Promise<void>; transfer: (f: FormData) => Promise<void>; sent?: string }) {
  const token = q.token;
  const brand = brandOf(q);
  const products = productSkus(q);
  const docs = await recordDocuments(q.id);
  const sheets = await productDocs(products.map((p) => p.sku));
  const since = q.commissioned_on ?? q.install_date;
  const mon = MONITORING[brand];
  const reg = q.warranty ?? {};
  const warranties: [string, string, number][] = [
    ...(products.some((p) => p.sku.startsWith("PNL")) ? [["Panels", "Panel manufacturer", WARRANTY_YEARS.panels!] as [string, string, number]] : []),
    ["Inverter", brand, WARRANTY_YEARS.inverter!], ["Battery", brand, WARRANTY_YEARS.battery!], ["Installation (our workmanship)", SELLER.trading, WARRANTY_YEARS.workmanship!],
  ];
  return (
    <div id="record">
      <h2 style={{ marginTop: 24 }}>Your system, as installed</h2>
      <table className="lines"><tbody>
        {products.map((p) => <tr key={p.sku}><td>{p.qty} × {p.description}</td><td className="r small muted">{p.sku}</td></tr>)}
        <tr><td>Installed</td><td className="r">{since ? fullDate(since) : "–"}</td></tr>
        {q.serials?.length ? <tr><td colSpan={2}><details><summary className="small">Serial numbers ({q.serials.length})</summary><p className="small" style={{ wordBreak: "break-all" }}>{q.serials.map((s) => s.serial).join(" · ")}</p></details></td></tr>
          : <tr><td colSpan={2} className="small muted">Serial numbers appear here once your installer&apos;s paperwork is processed.</td></tr>}
      </tbody></table>

      <h2 style={{ marginTop: 24 }}>Your documents</h2>
      <table className="lines"><tbody>
        <tr><td><a href={`/quote/${token}/doc/agreement`} target="_blank">Signed agreement</a></td><td className="r muted">PDF</td></tr>
        {q.paid_at && <tr><td><a href={`/quote/${token}/doc/invoice`} target="_blank">Tax invoice</a></td><td className="r muted">PDF</td></tr>}
        {docs.map((d) => <tr key={d.id as string}><td><a href={`/quote/${token}/file/${d.id}`} target="_blank">{d.title as string}</a></td><td className="r muted">{(d.content_type as string)?.includes("zip") ? "ZIP" : (d.content_type as string)?.includes("pdf") ? "PDF" : "File"}</td></tr>)}
        {!docs.some((d) => d.kind === "formbay_pack") && <tr><td className="muted">Certificate of compliance, STC form and install photos</td><td className="r muted small">once processed</td></tr>}
        {sheets.map((d) => <tr key={d.id as string}><td><a href={`/docs/${d.id}`} target="_blank">{d.title as string}</a></td><td className="r muted small">{d.kind as string}</td></tr>)}
      </tbody></table>

      <h2 style={{ marginTop: 24 }}>Your warranties</h2>
      <table className="lines"><tbody>
        {warranties.map(([what, who, y]) => (
          <tr key={what}><td>{what}<br /><span className="small muted">{who}{reg[who]?.registered_at ? " · registered for you" : ""}</span></td><td className="r">{y} years{since ? <><br /><span className="small muted">to {fullDate(addYears(since, y))}</span></> : null}</td></tr>))}
      </tbody></table>
      <p className="small muted">Exact terms are on the warranty cards above. Any problem, start with us: we deal with the manufacturer for you.</p>

      {mon && <><h2 style={{ marginTop: 24 }}>Watch your system</h2>
        <p>Your {brand} system reports to the <strong>{mon.app}</strong> app. {mon.how} Your installer sets up your login at handover; if you didn&apos;t get one, tell us below.</p></>}

      <h2 style={{ marginTop: 24 }} id="help">Something not right?</h2>
      {sent === "fault" ? <div className="ok">Got it. We&apos;ve opened a job with your system, serials and warranty attached and will be in touch today (business days). Urgent or unsafe? Turn the system off at the isolators and call {SELLER.phone}.</div> : (
        <form action={report} className="card"><input type="hidden" name="token" value={token} />
          <span className="small">First, a quick check: is the app or the inverter screen showing a fault code? Write it down. Has the power been out? Many faults clear once the grid is back.</span>
          <label className="small">What&apos;s happening?<select name="what" style={box} required defaultValue=""><option value="" disabled>Choose one</option>
            <option>No power from solar during the day</option><option>Battery isn&apos;t charging or discharging</option><option>Fault code or alarm</option><option>App shows no data</option><option>Damage, noise or smell</option><option>Something else</option></select></label>
          <textarea name="detail" required placeholder="Tell us what you see (fault codes help)" style={{ ...box, minHeight: 80 }} />
          <span className="small">Photos (inverter screen, app, anything odd), up to 3:</span>
          <input type="file" name="photo" accept="image/*" multiple />
          <button className="btn" type="submit">Send to DFRNT Solar</button>
          <span className="small muted">Damage, smoke or a burning smell: switch off at the isolators and call {SELLER.phone} now.</span>
        </form>)}

      <details style={{ marginTop: 20 }}><summary className="small">Selling your home? Pass this record to the buyer</summary>
        {sent === "moved" ? null : <form action={transfer} className="card" style={{ marginTop: 8 }}><input type="hidden" name="token" value={token} />
          <span className="small">The buyer gets a new private link to everything on this page. Your link stops working. Warranties stay with the system.</span>
          <input name="name" placeholder="Buyer's name" style={box} required /><input name="email" type="email" placeholder="Buyer's email" style={box} required />
          <label className="small"><input type="checkbox" name="confirm" required /> I&apos;ve sold or am selling this home and want to hand this record over</label>
          <button className="btn ghost sm" type="submit">Pass to the buyer</button></form>}
      </details>
      <p className="small" style={{ marginTop: 10 }}><Link href={`/contact?quote=${token}`}>Anything else? Talk to us</Link></p>
    </div>
  );
}
