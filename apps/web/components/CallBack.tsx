import { requestCallback } from "@/app/actions";
import { SELLER } from "@/lib/legal";

/** C5: one-tap call-back. Name and mobile only. */
export function CallBack({ back, token, state, compact }: { back: string; token?: string; state?: string; compact?: boolean }) {
  if (state === "1") return <div id="callback" className="ok small" style={{ marginTop: 12 }}><strong>Thanks, we&apos;ll call you back.</strong> Usually within the hour in business hours. Or call us now on <a href={`tel:${SELLER.phone.replace(/\s/g, "")}`}>{SELLER.phone}</a>.</div>;
  const box = { padding: 9, border: "1px solid var(--line)", borderRadius: 6, font: "inherit", width: "100%" } as const;
  return (
    <details id="callback" className="card" style={{ marginTop: 12, padding: compact ? 12 : 14 }} open={state === "bad" || state === "busy"}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>Rather talk to a real person? Call me back</summary>
      {state === "bad" && <p className="small note" style={{ margin: "8px 0 0" }}>Add your name and an Australian phone number.</p>}
      {state === "busy" && <p className="small note" style={{ margin: "8px 0 0" }}>We&apos;ve got your request. We&apos;ll be in touch shortly.</p>}
      <form action={requestCallback} style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <input type="hidden" name="back" value={back} />
        {token && <input type="hidden" name="token" value={token} />}
        <input name="name" placeholder="Your first name" aria-label="Your first name" style={box} required autoComplete="given-name" />
        <input name="phone" placeholder="Mobile" aria-label="Mobile" style={box} required inputMode="tel" autoComplete="tel" />
        <button className="btn" type="submit">Call me back</button>
        <span className="small muted">No salespeople. Usually within the hour in business hours, or call <a href={`tel:${SELLER.phone.replace(/\s/g, "")}`}>{SELLER.phone}</a>.</span>
      </form>
    </details>
  );
}
