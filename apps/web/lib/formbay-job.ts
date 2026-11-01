// Builds the Formbay job for a booked DFRNT job, checks it, sends it (ops click), and syncs its status back.
// Nothing is sent automatically unless settings.formbay.auto_create is switched on in Ops.
import { db } from "@dfrnt/db";
import type { SiteAnswers } from "@dfrnt/engine";
import { formbayToken, FORMBAY_API, formbayGet } from "./formbay";
import type { QuoteRow } from "./jobs";

/** CEC strings Formbay expects, per our SKU. Entries marked verify must be checked against Formbay's CEC list before first send. */
export const CEC: Record<string, { brand: string; series: string; model: string; usable_kwh?: number; nominal_kwh?: number; verify?: boolean }> = {
  "PRT-GW-LX-D-8.3-G20": { brand: "GoodWe Technologies Co Ltd", series: "Lynx D G2", model: "GW8.3-BAT-D-G20", usable_kwh: 8.0, nominal_kwh: 8.32 },
  "INV-GW-EHA-10K": { brand: "GoodWe Technologies Co Ltd", series: "ESA", model: "GW9.999K-EHA-G20 (AS4777-2 2020)" },
};

const STREET_TYPES: Record<string, string> = {
  street: "ST", st: "ST", road: "RD", rd: "RD", avenue: "AVE", ave: "AVE", drive: "DR", dr: "DR", court: "CT", ct: "CT", circuit: "CCT", cct: "CCT",
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
  const inv = invSku ? CEC[invSku] : undefined;
  if (!inv) blockers.push(`No CEC model string for inverter ${invSku ?? "?"}`);
  const modules = c.bom.filter((b) => (b as { serial?: string }).serial === "module");
  const bats = modules.map((b) => ({ b, cec: CEC[b.sku] }));
  if (c.usable_kwh > 0 && (!bats.length || bats.some((x) => !x.cec))) blockers.push(`No CEC model string for battery ${bats.map((x) => x.b.sku).join(", ") || "?"}`);
  [inv, ...bats.map((x) => x.cec)].forEach((x) => x?.verify && warnings.push(`${x.model}: CEC string to be verified`));
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
    batteries: bats.filter((x) => x.cec).map((x) => ({ brand: x.cec!.brand, series: x.cec!.series, model: x.cec!.model, quantity: x.b.qty, size: Math.round((x.cec!.usable_kwh ?? 0) * 1000) })),
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
