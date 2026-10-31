import Link from "next/link";
import { notFound } from "next/navigation";
import { configOptions, findSystem, priceSystem, type ConfigInput } from "@dfrnt/engine";
import { Share } from "@/components/Share";
import { Configurator } from "@/components/Configurator";
import { pricingData } from "@/lib/pricing-data";
import { Header, Footer } from "@/components/Header";
import { saveForLater, secureSystem } from "@/app/actions";
import { todayAEST } from "@/lib/api";
import { aud, aud2, longDate, sitePostcode } from "@/lib/site";
import { Media } from "@/components/SystemCard";
import { friendlyInverter, friendlyPanel, imageFor } from "@/lib/images";
import { earliestFor, outcome } from "@/lib/capacity";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await pricingData();
  const s = findSystem(slug, data.catalogue);
  if (!s) return { title: "System not found" };
  const q = priceSystem(s, { postcode: "4551", asOf: todayAEST() }, data);
  const img = imageFor(s.config.panelSku) ?? null;
  const description = `${s.brand} ${s.title}, installed for ${aud(q.stack.amount_payable)} after rebates. One price, one contract, licensed local installer.`;
  return { title: `${s.brand} ${s.title}`, description, openGraph: { title: `${s.brand} ${s.title} · ${aud(q.stack.amount_payable)} installed`, description, images: [img?.src ?? "/img/hero-home.webp"] } };
}

export default async function SystemPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await pricingData();
  const s = findSystem(slug, data.catalogue);
  if (!s) notFound();
  const postcode = await sitePostcode(sp);
  const q = priceSystem(s, { postcode, asOf: todayAEST() }, data);
  const st = q.stack, c = q.config, r = q.rebate;
  const opts = configOptions({ backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, postcode, installDate: q.window.lock_until, ...s.config } as ConfigInput, data.rules);
  const earliest = await earliestFor(postcode);
  const rulesPanel = data.rules.panels[s.config.panelSku]?.model;
  const parts = c.bom.filter((b) => !b.included && !b.sku.startsWith("BOS") && !b.sku.startsWith("MNT"));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: `${s.brand} ${s.title}, installed`, brand: { "@type": "Brand", name: s.brand },
        description: c.summary, offers: { "@type": "Offer", priceCurrency: "AUD", price: st.amount_payable.toFixed(2), availability: "https://schema.org/InStock", url: `/systems/${s.slug}` } }) }} />
      <Header postcode={postcode} back={`/systems/${slug}`} />
      <section style={{ paddingTop: 24 }}><div className="wrap">
        <p className="small"><Link href="/systems" className="muted">← All systems</Link></p>
        <div className="pdp">
          <div>
            <Media s={s} q={q} className="gallery" />
            <div className="gallery-note">Manufacturer product imagery. Final configuration is confirmed from your photos before you pay.</div>
            <p className="eyebrow" style={{ marginTop: 26 }}>{s.brand} · {s.kind === "battery_only" ? "Battery only" : "Supply + installation"}</p>
            <h1 id="sys-title" style={{ fontSize: "clamp(30px, 6vw, 44px)" }}>{s.title}</h1>
            <p id="sys-outcome" style={{ color: "var(--teal-dark)", fontWeight: 700, marginTop: -6 }}>{outcome(c.usable_kwh, c.panel_kw)}</p>
            <h3 style={{ marginTop: 18 }}>What is included</h3>
            <table className="incl"><tbody>
              {c.panel_kw > 0 && <tr><td className="k">Panels</td><td>{s.config.panelCount} × {friendlyPanel(rulesPanel)} ({c.panel_kw} kW)</td></tr>}
              <tr><td className="k">Inverter</td><td>{friendlyInverter(c.inverter?.model, c.inverter?.ac_w)}{s.config.panelCount > 0 ? "" : ", runs the battery"}</td></tr>
              {c.usable_kwh > 0 && <tr><td className="k">Battery</td><td>{parts.filter((b) => b.serial === "module").map((b) => `${b.qty} × ${b.description}`).join(", ")} · {c.usable_kwh} kWh usable</td></tr>}
              <tr><td className="k">Materials</td><td>{c.panel_kw > 0 ? "Racking, " : ""}isolators, cabling, breakers and standard materials</td></tr>
              <tr><td className="k">Installation</td><td>Licensed local electrician, grid connection and rebate paperwork. Anything non-standard is priced from your photos for your approval before you pay.</td></tr>
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
            <p className="eyebrow" style={{ marginBottom: 6 }}>Size it to your home</p>
            <h3>Panels and battery, your way.</h3>
            <p className="small muted" style={{ marginTop: 0 }}>Change the counts. The inverter, parts, rebates and installation follow, and every change shows on the price.</p>
            <Configurator slug={s.slug} postcode={postcode} panels={opts.panels} modules={opts.modules} backupAvailable={opts.backup} moduleKwh={opts.moduleKwh} panelW={opts.panelW}
              start={{ panels: s.config.panelCount, modules: s.config.batteryModules }} lockUntil={longDate(q.window.lock_until)} secure={secureSystem}
              initial={{ ok: q.config.ok, summary: c.summary, solar_kw: c.panel_kw, usable_kwh: c.usable_kwh, inverter: c.inverter?.model, towers: c.stacks?.physical_towers ?? 0,
                you_pay: st.amount_payable, before_rebates: st.price_inc_gst, rebates: st.less_stcs, gst: st.gst, equipment: st.hardware_ex_gst, installation: st.installation_ex_gst,
                solar_stcs: r.solar_stcs, battery_stcs: r.battery_stcs, warnings: c.warnings.map((w) => w.message), blockers: c.blockers.map((b) => b.message) }} />
            <table className="incl" style={{ marginTop: 6 }}><tbody>
              <tr><td className="k">Earliest install</td><td>{earliest ? <strong>{longDate(earliest)}</strong> : earliest === null ? "Not in your area yet — join the waitlist" : "Confirmed when you book"}<br /><span className="small muted">From your installer&apos;s real free days</span></td></tr>
              {q.window.window_end && <tr><td className="k">Rebate</td><td>{aud(st.less_stcs)} off now. Locked for installs on or before {longDate(q.window.window_end)}.</td></tr>}
              <tr><td className="k">Installed by</td><td>A licensed, SAA-accredited local electrician, named before you pay.</td></tr>
              <tr><td className="k">Warranty</td><td>Panels 25 yr · inverter 10 yr · battery 10 yr · our workmanship 10 yr</td></tr>
            </tbody></table>
            <div className="card mint" style={{ marginTop: 14, padding: 14 }}>
              <strong>Questions? Talk to a real person.</strong>
              <span className="small muted">The founders behind 29,000+ solar installs. No salespeople, no pressure.</span>
              <Link className="link" href={`/contact?kind=callback&quote=`}>Book a call</Link>
            </div>
          <p style={{ marginTop: 12 }}><Share title={s.title} text={`${s.brand} ${s.title}: ${aud(q.stack.amount_payable)} installed after rebates.`} /></p>
            {sp.saved === "1" ? <p className="small ok" style={{ marginTop: 10 }}>Saved — we&apos;ve sent the link to your email.</p> : (
              <form action={saveForLater} style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <input type="hidden" name="slug" value={s.slug} /><input type="hidden" name="postcode" value={postcode} />
                <input name="email" type="email" placeholder="Email me this price" style={{ flex: 1, padding: 8, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" }} required />
                <button className="btn ghost sm" type="submit">Save</button></form>)}
          </aside>
        </div>
      </div></section>
      <Footer />
    </>
  );
}
