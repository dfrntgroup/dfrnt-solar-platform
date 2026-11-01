"use client";
// Address search (G-NAF). Picking a result fills the unit, street, suburb and postcode fields below it; they stay editable,
// and they're all the customer sees if the lookup isn't available.
import { useEffect, useRef, useState } from "react";

type Hit = { pid: string; label: string };
type Parts = { pid: string; unit: string; line1: string; suburb: string; postcode: string };
type Start = { unit?: string; line1?: string; suburb?: string; postcode?: string; gnafPid?: string };

const box = { width: "100%", padding: "10px", border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
const Lbl = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <label style={{ display: "block", margin: "10px 0" }}><span className="small muted" style={{ display: "block", marginBottom: 4 }}>{t}</span>{children}</label>
);

export function AddressInput({ start }: { start: Start }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [v, setV] = useState<Start>(start);
  const [picked, setPicked] = useState(!!start.gnafPid);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetch("/api/v1/address?q=").then((r) => setReady(r.status !== 503)).catch(() => setReady(false)); }, []);
  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    if (q.trim().length < 4) { setHits([]); return; }
    t.current = setTimeout(async () => {
      const r = await fetch(`/api/v1/address?q=${encodeURIComponent(q)}`).catch(() => null);
      if (r?.ok) setHits(await r.json());
    }, 250);
  }, [q]);

  async function pick(h: Hit) {
    setHits([]); setQ(h.label);
    const r = await fetch(`/api/v1/address?pid=${encodeURIComponent(h.pid)}`).catch(() => null);
    if (!r?.ok) return;
    const p = (await r.json()) as Parts;
    setV({ unit: p.unit, line1: p.line1, suburb: p.suburb, postcode: p.postcode, gnafPid: p.pid });
    setPicked(true);
  }
  const edit = (k: keyof Start) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value, ...(k !== "unit" ? { gnafPid: "" } : {}) });

  return (
    <div>
      {ready && (
        <div style={{ position: "relative" }}>
          <Lbl t="Start typing your address"><input value={q} onChange={(e) => setQ(e.target.value)} style={box} placeholder="e.g. 12 Smith St, Buderim" autoComplete="off" aria-autocomplete="list" /></Lbl>
          {hits.length > 0 && (
            <ul role="listbox" style={{ position: "absolute", zIndex: 30, left: 0, right: 0, top: "100%", marginTop: -6, background: "#fff", border: "2px solid var(--ink)", listStyle: "none", padding: 0, maxHeight: 280, overflow: "auto" }}>
              {hits.map((h) => <li key={h.pid} role="option" aria-selected={false} onClick={() => pick(h)} style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>{h.label}</li>)}
            </ul>)}
          {picked && <p className="small ok" style={{ margin: "4px 0" }}>Matched to the national address file. Check the unit number is right.</p>}
        </div>)}
      <input type="hidden" name="gnafPid" value={v.gnafPid ?? ""} />
      <Lbl t="Unit, flat or lot number (if your home has one, it must match your title)"><input name="unit" value={v.unit ?? ""} onChange={edit("unit")} style={box} placeholder="Leave blank for a house on its own block" /></Lbl>
      <Lbl t="Street address"><input name="line1" value={v.line1 ?? ""} onChange={edit("line1")} style={box} required /></Lbl>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <Lbl t="Suburb"><input name="suburb" value={v.suburb ?? ""} onChange={edit("suburb")} style={box} required /></Lbl>
        <Lbl t="Postcode"><input name="postcode" value={v.postcode ?? ""} onChange={edit("postcode")} style={box} inputMode="numeric" maxLength={4} required /></Lbl>
      </div>
    </div>
  );
}
