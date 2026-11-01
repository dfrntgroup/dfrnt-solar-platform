// R0/R2: the System Record after install. Formbay paperwork and serials pulled automatically (read-only), documents,
// product datasheets, warranty at a glance, monitoring, fault reports and passing the record to a new owner.
import { randomBytes } from "node:crypto";
import { db, write } from "@dfrnt/db";
import { DEFAULT_RULES } from "@dfrnt/engine";
import { getQuote, type QuoteRow } from "./jobs";
import { putPhoto } from "./storage";
import { queueMessage } from "./messages";

export const WARRANTY_YEARS: Record<string, number> = { panels: 25, inverter: 10, battery: 10, workmanship: 10 };
export const MONITORING: Record<string, { app: string; how: string }> = {
  SolaX: { app: "SolaXCloud", how: "Search \"SolaXCloud\" in the App Store or Google Play." },
  Sungrow: { app: "iSolarCloud", how: "Search \"iSolarCloud\" in the App Store or Google Play." },
  GoodWe: { app: "SEMS Portal", how: "Search \"SEMS Portal\" in the App Store or Google Play." },
  Sigenergy: { app: "mySigen", how: "Search \"mySigen\" in the App Store or Google Play." },
};

export const brandOf = (q: QuoteRow) => DEFAULT_RULES.families[q.input.familyKey]?.brand ?? (q.title ?? "").split(" · ")[0] ?? "";

/** Products on this job (for datasheets): the BOM SKUs that aren't bundled parts. */
export function productSkus(q: QuoteRow) {
  const p = q.snapshot ?? q.result;
  return p.config.bom.filter((b) => !b.included && !b.sku.startsWith("BOS") && !b.sku.startsWith("MNT")).map((b) => ({ sku: b.sku, description: b.description, qty: b.qty, serial: b.serial }));
}

/** Formbay: once the job is with the Regulator, archive the full document pack (CoC, STC form, photos) and the serials. */
export async function pullFormbayRecord(quoteId: string) {
  const [q] = await db()`select id, formbay_formid, formbay_bstc_id, formbay_docs_at from quotes where id = ${quoteId}`;
  if (!q || q.formbay_docs_at) return "skip";
  const { formbayToken, FORMBAY_API } = await import("./formbay");
  const { formbayJobStatus } = await import("./formbay-job");
  const fid = (q.formbay_bstc_id ?? q.formbay_formid) as string | null;
  if (!fid) return "no job";
  const st = await formbayJobStatus(fid);
  const rec = (st.record ?? {}) as { serials?: { serial?: string; type?: string; model?: string }[]; dateOfCommission?: string };
  const serials = (rec.serials ?? []).filter((x) => x?.serial).map((x) => ({ serial: String(x.serial), kind: x.type, model: x.model }));
  const commissioned = rec.dateOfCommission ? new Date(rec.dateOfCommission).toISOString().slice(0, 10) : null;
  const { token } = await formbayToken();
  const tries = q.formbay_formid ? [[q.formbay_formid, "pv"], [q.formbay_bstc_id ?? q.formbay_formid, "bstc"]] : [[q.formbay_bstc_id, "bstc"]];
  let saved = false;
  for (const [id, ftype] of tries) {
    if (!id) continue;
    const r = await fetch(`${FORMBAY_API}/client_api/forms_docs_zip?formid=${encodeURIComponent(id as string)}&ftype=${ftype}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !/zip|octet-stream/.test(type)) continue;
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 200) continue;
    const path = `records/${quoteId}/formbay-pack-${Date.now()}.zip`;
    await putPhoto(path, buf, "application/zip");
    await db()`insert into job_documents (quote_id, kind, title, path, content_type, source) values (${quoteId}, 'formbay_pack', 'Installation pack: certificate of compliance, STC form and install photos (zip)', ${path}, 'application/zip', 'formbay')`;
    saved = true;
    break;
  }
  await db()`update quotes set serials = ${serials.length ? db().json(serials as never) : null}, commissioned_on = ${commissioned}, formbay_docs_at = ${saved ? new Date() : null} where id = ${quoteId}`;
  return saved ? "saved" : "no pack yet";
}

export async function recordDocuments(quoteId: string) {
  return db()`select id, kind, title, content_type, created_at from job_documents where quote_id = ${quoteId} order by created_at`;
}
export async function productDocs(skus: string[]) {
  if (!skus.length) return [];
  return db()`select id, sku, kind, title, url from product_docs where sku = any(${skus}) order by sku, kind`;
}

/** "Something's not right": a fault ticket with the system, serials and warranty status already attached. */
export async function reportFault(q: QuoteRow, f: { what: string; detail: string; photos: File[] }) {
  const { openTicket } = await import("./ops");
  const installed = q.commissioned_on ?? q.install_date ?? "";
  const years = installed ? (Date.now() - Date.parse(`${installed}T00:00:00Z`)) / (365.25 * 86400_000) : 0;
  const cover = Object.entries(WARRANTY_YEARS).filter(([, y]) => years < y).map(([k]) => k).join(", ") || "none";
  const body = [`${f.what}`, "", f.detail, "", `System: ${(q.snapshot ?? q.result).config.summary}`, `Installed: ${installed || "unknown"} · still under warranty: ${cover}`,
    `Serials: ${(q.serials ?? []).map((s) => s.serial).join(", ") || "not yet on file"}`].join("\n");
  const id = await openTicket({ kind: "fault", name: q.customer_name ?? undefined, email: q.customer_email ?? undefined, phone: q.customer_phone ?? undefined, subject: `Fault: ${f.what}`.slice(0, 120), body, quoteId: q.id });
  for (const file of f.photos.slice(0, 3)) {
    if (!file.size || !file.type.startsWith("image/") || file.size > 15_000_000) continue;
    const path = `${q.id}/issue-${Date.now()}.${file.type.split("/")[1] ?? "jpg"}`;
    await putPhoto(path, await file.arrayBuffer(), file.type);
    await db()`insert into quote_photos (quote_id, kind, path, content_type, bytes, ticket_id) values (${q.id}, 'issue', ${path}, ${file.type}, ${file.size}, ${id})`;
  }
  const { getSetting } = await import("./settings");
  const { sendEmail } = await import("./email");
  const to = (await getSetting("trust")).callback_to;
  if (to) await sendEmail(to, `Fault reported: ${q.customer_name ?? ""} · ${f.what}`, `${body}\n\nOps → Support to reply.`).catch(() => null);
  return id;
}

/** Moving house: the record passes to the buyer with a new private link; the old link says where it went. */
export async function transferRecord(q: QuoteRow, buyer: { name: string; email: string }) {
  const fresh = randomBytes(18).toString("hex");
  await write({ actor: { type: "customer", id: "record-link" }, action: "records.transfer" }, { token: q.token, to: buyer.email }, async (tx) => {
    await tx`insert into record_moves (old_token, quote_id) values (${q.token}, ${q.id})`;
    await tx`update quotes set token = ${fresh}, customer_name = ${buyer.name}, customer_email = ${buyer.email}, customer_phone = null, updated_at = now() where id = ${q.id}`;
    return { entity: "quote", entityId: q.id, event: "record.transferred", result: { ok: true } };
  });
  await queueMessage("M22", fresh, buyer.email, { name: buyer.name });
}

export async function movedTo(token: string) {
  const [m] = await db()`select moved_at from record_moves where old_token = ${token}`;
  return m ? (m.moved_at as Date) : null;
}

export async function getRecord(token: string) { return getQuote(token); }
