// G1: tell Meta (Conversions API) and Google Ads (scheduled HTTPS import) when someone gives their details, finishes
// checkout, signs and pays, with the real value. Each event is sent once per platform (unique row), only after the customer
// has given details under our privacy policy, with email and phone hashed. Nothing is sent unless the platform is set up.
import { createHash, createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@dfrnt/db";
import { siteUrl } from "./messages";

export type ConversionName = "Lead" | "SubmitApplication" | "SignedAgreement" | "Purchase";
export const GOOGLE_NAMES: Record<ConversionName, string> = { Lead: "DFRNT Lead", SubmitApplication: "DFRNT Checkout complete", SignedAgreement: "DFRNT Signed", Purchase: "DFRNT Paid" };

const sha = (s: string) => createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
export const metaReady = () => !!(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);

/** First touch: utm, click ids, landing page, plus the browser's Meta cookies and IP/agent for matching. Saved on the quote. */
export async function attributionNow(): Promise<Record<string, string>> {
  const c = await cookies(), h = await headers();
  let first: Record<string, string> = {};
  try { first = JSON.parse(decodeURIComponent(c.get("dfa")?.value ?? "{}")) as Record<string, string>; } catch { /* none */ }
  const out: Record<string, string> = { ...first };
  const fbp = c.get("_fbp")?.value, fbc = c.get("_fbc")?.value;
  if (fbp) out.fbp = fbp;
  if (fbc) out.fbc = fbc; else if (first.fbclid) out.fbc = `fb.1.${first.ts ?? Date.now()}.${first.fbclid}`;
  out.ip = (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim();
  out.ua = (h.get("user-agent") ?? "").slice(0, 400);
  return out;
}

/** Record the event (once) and send it to Meta now; Google collects it from the scheduled CSV. */
export async function trackConversion(quoteId: string, name: ConversionName, value?: number) {
  try {
    const [q] = await db()`select id, token, customer_email, customer_name, customer_phone, postcode, attribution, site from quotes where id = ${quoteId}`;
    if (!q?.customer_email) return;                                    // only once they've given details under the privacy policy
    const a = (q.attribution ?? {}) as Record<string, string>;
    if (a.gclid) await db()`insert into conversion_events (quote_id, name, platform, value) values (${q.id}, ${name}, 'google', ${value ?? null}) on conflict do nothing`;
    if (!metaReady()) return;
    const [row] = await db()`insert into conversion_events (quote_id, name, platform, value) values (${q.id}, ${name}, 'meta', ${value ?? null}) on conflict do nothing returning id`;
    if (!row) return;                                                  // already sent
    const [first, ...rest] = String(q.customer_name ?? "").trim().split(/\s+/);
    const phone = String(q.customer_phone ?? "").replace(/\D/g, "").replace(/^0/, "61");
    const site = (q.site ?? {}) as { address?: { suburb?: string } };
    const user_data: Record<string, unknown> = {
      em: [sha(q.customer_email as string)], ...(phone ? { ph: [sha(phone)] } : {}),
      ...(first ? { fn: [sha(first)] } : {}), ...(rest.length ? { ln: [sha(rest[rest.length - 1]!)] } : {}),
      ...(site.address?.suburb ? { ct: [sha(site.address.suburb.replace(/\s/g, ""))] } : {}),
      zp: [sha(String(q.postcode))], st: [sha("qld")], country: [sha("au")], external_id: [sha(q.id as string)],
      ...(a.ip ? { client_ip_address: a.ip } : {}), ...(a.ua ? { client_user_agent: a.ua } : {}), ...(a.fbp ? { fbp: a.fbp } : {}), ...(a.fbc ? { fbc: a.fbc } : {}),
    };
    const body = { data: [{ event_name: name, event_time: Math.floor(Date.now() / 1000), event_id: `${q.id}:${name}`, action_source: "website",
      event_source_url: `${siteUrl()}${a.landing ?? "/"}`, user_data, custom_data: { currency: "AUD", ...(value != null ? { value: Math.round(value * 100) / 100 } : {}) } }] };
    const v = process.env.META_GRAPH_VERSION ?? "v26.0";
    const r = await fetch(`https://graph.facebook.com/${v}/${process.env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(process.env.META_CAPI_TOKEN!)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as unknown as Response);
    const text = (await r.text()).slice(0, 500);
    await db()`update conversion_events set status = ${r.ok ? "sent" : "failed"}, http = ${r.status}, response = ${text}, sent_at = now() where id = ${row.id}`;
  } catch { /* tracking never blocks a sale */ }
}

/** Secret key for the Google Ads scheduled-import URL (derived, so there's nothing extra to store). */
export function googleFeedKey() {
  const base = process.env.TOKEN_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.POSTGRES_URL || "dev";
  return createHmac("sha256", base).update("google-ads-feed-v1").digest("hex").slice(0, 32);
}
