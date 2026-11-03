import Link from "next/link";
import type { CatalogueSystem, Quote } from "@dfrnt/engine";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { CallBack } from "@/components/CallBack";
import { earliestFor, outcome } from "@/lib/capacity";
import { aud, priced, sitePostcode } from "@/lib/site";
import { yieldFor } from "@dfrnt/engine";
import { UsageConnect } from "@/components/UsageConnect";
import { connectFromEstimate } from "../usage/actions";
import { energySettings, energyVisible } from "@/lib/energy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find my system", description: "Three questions, one recommended system for your home, priced installed after rebates." };

type P = { s: CatalogueSystem; q: Quote };

/** C3: three answers → one recommended system, then the option to go bigger. Rough sizing from the bill until meter data (Fiskil) is in. */
export default async function FindMySystem({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp);
  const earliest = await earliestFor(postcode);
  const SUN = yieldFor(postcode, (await energySettings()).yields).kwh_per_kw;   // Clean Energy Council average for the area
  const showUsage = await energyVisible(sp);
  const bill = Number(sp.bill || 0), home = sp.home ?? "evenings", phase = sp.phase === "3" ? 3 : 1, hasSolar = sp.solar === "yes";
  const box = { padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit", width: "100%" } as const;
  let best: P | undefined, bigger: P[] = [], daily = 0;
  if (bill > 0) {
    daily = Math.max(5, (bill - 120) / 0.33 / 91);                 // ~$1.30/day supply, ~33 c/kWh
    const evening = home === "day" ? 0.45 : home === "allday" ? 0.35 : 0.6;
    const wantKwh = Math.min(40, daily * evening), wantKw = Math.min(14, daily / SUN);
    const pool = (await priced(postcode, (s) => s.kind === (hasSolar ? "battery_only" : "solar_battery") && s.config.phases === phase)).filter((p) => p.q.config.ok);
    const score = (p: P) => Math.abs(p.q.config.usable_kwh - wantKwh) + (hasSolar ? 0 : Math.abs(p.q.config.panel_kw - wantKw) * 1.5);
    best = [...pool].sort((a, b) => score(a) - score(b) || a.q.stack.amount_payable - b.q.stack.amount_payable)[0];
    if (best) {
      const b = best;
      const up = pool.filter((p) => p.q.config.usable_kwh >= b.q.config.usable_kwh + 3 || (!hasSolar && p.q.config.panel_kw >= b.q.config.panel_kw + 2 && p.q.config.usable_kwh >= b.q.config.usable_kwh))
        .sort((x, y) => x.q.stack.amount_payable - y.q.stack.amount_payable);
      bigger = up.filter((p, i) => i === 0 || p.q.config.usable_kwh > up[0]!.q.config.usable_kwh + 3).slice(0, 2);
    }
  }
  const adds = (p: P) => {
    const b = best!.q.config, c = p.q.config, out: string[] = [];
    if (c.usable_kwh - b.usable_kwh >= 1) out.push(`${Math.round((c.usable_kwh - b.usable_kwh) * 10) / 10} kWh more battery: ${outcome(c.usable_kwh, c.panel_kw).toLowerCase()}`);
    if (c.panel_kw - b.panel_kw >= 0.5) out.push(`${Math.round((c.panel_kw - b.panel_kw) * 10) / 10} kW more solar: about ${Math.round((c.panel_kw - b.panel_kw) * SUN)} kWh more power a day`);
    return out;
  };
  return (
    <>
      <Header postcode={postcode} back="/estimate" />
      <section><div className="wrap" style={{ maxWidth: 900 }}>
        <p className="eyebrow">Find my system · three questions</p>
        <h1>The right system for your home, priced.</h1>
        <form method="get" className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, alignItems: "end", padding: 16 }}>
          <input type="hidden" name="postcode" value={postcode} />
          <div className="small"><strong>1. Do you have solar panels already?</strong>
            <div className="pills" role="radiogroup" aria-label="Do you have solar panels already?">
              <label><input type="radio" name="solar" value="no" defaultChecked={!hasSolar} style={{ position: "absolute", opacity: 0 }} /><span className="pill-r">No: panels + battery</span></label>
              <label><input type="radio" name="solar" value="yes" defaultChecked={hasSolar} style={{ position: "absolute", opacity: 0 }} /><span className="pill-r">Yes: battery only</span></label>
            </div></div>
          <label className="small"><strong>2. Your last power bill, for 3 months ($)</strong><input aria-label="e.g. 750" name="bill" type="number" inputMode="numeric" defaultValue={bill || ""} style={box} placeholder="e.g. 750" required /></label>
          <label className="small"><strong>3. When is someone usually home?</strong><select name="home" defaultValue={home} style={box}><option value="evenings">Mostly mornings and evenings</option><option value="day">Some of the day</option><option value="allday">Home all day</option></select></label>
          <details className="small" style={{ gridColumn: "1 / -1" }}><summary style={{ cursor: "pointer" }}>Three-phase power? (most homes aren&apos;t)</summary>
            <select name="phase" defaultValue={String(phase)} style={{ ...box, marginTop: 6, maxWidth: 260 }}><option value="1">Single phase, or not sure</option><option value="3">Three phase</option></select></details>
          <button className="btn" type="submit" style={{ gridColumn: "1 / -1" }}>Show my system →</button>
        </form>
        {showUsage && <UsageConnect action={connectFromEstimate} askEmail error={sp.usage_error}
          hidden={{ postcode, solar: hasSolar ? "yes" : "no", phase: String(phase), back: `/estimate?${new URLSearchParams({ ...sp, usage_error: "" }).toString().replace(/&?usage_error=/, "")}` }} />}

        {sp.bill != null && !(bill > 0) && <div className="note" style={{ marginTop: 18 }}>Enter your last quarterly bill in dollars (the total on the bill, e.g. 750) and we&apos;ll size a system from it.</div>}
        {best && earliest === null && <div className="note" style={{ marginTop: 18 }}>We don&apos;t install at {postcode} yet. These prices are for planning; <Link href={`/contact?kind=waitlist&postcode=${postcode}`}>join the waitlist</Link> and we&apos;ll email you when an installer covers your area.</div>}
        {bill > 0 && !best && <div className="note" style={{ marginTop: 18 }}>Nothing in our range fits those answers yet. <Link href="/systems">See every system</Link>, or ask us to call you.</div>}
        {best && <>
          <h2 style={{ marginTop: 28 }}>We recommend</h2>
          <p className="muted" style={{ marginTop: -6 }}>Your bill works out at about {Math.round(daily)} kWh a day. {hasSolar ? "This battery stores your daytime solar for the evening." : "This covers your days with solar and stores the extra for the evening."} Your installer confirms the size from your photos before you pay.</p>
          <div className="grid" style={{ gridTemplateColumns: "minmax(0, 420px)" }}><SystemCard s={best.s} q={best.q} earliest={earliest} /></div>
          {bigger.length > 0 && <>
            <h3 style={{ marginTop: 26 }}>Want more? Go bigger</h3>
            <p className="small muted" style={{ marginTop: -4 }}>Worth it if you have an EV, a pool, a big family, or want more of the night covered.</p>
            <div className="grid">{bigger.map((p) => (
              <div key={p.s.slug} className="card">
                <div className="tag"><span>{p.s.brand}</span><span className="badge">+{aud(p.q.stack.amount_payable - best!.q.stack.amount_payable)}</span></div>
                <h3>{p.s.title}</h3>
                <ul className="small" style={{ margin: "0 0 0 18px", padding: 0 }}>{adds(p).map((a) => <li key={a}>{a}</li>)}</ul>
                <div className="pay"><small>You pay, installed</small>{aud(p.q.stack.amount_payable)}</div>
                <Link className="btn ghost" href={`/systems/${p.s.slug}`}>View system</Link>
              </div>))}</div>
          </>}
          <p className="small muted" style={{ marginTop: 16 }}>Sizes are rough until we see your real usage. You can change panels and battery on the system page, and every change shows on the price. <Link href={hasSolar ? "/batteries" : "/systems"}>See every {hasSolar ? "battery" : "system"}</Link>.</p>
        </>}
        <div style={{ maxWidth: 440 }}><CallBack back={`/estimate?${new URLSearchParams(sp)}`} state={sp.callback} /></div>
      </div></section>
      <Footer />
    </>
  );
}
