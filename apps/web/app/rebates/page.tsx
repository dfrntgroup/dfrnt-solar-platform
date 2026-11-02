import Link from "next/link";
import { computeRebate, rebateWindow } from "@dfrnt/engine";
import { Header, Footer } from "@/components/Header";
import { todayAEST } from "@/lib/api";
import { pricingData } from "@/lib/pricing-data";
import { aud, longDate, sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Solar and battery rebate calculator", description: "Work out the federal solar and battery rebate (STCs) for your system and postcode, and how it changes on 1 January 2027." };

/** A11: the same rebate maths the prices use, shown openly. */
export default async function Rebates({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp);
  const { rebates } = await pricingData();
  const kw = Number(sp.kw ?? 10), kwh = Number(sp.kwh ?? 15), prior = sp.prior === "yes";
  const today = todayAEST();
  const w = rebateWindow(today, rebates);
  const now = computeRebate({ eligibleKw: kw, usableKwh: prior ? 0 : kwh, postcode, installDate: today }, rebates);
  const later = w.window_end ? computeRebate({ eligibleKw: kw, usableKwh: prior ? 0 : kwh, postcode, installDate: w.window_end.replace(/(\d{4})-12-31/, (_, y) => `${Number(y) + 1}-01-02`).replace(/-06-30$/, "-07-02") }, rebates) : null;
  const input = { padding: 12, border: "1px solid #aebdba", borderRadius: 7, font: "inherit", width: "100%" } as const;
  return (
    <>
      <Header postcode={postcode} back="/rebates" />
      <section><div className="wrap" style={{ maxWidth: 760 }}>
        <p className="eyebrow">Rebate calculator</p>
        <h1>What the government takes off your price.</h1>
        <p className="lead">The same maths behind every price on this site: Small-scale Technology Certificates for solar, plus the Cheaper Home Batteries rebate, valued at our fixed rate of {aud(rebates.stc_rate)} each.</p>
        <form method="get" className="finder">
          <div className="row">
            <label>Solar size (kW)<input name="kw" defaultValue={kw} style={input} inputMode="decimal" /></label>
            <label>Battery, usable (kWh)<input name="kwh" defaultValue={kwh} style={input} inputMode="decimal" /></label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label>Postcode<input name="postcode" defaultValue={postcode} style={input} inputMode="numeric" /></label>
            <label>Already claimed a battery rebate here?<select name="prior" defaultValue={prior ? "yes" : "no"} style={input}><option value="no">No</option><option value="yes">Yes</option></select></label>
          </div>
          <button className="btn block" style={{ marginTop: 12 }}>Calculate</button>
        </form>
        <table className="lines" style={{ marginTop: 24 }}><tbody>
          <tr><td>Solar certificates ({now.solar_stcs})</td><td className="r">{aud(now.solar_rebate)}</td></tr>
          <tr><td>Battery certificates ({now.battery_stcs})</td><td className="r">{aud(now.battery_rebate)}</td></tr>
          <tr className="total"><td>Rebate if installed by {w.window_end ? longDate(w.window_end) : "now"}</td><td className="r">{aud(now.total)}</td></tr>
          {later && <tr><td>Rebate if installed after that</td><td className="r">{aud(later.total)} <span className="muted">(−{aud(now.total - later.total)})</span></td></tr>}
        </tbody></table>
        <p className="small muted">Zone {now.zone} · solar deeming {now.deeming_years} years · battery factor {now.battery_factor}. Battery rebate is on usable capacity: full rate to 14 kWh, 60% to 28 kWh, 15% to 50 kWh. One battery rebate per home.</p>
        <p><Link className="btn" href="/systems">See prices with the rebate taken off →</Link></p>
      </div></section>
      <Footer />
    </>
  );
}
