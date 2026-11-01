// U1: add-ons on the record. Before signing they go into the one price; after paying they're one extra payment.
import type { QuoteRow } from "@/lib/jobs";
import { activeAddons, addonPrice, AFTER_PAY, PRE_SIGN, quoteAddons } from "@/lib/addons";
import { pricingDataFor } from "@/lib/pricing-data";
import { aud } from "@/lib/site";

export async function AddOns({ q, add, remove }: { q: QuoteRow; add: (f: FormData) => Promise<void>; remove: (f: FormData) => Promise<void> }) {
  if (!PRE_SIGN.includes(q.status) && !AFTER_PAY.includes(q.status)) return null;
  const all = await activeAddons();
  if (!all.length) return null;
  const mine = await quoteAddons(q.id);
  const { margins } = await pricingDataFor(q.result.versions);
  const pre = PRE_SIGN.includes(q.status);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <strong>Add to your install</strong>
      <span className="small muted">{pre ? "Added to your one price and contract." : "Paid separately by bank transfer, done on the same visit."} Installed by your installer, priced the same way as your system.</span>
      {all.map((a) => { const has = mine.find((m) => m.code === a.code); return (
        <div key={a.code} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", borderTop: "1px solid var(--line)", padding: "8px 0" }}>
          <span><strong>{a.name}</strong>{a.description ? <><br /><span className="small muted">{a.description}</span></> : null}</span>
          <span style={{ whiteSpace: "nowrap", textAlign: "right" }}>{aud(addonPrice(a, margins).sell_inc)}<br />
            {has ? (has.status === "in_quote" && pre ? <form action={remove} style={{ display: "inline" }}><input type="hidden" name="token" value={q.token} /><input type="hidden" name="addon" value={has.id as string} /><button className="btn ghost sm">Remove</button></form> : <span className="small ok">Added</span>)
              : <form action={add} style={{ display: "inline" }}><input type="hidden" name="token" value={q.token} /><input type="hidden" name="code" value={a.code} /><button className="btn ghost sm">Add</button></form>}</span>
        </div>); })}
    </div>
  );
}
