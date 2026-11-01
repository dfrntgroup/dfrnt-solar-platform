// Builds the Formbay job for a booked DFRNT job, checks it, sends it (ops click), and syncs its status back.
// Nothing is sent automatically unless settings.formbay.auto_create is switched on in Ops.
import { db } from "@dfrnt/db";
import type { SiteAnswers } from "@dfrnt/engine";
import { formbayToken, FORMBAY_API, formbayGet } from "./formbay";
import type { QuoteRow } from "./jobs";

/** CEC strings exactly as Formbay lists them (checked against Formbay's reference lists and two live jobs, 1 Nov 2026). */
const SOLAX = "SolaX Power Network Technology (Zhejiang) Co Ltd", SOLAX_X3 = "SolaX Power Network Technology (Zhe jiang) Co Ltd";
const GOODWE = "GoodWe Technologies Co Ltd", SUNGROW = "Sungrow Power Supply Co Ltd";
export const CEC_INVERTERS: Record<string, { brand: string; series: string; model: string; verify?: string }> = {
  "INV-SOLAX-VAST-5K": { brand: SOLAX, series: "X1-VAST", model: "X1-VAST-5K (AS4777-2 2020)" },
  "INV-SOLAX-VAST-8K": { brand: SOLAX, series: "X1-VAST", model: "X1-VAST-8K (AS4777-2 2020)" },
  "INV-SOLAX-VAST-10K": { brand: SOLAX, series: "X1-VAST", model: "X1-VAST-10K (AS4777-2 2020)" },
  "INV-SOLAX-HYB-8K": { brand: SOLAX_X3, series: "X3-Hybrid-D", model: "X3-Hybrid-8.0-D (AS4777-2 2020)", verify: "series name" },
  "INV-SOLAX-HYB-10K": { brand: SOLAX_X3, series: "X3-Hybrid-D", model: "X3-Hybrid-10.0-D (AS4777-2 2020)", verify: "series name" },
  "INV-SOLAX-HYB-15K": { brand: SOLAX_X3, series: "X3-Hybrid-D", model: "X3-Hybrid-15.0-D (AS4777-2 2020)", verify: "series name" },
  "INV-GW-EHA-5K": { brand: GOODWE, series: "ESA", model: "GW5K-EHA-G20 (AS4777-2 2020)" },
  "INV-GW-EHA-10K": { brand: GOODWE, series: "ESA", model: "GW9.999K-EHA-G20 (AS4777-2 2020)" },
  "INV-GW-ETA-10K": { brand: GOODWE, series: "ESA", model: "GW9.999K-ETA-G20 (AS4777-2 2020)" },
  "INV-GW-ETA-15K": { brand: GOODWE, series: "ESA", model: "GW15K-ETA-G20 (AS4777-2 2020)" },
  "INV-SGR-SH5.0RS": { brand: SUNGROW, series: "SH-RS", model: "SH5.0RS (AS4777-2 2020)", verify: "series name" },
  "INV-SGR-SH8.0RS": { brand: SUNGROW, series: "SH-RS", model: "SH8.0RS (AS4777-2 2020)", verify: "series name" },
  "INV-SGR-SH10RS": { brand: SUNGROW, series: "SH-RS", model: "SH10RS (AS4777-2 2020)", verify: "series name" },
};
// SolaX and Sungrow register the whole battery system by module count; GoodWe Lynx D registers each module.
const SOLAX_HS: Record<number, [string, number]> = { 2: ["T-HS10.2", 10.2], 3: ["T-HS15.3", 15.3], 4: ["T-HS20.4", 20.4], 5: ["T-HS25.6", 25.6], 6: ["T-HS30.7", 30.7], 7: ["T-HS35.8", 35.8], 8: ["T-HS40.9", 40.9], 9: ["T-HS46.0", 46.0], 10: ["T-HS51.2", 51.2], 11: ["T-HS56.3", 56.3], 12: ["T-HS61.4", 61.4], 13: ["T-HS66.5", 66.5] };
const GW_LYNX: Record<string, [string, number]> = { "PRT-GW-LX-D-5.1-G20": ["GW5.1-BAT-D-G20", 5.0], "PRT-GW-LX-D-8.3-G20": ["GW8.3-BAT-D-G20", 8.0], "PRT-GW-LX-D-9.0-G20": ["GW9.0-BAT-D-G20", 8.85] };

export function cecBatteries(bom: { sku: string; qty: number }[]) {
  const mods = (prefix: string) => bom.filter((b) => b.sku.startsWith(prefix)).reduce((n, b) => n + b.qty, 0);
  const sx = mods("PRT-SOLAX-TB-HS51"), sg = mods("PRT-SGR-SMR050");
  if (sx) { const m = SOLAX_HS[sx]; return m ? [{ brand: SOLAX, series: "TSYS-HS51", model: m[0], quantity: 1, usable_kwh: m[1] }] : null; }
  if (sg) return sg >= 2 && sg <= 8 ? [{ brand: SUNGROW, series: "SBH", model: `SBH${sg * 50}`, quantity: 1, usable_kwh: sg * 5 }] : null;
  const gw = bom.filter((b) => GW_LYNX[b.sku]);
  if (gw.length) return gw.map((b) => ({ brand: GOODWE, series: "Lynx D G2", model: GW_LYNX[b.sku]![0], quantity: b.qty, usable_kwh: GW_LYNX[b.sku]![1] }));
  return [];
}

const STREET_TYPES: Record<string, string> = {
  street: "ST", st: "ST", road: "RD", rd: "RD", avenue: "AV", ave: "AV", av: "AV", drive: "DR", dr: "DR", court: "CT", ct: "CT", circuit: "CCT", cct: "CCT",
  place: "PL", pl: "PL", crescent: "CRES", cres: "CRES", parade: "PDE", pde: "PDE", lane: "LANE", ln: "LANE", boulevard: "BVD", bvd: "BVD",
  close: "CL", cl: "CL", terrace: "TCE", tce: "TCE", way: "WAY", highway: "HWY", hwy: "HWY", esplanade: "ESP", esp: "ESP", grove: "GR", gr: "GR",
  square: "SQ", sq: "SQ", rise: "RISE", view: "VIEW", vista: "VSTA", walk: "WALK", track: "TRK", trail: "TRL", mews: "MEWS", loop: "LOOP", parkway: "PWY",
};

export function parseStreet(line1: string) {
  const m = line1.trim().replace(/,$/, "").match(/^(\d+[A-Za-z]?)\s+(.+?)\s+([A-Za-z]+)\.?$/);
  if (!m) return null;
  const type = STREET_TYPES[m[3]!.toLowerCase()];
  return type ? { number_first: m[1]!, street_name: m[2]!.toUpperCase(), street_type: type } : null;
}

type Installer = { formbay_installer_id: string | null; business_name: string } | null;

export function buildFormbayJob(q: QuoteRow, installer: Installer) {
  const blockers: string[] = [], warnings: string[] = [];
  const quote = q.snapshot ?? q.result;
  const c = quote.config;
  const site = (q.site ?? null) as (SiteAnswers & { nmi?: string; energyRetailer?: string }) | null;
  if (!site) blockers.push("No home details yet");
  if (!q.install_date) blockers.push("No install date booked");
  if (!installer?.formbay_installer_id) blockers.push("Installer has no Formbay team id (set it in Ops → Installers)");
  if (!site?.nmi) blockers.push("No NMI: ask the customer for it (it's on their electricity bill)");
  const street = site ? parseStreet(site.address.line1) : null;
  if (site && !street) blockers.push(`Couldn't split the street address "${site.address.line1}" into number, name and type: fix it on the job`);
  const invSku = c.bom.find((b) => b.sku.startsWith("INV-"))?.sku;
  const inv = invSku ? CEC_INVERTERS[invSku] : undefined;
  if (!inv) blockers.push(`No CEC model string for inverter ${invSku ?? "?"}`);
  else if (inv.verify) warnings.push(`${inv.model}: check the ${inv.verify} in Formbay after the first send`);
  const bats = c.usable_kwh > 0 ? cecBatteries(c.bom) : [];
  if (c.usable_kwh > 0 && (!bats || !bats.length)) blockers.push("No CEC battery model for this module count");
  const [first, ...rest] = String(q.customer_name ?? "").trim().split(/\s+/);
  const isPv = c.panel_kw > 0;
  const payload = {
    installationAddress: site ? {
      address: [site.address.unit ? `${site.address.unit}/${site.address.line1}` : site.address.line1, site.address.suburb, site.address.state, site.address.postcode].join(", "),
      number_first: street?.number_first, street_name: street?.street_name, street_type: street?.street_type,
      locality_name: site.address.suburb.toUpperCase(), state: site.address.state, postcode: site.address.postcode,
      ...(site.address.unit ? { flat_type: "UNIT", flat_number: site.address.unit.replace(/^(unit|u)\s*/i, "") } : {}),
    } : null,
    existingSystem: { installationType: 0 },
    ownerDetails: { firstName: first ?? "", lastName: rest.join(" "), phone: q.customer_phone ?? "", email: q.customer_email ?? "", owner_type: "individual" },
    isCommercial: false,
    scheduledInstallDate: q.install_date,
    inverters: inv ? [{ brand: inv.brand, series: inv.series, model: inv.model, quantity: 1, size: c.inverter?.ac_w }] : [],
    batteries: (bats ?? []).map((b) => ({ brand: b.brand, series: b.series, model: b.model, quantity: b.quantity, size: Math.round(b.usable_kwh * 1000) })),
    installerId: installer?.formbay_installer_id, designerId: installer?.formbay_installer_id, electricianId: installer?.formbay_installer_id,
    nmiNumber: site?.nmi, gridConnection: { nmi: site?.nmi }, energyRetailer: site?.energyRetailer,
    is_bstc: c.usable_kwh > 0 ? 1 : 0, activity_type: 4, pv_installed_90_days: false,
    refID: `DFRNT-${q.token.slice(0, 8).toUpperCase()}`,
    ...(isPv ? { panels: [{ quantity: (q.input as { panelCount?: number }).panelCount, size_kw: c.panel_kw }] } : {}),
  };
  const endpoint = isPv ? { path: "/jobs/pv_submit", type: "application/vnd.fb.submit_pv_job+json;v=1" } : { path: "/jobs/battery_submit", type: "application/vnd.fb.submit_prcs_job+json;v=1" };
  if (isPv) warnings.push("Solar + battery job: panel fields follow Formbay's spec; check the first one in Formbay after sending");
  return { payload, endpoint, blockers, warnings };
}

/** Ops-approved send. Stores what was sent and the Formbay ids returned. */
export async function sendFormbayJob(q: QuoteRow, installer: Installer) {
  const job = buildFormbayJob(q, installer);
  if (job.blockers.length) throw new Error(job.blockers.join(" · "));
  const { token } = await formbayToken();
  const r = await fetch(`${FORMBAY_API}${job.endpoint.path}`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": job.endpoint.type, accept: "application/json" }, body: JSON.stringify(job.payload), cache: "no-store",
  });
  const text = await r.text();
  let j: Record<string, unknown> = {}; try { j = JSON.parse(text); } catch { /* not JSON */ }
  await db()`update quotes set formbay_sent_payload = ${db().json({ at: new Date().toISOString(), payload: job.payload, status: r.status, response: j ?? text.slice(0, 2000) } as never)} where id = ${q.id}`;
  if (!r.ok) throw new Error(`Formbay refused the job (${r.status}): ${String(j.message ?? j.error ?? text).slice(0, 300)}`);
  const formid = String(j.formid ?? (j.data as Record<string, unknown>)?.formid ?? "");
  const bstc = String(j.bstc_id ?? j.bstcid ?? (j.data as Record<string, unknown>)?.bstc_id ?? "");
  await db()`update quotes set formbay_formid = ${formid || null}, formbay_bstc_id = ${bstc || null}, formbay_status = 'not_started', formbay_synced_at = now() where id = ${q.id}`;
  return { formid, bstc };
}

/** Read one job's status from Formbay. */
export async function formbayJobStatus(formid: string) {
  const r = await formbayGetAccept(`/client_api/get_jobs?ftype=bstc&formid=${encodeURIComponent(formid)}`, "application/vnd.fb.jobs+json;v=1");
  const rec = (Array.isArray(r.json) ? r.json[0] : (r.json as { data?: unknown[] })?.data?.[0] ?? r.json) as Record<string, unknown> | undefined;
  return { http: r.status, status: rec?.status as string | undefined, complete: !!(rec?.requirements as { complete?: boolean })?.complete, record: rec };
}

export async function formbayGetAccept(path: string, accept: string) {
  const { token } = await formbayToken();
  const r = await fetch(`${FORMBAY_API}${path}`, { headers: { authorization: `Bearer ${token}`, accept }, cache: "no-store" });
  const text = await r.text(); let json: unknown = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text: json ? "" : text.slice(0, 300) };
}

export { formbayGet };
