import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { priced, sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Free estimate from your power bill" };

/** A6: free bill-based estimate. Rough sizing from a quarterly bill; the confirmed price still comes from the home check. */
export default async function Estimate({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp);
  const bill = Number(sp.bill || 0), home = sp.home ?? "evenings", phase = sp.phase === "3" ? 3 : 1;
  const input = { padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit", width: "100%" } as const;
  let picks: Awaited<ReturnType<typeof priced>> = [];
  let daily = 0;
  if (bill > 0) {
    daily = Math.max(5, (bill - 120) / 0.33 / 91);                // ~$1.30/day supply, ~33 c/kWh
    const share = home === "day" ? 0.45 : home === "allday" ? 0.35 : 0.6;
    const wantKwh = Math.min(32, daily * share), wantKw = Math.min(14, daily / 4.2);
    picks = (await priced(postcode, (s) => s.kind === "solar_battery" && s.config.phases === phase))
      .sort((a, b) => Math.abs(a.q.config.usable_kwh - wantKwh) + Math.abs(a.q.config.panel_kw - wantKw) * 1.5 - (Math.abs(b.q.config.usable_kwh - wantKwh) + Math.abs(b.q.config.panel_kw - wantKw) * 1.5))
      .slice(0, 3);
  }
  return (
    <>
      <Header postcode={postcode} back="/estimate" />
      <section><div className="wrap" style={{ maxWidth: 900 }}>
        <p className="eyebrow">Free estimate · 30 seconds</p>
        <h1>What size system suits your bill?</h1>
        <form method="get" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "end" }}>
          <label className="small">Your last quarterly bill ($)<input name="bill" type="number" defaultValue={bill || ""} style={input} required /></label>
          <label className="small">When is someone home?<select name="home" defaultValue={home} style={input}><option value="evenings">Mostly evenings</option><option value="day">Most of the day</option><option value="allday">Home all day, every day</option></select></label>
          <label className="small">Power supply<select name="phase" defaultValue={String(phase)} style={input}><option value="1">Single phase</option><option value="3">Three phase</option></select></label>
          <button className="btn" type="submit">Show my systems</button>
        </form>
        {bill > 0 && <>
          <p className="muted" style={{ marginTop: 20 }}>About {Math.round(daily)} kWh a day. These three fit best; your installer confirms the size from your photos.</p>
          <div className="grid">{picks.map(({ s, q }) => <SystemCard key={s.slug} s={s} q={q} />)}</div>
          <p className="small muted" style={{ marginTop: 12 }}>Not sure? <Link href="/systems">See every system</Link>, or secure one of these and your installer confirms the size from your photos before you pay.</p>
        </>}
      </div></section>
      <Footer />
    </>
  );
}
