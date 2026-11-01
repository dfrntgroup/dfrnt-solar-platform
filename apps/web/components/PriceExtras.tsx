"use client";
import { useEffect, useRef, useState } from "react";

export interface Extra { code: string; description: string; customer: number; installer: number | null; unit?: string; free?: number }
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

/**
 * Ops "Price this job" / tech review. Each extra shows what it adds for the customer (inc GST, after rebates)
 * and the installer's pay; the new price underneath is worked out by the server exactly as Confirm will save it.
 */
export function PriceExtras({ id, base, extras }: { id: string; base: number; extras: Extra[] }) {
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [exact, setExact] = useState<{ total: number; installer_extra: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const q = (e: Extra) => (e.unit ? Math.max(1, qty[e.code] ?? (e.free ?? 0) + 1) : 1);
  const picked = extras.filter((e) => on[e.code]);

  useEffect(() => {
    if (!picked.length) { setExact(null); return; }
    const n = ++seq.current; setBusy(true);
    const t = setTimeout(async () => {
      const r = await fetch("/api/v1/ops/price-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, extras: picked.map((e) => ({ code: e.code, qty: q(e) })) }) }).catch(() => null);
      if (n === seq.current) { setExact(r?.ok ? await r.json() : null); setBusy(false); }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(on), JSON.stringify(qty)]);

  return (
    <div>
      {extras.map((e) => (
        <label key={e.code} className="small" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
          <input type="checkbox" name="codes" value={e.code} checked={!!on[e.code]} onChange={(ev) => setOn({ ...on, [e.code]: ev.target.checked })} style={{ marginTop: 3 }} />
          <span style={{ flex: 1 }}>{e.description}
            <br /><span className="muted">{e.unit ? `${aud(e.customer)} per ${e.unit} after the first ${e.free} ${e.unit === "km" ? "km" : "m"}` : `Installer gets ${e.installer != null ? aud(e.installer) : "–"} ex GST`}</span>
            {e.unit && on[e.code] && <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <input name={`qty_${e.code}`} type="number" min={1} max={500} inputMode="numeric" value={q(e)} onChange={(ev) => setQty({ ...qty, [e.code]: Number(ev.target.value) })} style={{ width: 80, padding: 6, border: "1px solid var(--line)", borderRadius: 6 }} />
              {e.unit === "km" ? "km from base, in total" : "metres of cable, in total"}</span>}</span>
          {!e.unit && <strong style={{ whiteSpace: "nowrap" }}>+{aud(e.customer)}</strong>}
        </label>))}
      <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "#fff", border: "1px solid var(--line)" }}>
        <div className="small muted">Customer pays, after rebates, inc GST</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>
          {!picked.length ? aud(base) : busy || !exact ? <span className="muted">Working it out…</span>
            : <>{aud(base)} → {aud(exact.total)} <span className="small" style={{ color: "var(--teal)" }}>(+{aud(exact.total - base)})</span></>}
        </div>
        {picked.length > 0 && exact && <div className="small muted">Extra installer pay {aud(exact.installer_extra)} ex GST</div>}
        <div className="small muted" style={{ marginTop: 4 }}>This is exactly what Confirm saves. The customer sees it and approves before paying.</div>
      </div>
    </div>
  );
}
