import { Header, Footer } from "@/components/Header";
import { applyInstaller } from "./actions";

export const metadata = { title: "Install for DFRNT Solar", robots: { index: false } };

const DAYS: [number, string][] = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"]];

/** Installer onboarding: everything needed to go live in one sitting. Pre-fill with ?b=Business&n=Contact&e=email. */
export default async function Apply({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const input = { width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
  const F = ({ name, label, hint, req, value, type = "text" }: { name: string; label: string; hint?: string; req?: boolean; value?: string; type?: string }) => (
    <label style={{ display: "block", margin: "10px 0" }}><span className="small" style={{ fontWeight: 600 }}>{label}{req ? "" : " (optional)"}</span>
      {hint && <span className="small muted" style={{ display: "block" }}>{hint}</span>}
      <input name={name} type={type} style={input} required={req} defaultValue={value} /></label>);
  const C = ({ name, value, label, on }: { name: string; value: string; label: string; on?: boolean }) => (
    <label className="small" style={{ marginRight: 14, display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" name={name} value={value} defaultChecked={on} /> {label}</label>);
  return (
    <>
      <Header postcode="4551" />
      <section><div className="wrap" style={{ maxWidth: 620 }}>
        <p className="eyebrow">For installers</p><h1>Install for DFRNT Solar.</h1>
        <p className="muted">Jobs come to you already sold, with the customer&apos;s photos and a fixed labour price from our menu. You set your days, your areas and which jobs you price instantly. You&apos;re paid from a ledger once the job is installed.</p>
        {sp.sent ? <div className="ok">Thanks, we&apos;ve got everything. We&apos;ll check your licence, accreditation and insurance and switch you on, usually within two business days. You&apos;ll get a sign-in link by email.</div> : (<>
          <div className="card" style={{ margin: "16px 0" }}>
            <strong>Have these handy (about 10 minutes)</strong>
            <ul className="small" style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>ABN and electrical contractor licence number</li>
              <li>Public liability insurance: insurer, cover and expiry, and the certificate (PDF or photo)</li>
              <li>Solar Accreditation Australia (SAA) number for each installer</li>
              <li>Formbay team number for each installer, if you already use Formbay</li>
              <li>The postcodes you cover and how many jobs a day you can take</li>
            </ul>
          </div>
          <form action={applyInstaller}>
            <h3>Business</h3>
            <F name="business_name" label="Business name" req value={sp.b} />
            <F name="abn" label="ABN" req />
            <F name="contact_name" label="Your name" req value={sp.n} />
            <F name="email" label="Email (your sign-in)" req type="email" value={sp.e} />
            <F name="phone" label="Mobile" req />
            <F name="licence_no" label="Electrical contractor licence" req hint="QLD licence number" />
            <h3 style={{ marginTop: 20 }}>Insurance</h3>
            <F name="insurance" label="Public liability insurer and cover" req hint="e.g. QBE, $20m" />
            <F name="insurance_expiry" label="Expiry date" req type="date" />
            <label style={{ display: "block", margin: "10px 0" }}><span className="small" style={{ fontWeight: 600 }}>Certificate of currency</span>
              <input name="insurance_doc" type="file" accept="application/pdf,image/*" required /></label>
            <h3 style={{ marginTop: 20 }}>Your installers</h3>
            <label style={{ display: "block", margin: "10px 0" }}><span className="small" style={{ fontWeight: 600 }}>One per line: name, SAA number, Formbay team number</span>
              <span className="small muted" style={{ display: "block" }}>e.g. Sam Smith, A1234567, 23157 (leave the Formbay number off if you don&apos;t have one)</span>
              <textarea name="team" required style={{ ...input, minHeight: 90 }} /></label>
            <h3 style={{ marginTop: 20 }}>Where and when</h3>
            <F name="postcodes" label="Postcodes you cover" req hint="Ranges or single postcodes, e.g. 4550-4575, 4000-4179" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <F name="jobsPerDay" label="Jobs a day (all crews)" req value="1" />
              <F name="leadDays" label="Business days' notice you need" req value="5" />
            </div>
            <div className="small" style={{ margin: "6px 0" }}><strong>Days you install</strong><br />{DAYS.map(([v, d]) => <C key={v} name="workingDays" value={String(v)} label={d} on={v <= 5} />)}</div>
            <div className="small" style={{ margin: "10px 0" }}><strong>Brands you&apos;re accredited to install</strong><br />{["SolaX", "Sungrow", "GoodWe", "Sigenergy"].map((b) => <C key={b} name="brands" value={b} label={b} on />)}</div>
            <F name="crews" label="How many crews could do DFRNT jobs" req value="1" hint="Each crew connects its own Google Calendar after you're set up" />
            <h3 style={{ marginTop: 20 }}>Jobs you&apos;ll price instantly</h3>
            <p className="small muted" style={{ marginTop: 0 }}>Homes inside these get their price straight away from our menu. Anything else comes to you with the photos to check first.</p>
            <div className="small" style={{ margin: "6px 0" }}><strong>Roofs</strong><br /><C name="roofTypes" value="tin" label="Metal" on /><C name="roofTypes" value="tile" label="Tile" /><C name="roofTypes" value="kliplok" label="Klip-Lok" /></div>
            <div className="small" style={{ margin: "6px 0" }}><strong>Power</strong><br /><C name="phases" value="1" label="Single phase" on /><C name="phases" value="3" label="Three phase" /></div>
            <div className="small" style={{ margin: "6px 0" }}><strong>Battery spot</strong><br /><C name="batteryLocations" value="garage" label="Garage" on /><C name="batteryLocations" value="outdoor_wall" label="Outside wall" on /><C name="batteryLocations" value="other" label="Elsewhere" /></div>
            <label style={{ display: "block", margin: "10px 0" }}><span className="small" style={{ fontWeight: 600 }}>Storeys</span>
              <select name="maxStoreys" style={input} defaultValue="1"><option value="1">Single storey only</option><option value="2">Up to two storeys</option></select></label>
            <label style={{ display: "block", margin: "10px 0" }}><span className="small" style={{ fontWeight: 600 }}>Anything else (optional)</span><textarea name="notes" style={{ ...input, minHeight: 70 }} placeholder="Brands you install, crew size, anything we should know" /></label>
            <button className="btn block">Send</button>
          </form>
        </>)}
      </div></section>
      <Footer />
    </>
  );
}
