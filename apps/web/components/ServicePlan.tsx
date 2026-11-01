// R1: the yearly service plan on the record (offered before signing and after install).
import { db } from "@dfrnt/db";
import type { QuoteRow } from "@/lib/jobs";
import { getSetting } from "@/lib/settings";
import { aud, longDate } from "@/lib/site";

export async function ServicePlan({ q, join }: { q: QuoteRow; join: (f: FormData) => Promise<void> }) {
  const plan = await getSetting("service_plan");
  const [m] = await db()`select status, price::float8 price, reference, renews_on::text renews_on, last_visit_on::text last_visit_on from memberships where quote_id = ${q.id} and status <> 'cancelled' order by created_at desc limit 1`;
  if (!plan.on && !m) return null;
  const installed = ["installed", "lodged", "settled", "complete"].includes(q.status);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <strong>Yearly service plan</strong>
      <span className="small">{plan.includes}</span>
      {m ? (m.status === "active"
        ? <span className="small ok">You&apos;re a member. Renews {m.renews_on ? longDate(m.renews_on as string) : ""}{m.last_visit_on ? ` · last visit ${longDate(m.last_visit_on as string)}` : ""}. We&apos;ll contact you to book each visit.</span>
        : <span className="small">{installed ? <>Pay {aud(m.price as number)} by bank transfer, reference <strong>{m.reference as string}</strong>. Card payments are coming.</> : <>You&apos;re signed up. We&apos;ll ask for the first year&apos;s {aud(m.price as number)} after your install.</>}</span>)
        : <form action={join}><input type="hidden" name="token" value={q.token} />
            <span className="small"><strong>{aud(plan.price)} a year.</strong> {installed ? "" : "Nothing to pay until after your install."}</span>
            <button className="btn ghost sm" type="submit">Join the service plan</button></form>}
    </div>
  );
}
