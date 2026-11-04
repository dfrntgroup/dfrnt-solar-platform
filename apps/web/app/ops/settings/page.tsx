import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { saveDesignCheck, savePricingMode, saveScheduling, saveServicePlan, saveTrust } from "../actions";

export const dynamic = "force-dynamic";

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const dc = await getSetting("design_check");
  const pm = await getSetting("pricing_mode");
  const t = await getSetting("trust");
  const sc = await getSetting("scheduling");
  const sv = await getSetting("service_plan");
  const F = ({ name, label, value, hint }: { name: string; label: string; value: string; hint?: string }) => (
    <label style={{ display: "block", margin: "10px 0" }}><span className="small" style={{ fontWeight: 600 }}>{label}</span>{hint && <span className="small muted" style={{ display: "block" }}>{hint}</span>}<input name={name} defaultValue={value} style={input} /></label>);
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Settings</h1>
      {sp.ok && <div className="ok small">{sp.ok}</div>}{sp.error && <div className="note small">{sp.error}</div>}
      {pm.allow_test_installer && <div className="note" style={{ borderColor: "#b00020", color: "#b00020" }}><strong>Test installer can be assigned to real quotes.</strong> Switch this off before launch (Pricing mode, below).</div>}
      <div className="pdp">
        <form action={savePricingMode} className="card">
          <strong>Pricing mode</strong>
          <span className="small muted">Decided 4 Nov 2026. On: every home goes to the installer&apos;s photo check before any payment; the price is confirmed by 5 pm the same business day. Off: homes inside the installer&apos;s standard scope are priced instantly with nobody looking at the photos. Ops → Pricing shows when a home pattern is safe to switch.</span>
          <label className="small"><input type="checkbox" name="installer_confirms_all" defaultChecked={pm.installer_confirms_all} /> Installer confirms every job</label>
          <label className="small" style={{ display: "block", marginTop: 6 }}><input type="checkbox" name="allow_test_installer" defaultChecked={pm.allow_test_installer} /> Allow the test installer on real quotes (testing only)</label>
          <button className="btn">Save</button>
        </form>
        <form action={saveDesignCheck} className="card">
          <strong>Design check fee</strong>
          <span className="small muted">Off: every design check is free. On: homes that need an installer&apos;s photo check pay this first by bank transfer, and it comes off their system price as a credit. Watch the reviewed-to-sale rate in Analytics before switching on.</span>
          <label className="small"><input type="checkbox" name="fee_on" defaultChecked={dc.fee_on} /> Charge for design checks</label>
          <F name="amount" label="Amount (inc GST)" value={String(dc.amount)} />
          <button className="btn">Save</button>
        </form>
        <form action={saveTrust} className="card">
          <strong>Proof by the buy button</strong>
          <span className="small muted">Shown on every product page and at checkout. Leave a line blank to hide it. Only put in what you can show on request.</span>
          <F name="founder_line" label="Founder line" value={t.founder_line} />
          <F name="founder_video" label="Founder video link" value={t.founder_video} hint="YouTube, Vimeo or a file link. Hidden until filled." />
          <F name="licence" label="Our licence" value={t.licence} hint="e.g. Electrical contractor licence 12345 (QLD)" />
          <F name="accreditations" label="Accreditations" value={t.accreditations} hint="e.g. NETCC Approved Seller (once approved)" />
          <F name="insurance" label="Insurance" value={t.insurance} hint="e.g. $20m public liability" />
          <F name="callback_to" label="Call-back requests go to" value={t.callback_to} />
          <F name="google_review_url" label="Google review link" value={t.google_review_url ?? ""} hint="From your Google Business Profile: Ask for reviews → copy link. Customers who give 4–5 stars are offered it." />
          <F name="address" label="Office address to publish" value={t.address ?? ""} hint="Shown in the footer and on Talk to us. Hidden until filled." />
          <F name="hours" label="Call hours" value={t.hours ?? ""} hint="e.g. 8 am – 6 pm Mon–Fri, 9 am – 1 pm Sat. Hidden until filled." />
          <F name="callback_minutes" label="Call-back promise (minutes)" value={t.callback_minutes ?? ""} hint="e.g. 15. Shown only when call hours are filled in. Only promise what the phone roster can keep." />
          <label className="small" style={{ display: "block", marginTop: 10 }}>Founder quote (home page)<textarea name="founder_quote" defaultValue={t.founder_quote ?? ""} style={{ ...input, minHeight: 80 }} /><span className="small muted">Blank hides the quote.</span></label>
          <label className="small" style={{ display: "block", marginTop: 10 }}>Team on the About page<textarea name="team" defaultValue={t.team ?? ""} style={{ ...input, minHeight: 100 }} /><span className="small muted">One person per line: Name | Role | One line about them. A person with no role is hidden.</span></label>
          <button className="btn">Save</button>
        </form>
      </div>
      <form action={saveServicePlan} className="card" style={{ marginTop: 16 }}>
        <strong>Yearly service plan</strong>
        <span className="small muted">When on, it&apos;s offered before signing and on every installed customer&apos;s record. Members are in Ops → Service plan.</span>
        <label className="small"><input type="checkbox" name="on" defaultChecked={sv.on} /> Offer the service plan</label>
        <F name="price" label="Price per year (inc GST)" value={String(sv.price || "")} />
        <F name="includes" label="What's included (customers see this)" value={sv.includes} />
        <button className="btn">Save</button>
      </form>
      <form action={saveScheduling} className="card" style={{ marginTop: 16 }}>
        <strong>Install scheduling</strong>
        <span className="small muted">The booking desk switch is on Ops → Booking desk.</span>
        <F name="gear_lead_days" label="Working days for gear to arrive" value={String(sc.gear_lead_days)} hint="No install day is offered sooner than this" />
        <F name="decline_hours" label="Hours an installer has to say they can't do a booked day" value={String(sc.decline_hours)} />
        <F name="earlier_offer_hours" label="Hours an 'earlier day opened' offer stays open" value={String(sc.earlier_offer_hours)} />
        <button className="btn">Save</button>
      </form>
    </AdminShell>
  );
}
