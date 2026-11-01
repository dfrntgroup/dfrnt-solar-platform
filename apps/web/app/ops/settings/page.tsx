import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { saveDesignCheck, saveScheduling, saveTrust } from "../actions";

export const dynamic = "force-dynamic";

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const dc = await getSetting("design_check");
  const t = await getSetting("trust");
  const sc = await getSetting("scheduling");
  const F = ({ name, label, value, hint }: { name: string; label: string; value: string; hint?: string }) => (
    <label style={{ display: "block", margin: "10px 0" }}><span className="small" style={{ fontWeight: 600 }}>{label}</span>{hint && <span className="small muted" style={{ display: "block" }}>{hint}</span>}<input name={name} defaultValue={value} style={input} /></label>);
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Settings</h1>
      {sp.ok && <div className="ok small">{sp.ok}</div>}{sp.error && <div className="note small">{sp.error}</div>}
      <div className="pdp">
        <form action={saveDesignCheck} className="card">
          <strong>Design check fee</strong>
          <span className="small muted">Off: every design check is free. Standard homes are always priced instantly and free. On: homes that need an installer&apos;s photo check pay this first by bank transfer, and it comes off their system price as a credit. Watch the reviewed-to-sale rate in Analytics before switching on.</span>
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
          <button className="btn">Save</button>
        </form>
      </div>
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
