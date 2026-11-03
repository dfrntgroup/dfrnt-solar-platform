import Link from "next/link";
import { notFound } from "next/navigation";
import { configured } from "@/lib/configure";
import { yieldFor, batteryFactor, deemingYears } from "@dfrnt/engine";
import { estimateSaving } from "@/lib/saving";
import { warrantyFor } from "@/lib/warranties";
import { energySettings } from "@/lib/energy";
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
import { nextDays, outcome } from "@/lib/capacity";
import { Trust } from "@/components/Trust";
import { CallBack } from "@/components/CallBack";

export const dynamic = "force-dynamic";
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

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
  const { siteFor } = await import("@/lib/rebate-from");
  const site = await siteFor(postcode);
  const q0 = priceSystem(s, site, data);
  const opts = configOptions({ backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, postcode, installDate: q0.window.rebate_date, ...s.config } as ConfigInput, data.rules);
  // Arriving from a usage-based recommendation: start the configurator at the recommended counts.
  const wantP = Number(sp.panels), wantM = Number(sp.modules);
  const usePanels = Number.isInteger(wantP) && (s.config.panelCount === 0 ? wantP === 0 : opts.panels.includes(wantP)) ? wantP : s.config.panelCount;
  const useModules = Number.isInteger(wantM) && opts.modules.includes(wantM) ? wantM : s.config.batteryModules;
  const custom = usePanels !== s.config.panelCount || useModules !== s.config.batteryModules;
  const q = custom ? priceSystem(configured(s, { panels: usePanels, modules: useModules, backup: "none" }, postcode, data, site.rebateFrom), site, data) : q0;
  // What whole-home backup adds for these counts (shown on the switch, so nobody has to flip it to find out).
  const qb = opts.backup ? priceSystem(configured(s, { panels: usePanels, modules: useModules, backup: "whole_home" }, postcode, data, site.rebateFrom), site, data) : null;
  const backupDelta = qb && qb.config.ok ? Math.round(qb.stack.amount_payable - q.stack.amount_payable) : undefined;
  const st = q.stack, c = q.config, r = q.rebate;
  const { activeAddons } = await import("@/lib/addons");
  const addons = await activeAddons().catch(() => []);
  const jobNeeds = { brand: s.brand, kind: s.kind === "battery_only" ? "battery_only" as const : "solar_battery" as const, panelKw: c.panel_kw };
  const next = await nextDays(postcode, jobNeeds, 3);
  const earliest = next === null ? null : next?.[0];
  const rulesPanel = data.rules.panels[s.config.panelSku]?.model;
  const saving = await estimateSaving({ postcode, panelKw: c.panel_kw ?? 0, batteryKwh: c.usable_kwh ?? 0, price: st.amount_payable }).catch(() => null);
  const today = todayAEST();
  const ref = q.window.rebate_date;
  const bfNow = batteryFactor(ref, data.rebates), dyNow = deemingYears(ref, data.rebates);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((1 - a / b) * 100) : 0);
  const changes = [...new Set([...data.rebates.battery_factor.map((x) => x.from), ...data.rebates.solar_deeming.map((x) => x.from)])].filter((d) => d > ref).sort().slice(0, 3)
    .map((d) => ({ d, bf: batteryFactor(d, data.rebates), dy: deemingYears(d, data.rebates) }))
    .map((x) => ({ ...x, bPct: pct(x.bf, bfNow), sPct: pct(x.dy, dyNow) }));
  const forward = !!site.rebateFrom;
  const nextStep = q.window.window_end ? new Date(Date.parse(`${q.window.window_end}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10) : null;
  const rebateLine = forward ? `Installs up to ${longDate(addDay(site.rebateFrom!, -1))} are fully booked in your area, so this price includes the rebate for installs from ${longDate(site.rebateFrom!)}. It is held until ${longDate(q.window.lock_until)}.`
    : !q.window.window_end ? `This price is held until ${longDate(q.window.lock_until)}.`
    : q.window.lock_until < q.window.window_end ? `This price is held until ${longDate(q.window.lock_until)}. The rebate steps down on ${longDate(nextStep!)}, so it applies to installs done by ${longDate(q.window.window_end)}. You see your install dates before you pay.`
    : `This price is held until ${longDate(q.window.window_end)}, the last day of this rebate step. Installs must be done by then, and you see your dates before you pay.`;
  const parts = c.bom.filter((b) => !b.included && !b.sku.startsWith("BOS") && !b.sku.startsWith("MNT"));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: `${s.brand} ${s.title}, installed`, brand: { "@type": "Brand", name: s.brand },
        description: c.summary, offers: { "@type": "Offer", priceCurrency: "AUD", price: st.amount_payable.toFixed(2), availability: "https://schema.org/InStock", url: `${process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")}/systems/${s.slug}` } }) }} />
      <Header postcode={postcode} back={`/systems/${slug}`} />
      <section style={{ paddingTop: 24 }}><div className="wrap">
        <p className="small"><Link href="/systems" className="muted">← All systems</Link></p>
        <div className="pdp">
          <div>
            <Media s={s} q={q} className="gallery" />
            <div className="gallery-note">Manufacturer product imagery. Final configuration is confirmed from your photos before you pay.</div>
            <p className="eyebrow" style={{ marginTop: 26 }}>{s.brand} · {s.kind === "battery_only" ? "Battery only" : "Supply + installation"}</p>
            <h1 id="sys-title" style={{ fontSize: "clamp(30px, 6vw, 44px)" }}>{custom ? (c.usable_kwh ? `${c.panel_kw ? `${Math.round(c.panel_kw * 10) / 10} kW solar + ` : ""}${Math.round(c.usable_kwh * 10) / 10} kWh battery` : `${Math.round(c.panel_kw * 10) / 10} kW solar`) : s.title}</h1>
            <p id="sys-outcome" style={{ color: "var(--teal-dark)", fontWeight: 700, marginTop: -6 }}>{outcome(c.usable_kwh, c.panel_kw)}</p>
            <h3 style={{ marginTop: 18 }}>What it does for you</h3>
            <ul className="plain">
              {c.panel_kw > 0 && <li><strong>Makes about {Math.round(c.panel_kw * yieldFor(postcode, (await energySettings()).yields).kwh_per_kw)} kWh of power on an average day</strong><span className="small muted">Enough to run most homes through the day, with the extra charging your battery.</span></li>}
              {c.usable_kwh > 0 && <li><strong>Stores {c.usable_kwh} kWh for when the sun&apos;s down</strong><span className="small muted">{outcome(c.usable_kwh, c.panel_kw)}. Many homes use 8–12 kWh between dinner and breakfast.</span></li>}
              <li><strong>One price, installed, rebate already off</strong><span className="small muted">Nothing extra unless your photos show work outside a standard install, and you see that before you pay.</span></li>
            </ul>
            <details className="techbox"><summary>The kit, in detail</summary>
            <table className="incl"><tbody>
              {c.panel_kw > 0 && <tr><td className="k">Panels</td><td>{usePanels} × {friendlyPanel(rulesPanel)} ({c.panel_kw} kW)</td></tr>}
              <tr><td className="k">Inverter</td><td>{friendlyInverter(c.inverter?.model, c.inverter?.ac_w)}{s.config.panelCount > 0 ? "" : ", runs the battery"}</td></tr>
              {c.usable_kwh > 0 && <tr><td className="k">Battery</td><td>{parts.filter((b) => b.serial === "module").map((b) => `${b.qty} × ${b.description}`).join(", ")} · {c.usable_kwh} kWh usable</td></tr>}
              <tr><td className="k">Materials</td><td>{c.panel_kw > 0 ? "Racking, " : ""}isolators, cabling, breakers and standard materials</td></tr>
              <tr><td className="k">Installation</td><td>Licensed local electrician, grid connection and rebate paperwork. Anything non-standard is priced from your photos for your approval before you pay.</td></tr>
            </tbody></table></details>
            <h2 style={{ marginTop: 28 }}>How the price is made <span className="small muted">(as listed)</span></h2>
            <table className="lines"><tbody>
              <tr><td>Equipment</td><td className="r">{aud(st.hardware_ex_gst)}</td></tr>
              <tr><td>Installation</td><td className="r">{aud(st.installation_ex_gst)}</td></tr>
              <tr><td>GST</td><td className="r">{aud(st.gst)}</td></tr>
              <tr><td><strong>Price before rebates</strong></td><td className="r"><strong>{aud(st.price_inc_gst)}</strong></td></tr>
              {r.solar_stcs > 0 && <tr><td>Government solar rebate<br /><span className="small muted">{r.solar_stcs} certificates, assigned to us</span></td><td className="r">−{aud(r.solar_rebate)}</td></tr>}
              {r.battery_stcs > 0 && <tr><td>Government battery rebate<br /><span className="small muted">{r.battery_stcs} certificates, assigned to us</span></td><td className="r">−{aud(r.battery_rebate)}</td></tr>}
              <tr className="total"><td>You pay</td><td className="r">{aud(st.amount_payable)}</td></tr>
            </tbody></table>
            <p className="muted small">Rebates for postcode {postcode}{forward ? ` for installs from ${longDate(site.rebateFrom!)}` : " at today's rates"}. {rebateLine} GST is charged on the full price before rebates, as the law requires.</p>
            <details className="small muted"><summary>Show the maths</summary>
              <p style={{ margin: "6px 0 0" }}>Solar: {c.panel_kw} kW × zone {r.zone} rating × {r.deeming_years} years = {r.solar_stcs} certificates.{c.usable_kwh ? ` Battery: ${c.usable_kwh} kWh usable, tiered, × factor ${r.battery_factor} = ${r.battery_stcs} certificates.` : ""} We credit each certificate at a fixed rate and claim them for you. Factors are set by the Clean Energy Regulator.</p></details>
            {saving && <div className="card" style={{ marginTop: 18 }}>
              <h3 style={{ marginTop: 0 }}>What it could save you</h3>
              <p style={{ margin: 0 }}>About <strong>{aud(saving.saving)} a year</strong> for a typical home in {postcode}{saving.payback_years ? <>, paying for itself in about <strong>{saving.payback_years} years</strong></> : null}.</p>
              <p className="small muted" style={{ margin: "8px 0 0" }}>Estimate only. Assumes a home using {saving.day_kwh} kWh a day{saving.existing_kw ? `, ${saving.existing_kw} kW of existing solar` : ""}, panels making {saving.yield} kWh per kW a day ({saving.city} average), {saving.usage_c}c per kWh to buy and {saving.fit_c}c to sell, less {saving.allowance_pct}% for cloudy spells, and no change in prices. Your bills will differ. <Link href="/estimate">Use your own bill</Link> for a closer figure.</p>
            </div>}
          </div>
          <aside className="buybox">
            <p className="eyebrow" style={{ marginBottom: 6 }}>Size it to your home</p>
            <h3>Panels and battery, your way.</h3>
            <p className="small muted" style={{ marginTop: 0 }}>Change the counts. The inverter, parts, rebates and installation follow, and every change shows on the price.</p>
            <Configurator slug={s.slug} postcode={postcode} panels={opts.panels} modules={opts.modules} backupAvailable={opts.backup} moduleKwh={opts.moduleKwh} panelW={opts.panelW}
              start={{ panels: usePanels, modules: useModules }} lockUntil={longDate(q.window.lock_until)} secure={secureSystem} served={next !== null}
              yieldKwhPerKw={s.kind === "battery_only" ? undefined : yieldFor(postcode, (await energySettings()).yields).kwh_per_kw} backupDelta={backupDelta}
              initial={{ ok: q.config.ok, summary: c.summary, solar_kw: c.panel_kw, usable_kwh: c.usable_kwh, inverter: c.inverter?.model, towers: c.stacks?.physical_towers ?? 0,
                you_pay: st.amount_payable, before_rebates: st.price_inc_gst, rebates: st.less_stcs, gst: st.gst, equipment: st.hardware_ex_gst, installation: st.installation_ex_gst,
                solar_stcs: r.solar_stcs, battery_stcs: r.battery_stcs, warnings: c.warnings.map((w) => w.message), blockers: c.blockers.map((b) => b.message) }} />
            <table className="incl" style={{ marginTop: 6 }}><tbody>
              <tr><td className="k">Next free days</td><td>{next?.length ? <strong>{next.map((d) => longDate(d)).join(" · ")}</strong> : next === null ? "Not in your area yet — join the waitlist" : "Confirmed when you book"}<br /><span className="small muted">{next?.length ? "From installers' live calendars. You pick your day after paying." : "From your installer's real free days"}</span></td></tr>
              <tr><td className="k">Rebate</td><td>{aud(st.less_stcs)} off now. {rebateLine}
                {changes.length > 0 && <details className="small" style={{ marginTop: 4 }}><summary>How the rebate changes</summary>
                  {changes.map((x) => <div key={x.d}>From {longDate(x.d)}: {[c.usable_kwh && x.bPct > 0 ? `the battery rebate drops about ${x.bPct}%` : "", c.panel_kw && x.sPct > 0 ? `the solar rebate drops about ${x.sPct}%` : ""].filter(Boolean).join(" and ") || "no change for this system"}.</div>)}
                  <span className="muted">Set by the Clean Energy Regulator. Compared with the rebate in this price.</span></details>}</td></tr>
              <tr><td className="k">Installed by</td><td>A licensed, SAA-accredited local electrician, named before you pay.</td></tr>
              <tr><td className="k">Warranty</td><td>{[...new Map(c.bom.map((b) => warrantyFor(b.sku)).filter((w): w is NonNullable<typeof w> => !!w).map((w) => [w.part, w])).values()]
                .map((w) => `${w.part === "Panels" ? "Panels" : w.part === "Inverter" ? "inverter" : "battery"} ${w.years ? `${w.years} yr` : "(confirmed before you sign)"}${w.performance ? ` + ${w.performance.replace("-year power warranty", " yr performance")}` : ""}`).join(" · ")} · our workmanship 10 yr <Link href="/warranty" className="small">details</Link></td></tr>
            </tbody></table>
            {addons.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Add at checkout: {addons.map((a) => a.name).join(", ")}.</p>}
            <ul className="guar card small" style={{ marginTop: 14, padding: 14 }}>
              <li>Your installer confirms the price from your photos before you pay anything</li>
              <li>Change your mind within 10 business days of signing: full refund</li>
              {q.window.window_end && <li>If we cause a delay past the rebate date, your price stays the same</li>}
              <li>Nothing is added on the day without your written OK</li>
              <li style={{ listStyle: "none" }} className="nock"><Link href="/faq">Read the straight answers</Link></li>
            </ul>
            <Trust />
            <CallBack back={`/systems/${slug}`} state={sp.callback} />
          <p style={{ marginTop: 12 }}><Share title={s.title} text={`${s.brand} ${s.title}: ${aud(q.stack.amount_payable)} installed after rebates.`} /></p>
            {sp.saved === "1" ? <p className="small ok" style={{ marginTop: 10 }}>Saved — we&apos;ve sent the link to your email.</p> : (
              <form action={saveForLater} style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <input type="hidden" name="slug" value={s.slug} /><input type="hidden" name="postcode" value={postcode} />
                <input aria-label="Email me this price" name="email" type="email" placeholder="Email me this price" style={{ flex: 1, padding: 8, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" }} required />
                <button className="btn ghost sm" type="submit">Save</button></form>)}
          </aside>
        </div>
      </div></section>
      <Footer />
    </>
  );
}
