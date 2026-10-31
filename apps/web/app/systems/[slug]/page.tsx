import Link from "next/link";
import { notFound } from "next/navigation";
import { configOptions, findSystem, priceSystem, type ConfigInput } from "@dfrnt/engine";
import { Configurator } from "@/components/Configurator";
import { Header, Footer } from "@/components/Header";
import { secureSystem } from "@/app/actions";
import { todayAEST } from "@/lib/api";
import { aud, aud2, longDate, sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function SystemPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const s = findSystem(slug);
  if (!s) notFound();
  const postcode = await sitePostcode(await searchParams);
  const q = priceSystem(s, { postcode, asOf: todayAEST() });
  const st = q.stack, c = q.config, r = q.rebate;
  const opts = configOptions({ backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, postcode, installDate: q.window.lock_until, ...s.config } as ConfigInput);
  const parts = c.bom.filter((b) => !b.included && !b.sku.startsWith("BOS") && !b.sku.startsWith("MNT"));
  return (
    <>
      <Header postcode={postcode} back={`/systems/${slug}`} />
      <section><div className="wrap">
        <p className="eyebrow"><Link href="/systems">Systems</Link> · {s.brand}</p>
        <div className="pdp">
          <div>
            <div className="gallery">Product photos and install video go here</div>
            <h2 style={{ marginTop: 28 }}>What&apos;s included</h2>
            <table className="lines"><tbody>
              {parts.map((b) => <tr key={b.sku}><td>{b.description}</td><td className="r">× {b.qty}</td></tr>)}
              <tr><td>Racking, cabling, isolators and all balance-of-system parts</td><td className="r">✓</td></tr>
              <tr><td>Standard installation by a licensed electrician, grid connection paperwork, rebate paperwork</td><td className="r">✓</td></tr>
            </tbody></table>
            <h2 style={{ marginTop: 28 }}>How the price is made <span className="small muted">(as listed)</span></h2>
            <table className="lines"><tbody>
              <tr><td>Equipment</td><td className="r">{aud2(st.hardware_ex_gst)}</td></tr>
              <tr><td>Installation</td><td className="r">{aud2(st.installation_ex_gst)}</td></tr>
              <tr><td>GST</td><td className="r">{aud2(st.gst)}</td></tr>
              <tr><td><strong>Price before rebates</strong></td><td className="r"><strong>{aud2(st.price_inc_gst)}</strong></td></tr>
              {r.solar_stcs > 0 && <tr><td>Less assignment of STCs, solar ({r.solar_stcs} certificates)</td><td className="r">−{aud2(r.solar_rebate)}</td></tr>}
              {r.battery_stcs > 0 && <tr><td>Less assignment of STCs, battery ({r.battery_stcs} certificates)</td><td className="r">−{aud2(r.battery_rebate)}</td></tr>}
              <tr className="total"><td>You pay</td><td className="r">{aud2(st.amount_payable)}</td></tr>
            </tbody></table>
            <p className="muted small">Rebates for postcode {postcode} (zone {r.zone}) and an install on or before {longDate(q.window.lock_until)}. GST is charged on the full price before rebates, as the law requires.</p>
          </div>
          <aside className="buybox">
            <div className="tag small muted">{s.brand} · {s.tier}</div>
            <h1 style={{ fontSize: 28 }}>{s.title}</h1>
            <Configurator slug={s.slug} postcode={postcode} panels={opts.panels} modules={opts.modules} backupAvailable={opts.backup} moduleKwh={opts.moduleKwh} panelW={opts.panelW}
              start={{ panels: s.config.panelCount, modules: s.config.batteryModules }} lockUntil={longDate(q.window.lock_until)} secure={secureSystem}
              initial={{ ok: q.config.ok, summary: c.summary, solar_kw: c.panel_kw, usable_kwh: c.usable_kwh, inverter: c.inverter?.model, towers: c.stacks?.physical_towers ?? 0,
                you_pay: st.amount_payable, before_rebates: st.price_inc_gst, rebates: st.less_stcs, gst: st.gst, equipment: st.hardware_ex_gst, installation: st.installation_ex_gst,
                solar_stcs: r.solar_stcs, battery_stcs: r.battery_stcs, warnings: c.warnings.map((w) => w.message), blockers: c.blockers.map((b) => b.message) }} />
            <div className="ok small">Earliest install date comes from your installer&apos;s real availability when you book.</div>
          </aside>
        </div>
      </div></section>
      <Footer />
    </>
  );
}
