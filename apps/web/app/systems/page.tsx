import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { priced, rebateDate, sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Solar + battery systems" };

const bands: Record<string, [number, number]> = { "10-15": [0, 15.5], "15-25": [15.5, 25], "25+": [25, 999] };

export default async function Systems({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp);
  const phase = sp.phase === "3" ? 3 : 1;
  let rows = await priced(postcode, (s) => s.kind === "solar_battery" && s.config.phases === phase && (!sp.brand || s.brand.toLowerCase() === sp.brand));
  const band = sp.kwh ? bands[sp.kwh] : undefined; if (band) { const [lo, hi] = band; rows = rows.filter(({ q }) => q.config.usable_kwh >= lo && q.config.usable_kwh < hi); }
  rows.sort((a, b) => sp.sort === "battery" ? b.q.config.usable_kwh - a.q.config.usable_kwh : a.q.stack.amount_payable - b.q.stack.amount_payable);
  const link = (k: string, v?: string) => { const p = new URLSearchParams({ ...sp }); if (v === undefined || sp[k] === v) p.delete(k); else p.set(k, v); const s = p.toString(); return `/systems${s ? `?${s}` : ""}`; };
  const chip = (k: string, v: string, label: string) => <Link key={k + v} href={link(k, v)} className={`chip${sp[k] === v ? " on" : ""}`}>{label}</Link>;
  return (
    <>
      <Header postcode={postcode} back="/systems" />
      <section><div className="wrap">
        <p className="eyebrow">Solar + battery · {postcode} · {phase === 3 ? "three phase" : "single phase"}</p>
        <h1>Every system, priced for you.</h1>
        <div className="filters">
          {chip("kwh", "10-15", "10–15 kWh")}{chip("kwh", "15-25", "15–25 kWh")}{chip("kwh", "25+", "25 kWh+")}
          {chip("brand", "solax", "SolaX")}{chip("brand", "sungrow", "Sungrow")}{chip("brand", "goodwe", "GoodWe")}
          {chip("phase", "3", "Three phase")}{chip("sort", "battery", "Biggest battery first")}
        </div>
        <p className="muted small">{rows.length} systems · rebates as at {rebateDate()} · prices reviewed monthly</p>
        {rows.length ? <form action="/compare" method="get"><div className="grid">{rows.map(({ s, q }) => <SystemCard key={s.slug} s={s} q={q} compare />)}</div>
          <p style={{ marginTop: 14 }}><button className="btn ghost" type="submit">Compare selected</button></p></form>
          : <div className="ok">No system matches those filters. <Link href="/systems">Clear filters</Link> or talk to us and we&apos;ll size one for you.</div>}
      </div></section>
      <Footer />
    </>
  );
}
