// B1: Xero sync. Invoices and payments for customers, bills for installer pay runs, and STC sales, each sent once
// (xero_sync rows) with the job reference. Account codes and tax types are set once in Ops; until they are, nothing is
// guessed: rows wait as "needs account codes". Needs XERO_CLIENT_ID and XERO_CLIENT_SECRET (a Xero app with granular scopes).
import { db } from "@dfrnt/db";
import { getSetting, setSetting, type XeroSettings } from "./settings";
import { seal, signState, unseal } from "./secret";
import { siteUrl } from "./messages";

export const XERO_SCOPES = "openid profile email offline_access accounting.invoices accounting.payments accounting.contacts accounting.settings.read";
export const xeroReady = () => !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
const redirectUri = () => `${siteUrl()}/api/v1/xero/callback`;
const basic = () => `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64")}`;

export function xeroConnectUrl() {
  const p = new URLSearchParams({ response_type: "code", client_id: process.env.XERO_CLIENT_ID!, redirect_uri: redirectUri(), scope: XERO_SCOPES, state: signState({ x: 1 }) });
  return `https://login.xero.com/identity/connect/authorize?${p}`;
}

async function token(body: Record<string, string>) {
  const r = await fetch("https://identity.xero.com/connect/token", { method: "POST", headers: { authorization: basic(), "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Xero: ${j.error ?? r.status}`);
  return j;
}

export async function xeroFinish(code: string, by: string) {
  const j = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  const c = await fetch("https://api.xero.com/connections", { headers: { authorization: `Bearer ${j.access_token}` } });
  const conns = (await c.json().catch(() => [])) as { tenantId: string; tenantName: string; tenantType: string }[];
  const org = conns.find((x) => x.tenantType === "ORGANISATION") ?? conns[0];
  if (!org) throw new Error("No Xero organisation was connected");
  const cur = await getSetting("xero");
  await setSetting("xero", { ...cur, tenant_id: org.tenantId, tenant_name: org.tenantName, refresh_token_enc: seal(j.refresh_token!), connected_at: new Date().toISOString() }, by);
  cache = { token: j.access_token!, until: Date.now() + (j.expires_in ?? 1800) * 1000 };
}

let cache: { token: string; until: number } | null = null;
async function access(x: XeroSettings) {
  if (cache && cache.until > Date.now() + 60_000) return cache.token;
  if (!x.refresh_token_enc) throw new Error("Xero isn't connected");
  const j = await token({ grant_type: "refresh_token", refresh_token: unseal(x.refresh_token_enc) });
  await setSetting("xero", { ...x, refresh_token_enc: seal(j.refresh_token!) }, "xero-refresh");     // Xero rotates refresh tokens
  cache = { token: j.access_token!, until: Date.now() + (j.expires_in ?? 1800) * 1000 };
  return j.access_token!;
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const x = await getSetting("xero");
  const r = await fetch(`https://api.xero.com/api.xro/2.0${path}`, {
    method, headers: { authorization: `Bearer ${await access(x)}`, "xero-tenant-id": x.tenant_id!, accept: "application/json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { Message?: string; Elements?: { ValidationErrors?: { Message: string }[] }[] };
  if (!r.ok) throw new Error(`Xero ${r.status}: ${j.Elements?.[0]?.ValidationErrors?.map((e) => e.Message).join("; ") ?? j.Message ?? ""}`);
  return j;
}

export async function xeroAccounts() {
  const j = await api<{ Accounts: { Code: string; Name: string; Type: string; Status: string }[] }>("GET", "/Accounts");
  return j.Accounts.filter((a) => a.Status === "ACTIVE" && a.Code);
}

async function once(kind: string, ref: string, fn: () => Promise<string>) {
  const [row] = await db()`insert into xero_sync (kind, ref_id) values (${kind}, ${ref}) on conflict (kind, ref_id) do update set status = case when xero_sync.status = 'done' then 'done' else 'pending' end returning status`;
  if (row?.status === "done") return "skip";
  try { const id = await fn(); await db()`update xero_sync set status = 'done', xero_id = ${id}, error = null, synced_at = now() where kind = ${kind} and ref_id = ${ref}`; return "done"; }
  catch (e) { await db()`update xero_sync set status = 'failed', error = ${(e as Error).message.slice(0, 500)} where kind = ${kind} and ref_id = ${ref}`; return "failed"; }
}

const date = (d: unknown) => new Date(d as string).toISOString().slice(0, 10);

/** Push everything not yet in Xero. Safe to run repeatedly. */
export async function syncXero() {
  if (!xeroReady()) return { skipped: "not set up" };
  const x = await getSetting("xero");
  if (!x.refresh_token_enc) return { skipped: "not connected" };
  const c = x.codes;
  if (!c.sales || !c.stc || !c.bank || !c.installer) return { skipped: "needs account codes" };
  const out = { invoices: 0, bills: 0, stc: 0, failed: 0 };
  // Customer tax invoices (issued when payment is received) and their payments.
  const paid = await db()`select id, token, invoice_number, customer_name, customer_email, paid_at, snapshot, result, payment_reference from quotes
    where invoice_number is not null and paid_at is not null and not exists (select 1 from xero_sync s where s.kind = 'invoice' and s.ref_id = quotes.id::text and s.status = 'done') limit 25`;
  for (const q of paid) {
    const st = ((q.snapshot ?? q.result) as { stack: { price_inc_gst: number; less_stcs: number; amount_payable: number } }).stack;
    let invoiceId = "";
    const r = await once("invoice", q.id as string, async () => {
      const inv = await api<{ Invoices: { InvoiceID: string }[] }>("PUT", "/Invoices", { Invoices: [{
        Type: "ACCREC", Contact: { Name: q.customer_name ?? q.customer_email, EmailAddress: q.customer_email }, Date: date(q.paid_at), DueDate: date(q.paid_at),
        InvoiceNumber: q.invoice_number, Reference: `${q.payment_reference ?? ""} ${siteUrl()}/ops/job/${q.id}`.trim().slice(0, 255), Status: "AUTHORISED", LineAmountTypes: "Inclusive",
        LineItems: [
          { Description: "Solar and battery system, supplied and installed", Quantity: 1, UnitAmount: st.price_inc_gst, AccountCode: c.sales, TaxType: c.sales_tax || "OUTPUT" },
          { Description: "Less assignment of STCs", Quantity: 1, UnitAmount: -st.less_stcs, AccountCode: c.stc, TaxType: c.stc_tax || "BASEXCLUDED" },
        ] }] });
      invoiceId = inv.Invoices[0]!.InvoiceID;
      return invoiceId;
    });
    if (r === "done") {
      out.invoices++;
      await once("payment", q.id as string, async () => {
        const p = await api<{ Payments: { PaymentID: string }[] }>("PUT", "/Payments", { Payments: [{ Invoice: { InvoiceID: invoiceId }, Account: { Code: c.bank }, Date: date(q.paid_at), Amount: st.amount_payable, Reference: q.payment_reference }] });
        return p.Payments[0]!.PaymentID;
      });
    } else if (r === "failed") out.failed++;
  }
  // Installer pay runs: one bill per paid ledger line.
  const ledger = await db()`select l.id, l.description, l.amount_ex::float8 amount, l.paid_at, i.business_name, i.email, q.id qid from pay_ledger l join installers i on i.id = l.installer_id left join quotes q on q.id = l.quote_id
    where l.status = 'paid' and l.amount_ex > 0 and not exists (select 1 from xero_sync s where s.kind = 'bill' and s.ref_id = l.id::text and s.status = 'done') limit 25`;
  for (const l of ledger) {
    const r = await once("bill", l.id as string, async () => {
      const b = await api<{ Invoices: { InvoiceID: string }[] }>("PUT", "/Invoices", { Invoices: [{
        Type: "ACCPAY", Contact: { Name: l.business_name, EmailAddress: l.email }, Date: date(l.paid_at ?? new Date()), DueDate: date(l.paid_at ?? new Date()),
        Reference: `DFRNT pay run ${String(l.qid ?? "").slice(0, 8)}`, Status: "AUTHORISED", LineAmountTypes: "Exclusive",
        LineItems: [{ Description: l.description, Quantity: 1, UnitAmount: l.amount, AccountCode: c.installer, TaxType: c.installer_tax || "INPUT" }] }] });
      return b.Invoices[0]!.InvoiceID;
    });
    if (r === "done") out.bills++; else if (r === "failed") out.failed++;
  }
  // STC sales (to our STC agent) once the cash is in.
  const stc = await db()`select s.id, s.realised_value::float8 v, s.solar_stcs + s.battery_stcs n, s.updated_at, s.formbay_ref from stc_receivables s
    where s.status = 'paid' and s.realised_value > 0 and not exists (select 1 from xero_sync x where x.kind = 'stc' and x.ref_id = s.id::text and x.status = 'done') limit 25`;
  for (const r0 of stc) {
    const r = await once("stc", r0.id as string, async () => {
      const inv = await api<{ Invoices: { InvoiceID: string }[] }>("PUT", "/Invoices", { Invoices: [{
        Type: "ACCREC", Contact: { Name: "Formbay" }, Date: date(r0.updated_at), DueDate: date(r0.updated_at), Reference: `STCs ${r0.formbay_ref ?? ""}`.trim(), Status: "AUTHORISED", LineAmountTypes: "Inclusive",
        LineItems: [{ Description: `${r0.n} STCs sold`, Quantity: 1, UnitAmount: r0.v, AccountCode: c.stc_sale || c.stc, TaxType: c.stc_sale_tax || "OUTPUT" }] }] });
      return inv.Invoices[0]!.InvoiceID;
    });
    if (r === "done") out.stc++; else if (r === "failed") out.failed++;
  }
  return out;
}
