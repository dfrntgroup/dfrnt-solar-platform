import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@dfrnt/db";
import { consentEnded, pullLink, webhookEventKind } from "@/lib/energy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fiskil events. The payload is only ever a trigger: we re-read everything from Fiskil's API with our own key,
 * so an unsigned or forged event can at most cause a throttled re-pull. When FISKIL_WEBHOOK_SECRET is set,
 * the X-Fiskil-Signature HMAC is checked and bad signatures are rejected.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.FISKIL_WEBHOOK_SECRET;
  if (secret) {
    const got = (req.headers.get("x-fiskil-signature") ?? "").replace(/^sha256=/, "").trim();
    const want = createHmac("sha256", secret).update(raw).digest("hex");
    const ok = got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
    if (!ok) return new Response("bad signature", { status: 401 });
  }
  let body: { message_id?: string; data?: { event?: string; end_user_id?: string; consent_id?: string } } = {};
  try { body = JSON.parse(raw); } catch { return new Response("ok"); }
  const d = body.data ?? {}, event = String(d.event ?? ""), endUser = d.end_user_id;
  if (body.message_id) {
    const fresh = await db()`insert into energy_webhooks (message_id, event, end_user_id) values (${body.message_id}, ${event}, ${endUser ?? null}) on conflict do nothing returning message_id`;
    if (!fresh.length) return new Response("ok");
  }
  if (!endUser) return new Response("ok");
  const [l] = await db()`select id, status from energy_links where fiskil_end_user_id = ${endUser}`;
  if (!l) return new Response("ok");
  if (d.consent_id) await db()`update energy_links set consent_id = ${d.consent_id} where id = ${l.id} and consent_id is distinct from ${d.consent_id}`;
  const kind = webhookEventKind(event);
  if (kind === "revoked" || kind === "expired") await consentEnded(endUser, kind === "revoked");
  else if (kind === "sync" && /usage|accounts|servicepoints/.test(event) && l.status !== "disconnected") await pullLink(l.id as string, { force: l.status !== "ready" });
  return new Response("ok");
}
