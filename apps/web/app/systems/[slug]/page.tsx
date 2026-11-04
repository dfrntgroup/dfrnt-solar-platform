import Link from "next/link";
import { notFound } from "next/navigation";
import { configured } from "@/lib/configure";
import { yieldFor, batteryFactor, deemingYears } from "@dfrnt/engine";
import { estimateSaving } from "@/lib/saving";
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
import { buildHref } from "@/lib/builder";
import { rebateLine as rebateLineFor } from "@/lib/rebate-line";
import { friendlyInverter, friendlyPanel, imageFor } from "@/lib/images";
import { nextDays, outcome } from "@/lib/capacity";
import { Trust } from "@/components/Trust";
import { CallBack } from "@/components/CallBack";
import { componentLines } from "@/lib/price-lines";
import { inverterOptions, stepPrices } from "@/lib/steps";
import { baseInverter } from "@/lib/configure";
import { BandPill, Facts } from "@/components/SystemCard";

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
  const { siteFor } = await import("@/lib/rebate-from");
  const site = await siteFor(postcode);
  const q0 = priceSystem(s, site, data);
  // The inverter is held at the system's own unless the customer picked another (?inverter=); ranges are what that inverter carries.
  const wantInv = /^[A-Z0-9.\-]{3,40}$/.test(sp.inverter ?? "") && data.rules.inverters[sp.inverter!] ? sp.inverter : undefined;
  const heldInverter = wantInv ?? baseInverter(s, postcode, data, site.rebateFrom);
  const opts = configOptions({ backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, postcode, installDate: q0.window.rebate_date, ...s.config, inverterSku: heldInverter, preferInverterSku: undefined } as ConfigInput, data.rules, { fixedInverter: true });
  // Arriving from a usage-based recommendation: start the configurator at the recommended counts.
  const wantP = Number(sp.panels), wantM = Number(sp.modules);
  const usePanels = Number.isInteger(wantP) && (s.config.panelCount === 0 ? wantP === 0 : opts.panels.includes(wantP)) ? wantP : s.config.panelCount;
  const useModules = Number.isInteger(wantM) && opts.modules.includes(wantM) ? wantM : s.config.batteryModules;
  const custom = usePanels !== s.config.panelCount || useModules !== s.config.batteryModules || (!!wantInv && wantInv !== baseInverter(s, postcode, data, site.rebateFrom));
  const q = custom ? priceSystem(configured(s, { panels: usePanels, modules: useModules, backup: "none", inverterSku: wantInv }, postcode, data, site.rebateFrom), site, data) : q0;
  const st = q.stack, c = q.config, r = q.rebate;
  const { activeAddons } = await import("@/lib/addons");
  const addons = await activeAddons(s.brand).catch(() => []);
  const jobNeeds = { brand: s.brand, kind: s.kind === "battery_only" ? "battery_only" as const : "solar_battery" as const, panelKw: c.panel_kw };
  const next = await nextDays(postcode, jobNeeds, 3);
  const earliest = next === null ? null : next?.[0];
  const rulesPanel = data.rules.panels[s.config.panelSku]?.model;
  const saving = await estimateSaving({ postcode, panelKw: c.panel_kw ?? 0, batteryKwh: c.usable_kwh ?? 0, price: st.amount_payable }).catch(() => null);
  const today = todayAEST();
  const changes = [...new Set([...data.rebates.battery_factor.map((x) => x.from), ...data.rebates.solar_deeming.map((x) => x.from)])].filter((d) => d > today).sort().slice(0, 3)
    .map((d) => ({ d, bf: batteryFactor(d, data.rebates), dy: deemingYears(d, data.rebates) }));
  const rebateLine = rebateLineFor(q.window, site.rebateFrom);
  const parts = c.bom.filter((b) => !b.included && !b.sku.startsWith("BOS") && !b.sku.startsWith("MNT"));
  const lines = componentLines(q, usePanels);
  const steps = stepPrices(s.slug, { panels: usePanels, modules: useModules, backup: "none", inverterSku: wantInv }, postcode, data, site.rebateFrom);
  const inverters = inverterOptions(s.slug, { panels: usePanels, modules: useModules, backup: "none", inverterSku: wantInv }, postcode, data, site.rebateFrom);
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
            <div style={{ marginTop: 26 }}><BandPill s={s} q={q} /></div>
            <p className="eyebrow" style={{ marginTop: 8 }}>{s.brand} · {s.kind === "battery_only" ? "Battery only" : "Supply + installation"}{s.size ? ` · ${s.size}` : ""}</p>
            <h1 id="sys-title" style={{ fontSize: "clamp(30px, 6vw, 44px)" }}>{custom ? (c.usable_kwh ? `${c.panel_kw ? `${Math.round(c.panel_kw * 10) / 10} kW solar + ` : ""}${Math.round(c.usable_kwh * 10) / 10} kWh battery` : `${Math.round(c.panel_kw * 10) / 10} kW solar`) : s.title}</h1>
            <p id="sys-outcome" style={{ color: "var(--teal-dark)", fontWeight: 700, marginTop: -6 }}>{s.who && !custom ? s.who : outcome(c.usable_kwh, c.panel_kw)}</p>
            <div style={{ maxWidth: 420 }}><Facts s={{ ...s, config: { ...s.config, panelCount: usePanels } }} q={q} /></div>
            <p className="small muted" style={{ margin: "8px 0 0" }}>A starting point, not a fixed package: change the panels, the battery and the backup on the right and the price follows.</p>
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
            <h2 style={{ marginTop: 28 }}>How the price is made <span className="small muted">(every part, as listed)</span></h2>
            <table className="lines"><tbody>
              {lines.map((l, i) => <tr key={i}><td>{l.label}</td><td className="r">{aud2(l.amount)}</td></tr>)}
              <tr><td>GST</td><td className="r">{aud2(st.gst)}</td></tr>
              <tr><td><strong>Price before rebates</strong></td><td className="r"><strong>{aud2(st.price_inc_gst)}</strong></td></tr>
              {r.solar_stcs > 0 && <tr><td>Less assignment of STCs, solar ({r.solar_stcs} certificates)</td><td className="r">−{aud2(r.solar_rebate)}</td></tr>}
              {r.battery_stcs > 0 && <tr><td>Less assignment of STCs, battery ({r.battery_stcs} certificates)</td><td className="r">−{aud2(r.battery_rebate)}</td></tr>}
              <tr className="total"><td>You pay</td><td className="r">{aud2(st.amount_payable)}</td></tr>
            </tbody></table>
            <p className="muted small">Rebates for postcode {postcode} (zone {r.zone}) at today&apos;s rates. {rebateLine} GST is charged on the full price before rebates, as the law requires.</p>
            {saving && <div className="card" style={{ marginTop: 18 }}>
              <h3 style={{ marginTop: 0 }}>What it could save you</h3>
              <p style={{ margin: 0 }}>About <strong>{aud(saving.saving)} a year</strong> for a typical home in {postcode}{saving.payback_years ? <>, paying for itself in about <strong>{saving.payback_years} years</strong></> : null}.</p>
              <p className="small muted" style={{ margin: "8px 0 0" }}>Estimate only. Assumes a home using {saving.day_kwh} kWh a day{saving.existing_kw ? `, ${saving.existing_kw} kW of existing solar` : ""}, panels making {saving.yield} kWh per kW a day ({saving.city} average), {saving.usage_c}c per kWh to buy and {saving.fit_c}c to sell, less {saving.allowance_pct}% for cloudy spells, and no change in prices. Your bills will differ. <Link href="/estimate">Use your own bill</Link> for a closer figure.</p>
            </div>}
          </div>
          <aside className="buybox">
            <p className="eyebrow" style={{ marginBottom: 6 }}>Size it to your home</p>
            <h3>Panels and battery, your way.</h3>
            <p className="small muted" style={{ marginTop: 0 }}>Change the panels, the battery or the inverter. Parts, rebates and installation follow, and each button shows what the step costs you after rebates.</p>
            <Configurator slug={s.slug} postcode={postcode} panels={opts.panels} modules={opts.modules} backupAvailable={opts.backup} moduleKwh={opts.moduleKwh} panelW={opts.panelW}
              start={{ panels: usePanels, modules: useModules, inverter: wantInv }} lockUntil={longDate(q.window.lock_until)} secure={secureSystem} served={next !== null}
              initial={{ ok: q.config.ok, summary: c.summary, solar_kw: c.panel_kw, usable_kwh: c.usable_kwh, inverter: c.inverter?.model, towers: c.stacks?.physical_towers ?? 0,
                you_pay: st.amount_payable, before_rebates: st.price_inc_gst, rebates: st.less_stcs, gst: st.gst, equipment: st.hardware_ex_gst, installation: st.installation_ex_gst,
                solar_stcs: r.solar_stcs, battery_stcs: r.battery_stcs, warnings: c.warnings.map((w) => w.message), blockers: c.blockers.map((b) => b.message), lines, steps, inverters, inverter_sku: c.inverter?.sku }} />
            <p className="small" style={{ margin: "4px 0 8px" }}>Want a different inverter or panel? <Link href={buildHref({ ...s.config, inverterSku: c.inverter?.sku, batteryModules: useModules, panelCount: usePanels }, postcode)}>Build your own</Link></p>
            <table className="incl" style={{ marginTop: 6 }}><tbody>
              <tr><td className="k">Next free days</td><td>{next?.length ? <strong>{next.map((d) => longDate(d)).join(" · ")}</strong> : next === null ? "Not in your area yet — join the waitlist" : "Confirmed when you book"}<br /><span className="small muted">{next?.length ? "From installers' live calendars. You pick your day after paying." : "From your installer's real free days"}</span></td></tr>
              <tr><td className="k">Rebate</td><td>{aud(st.less_stcs)} off now. {rebateLine}
                {changes.length > 0 && <details className="small" style={{ marginTop: 4 }}><summary>How the rebate changes</summary>
                  {changes.map((x) => <div key={x.d}>From {longDate(x.d)}: {c.usable_kwh ? `battery factor ${x.bf}` : ""}{c.usable_kwh && c.panel_kw ? " · " : ""}{c.panel_kw ? `solar deeming ${x.dy} years` : ""}</div>)}
                  <span className="muted">Set by the Clean Energy Regulator. A lower number means a smaller rebate.</span></details>}</td></tr>
              <tr><td className="k">Installed by</td><td>A licensed, SAA-accredited local electrician, named before you pay.</td></tr>
              <tr><td className="k">Warranty</td><td>Panels: manufacturer product warranty + 30 yr performance · inverter 10 yr · battery 10 yr · our workmanship 10 yr</td></tr>
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
