// Site photos: which ones a job needs (by type), what we ask the customer, and the installer's "send this one again" (P3/P4, 4 Nov 2026).
import { db, write, type Actor } from "@dfrnt/db";
import type { PhotoKind } from "@dfrnt/engine";
import { getQuote, notifyInstallerToPrice, photosFor, type QuoteRow } from "./jobs";
import { queueMessage } from "./messages";

export { photosFor };

/** What the customer is asked for, per photo kind: title and hint. */
export const PHOTO_COPY: Record<PhotoKind, [string, string]> = {
  switchboard: ["Switchboard, door open", "Stand back so the whole board and its labels are in the shot."],
  meter: ["Electricity meter", "Close enough to read the numbers on it."],
  roof: ["Roof, from the street", "The side the panels would go on, if you can."],
  battery_location: ["Where the battery goes", "The wall, with a metre or so of space either side showing."],
  existing_inverter: ["Your existing solar inverter and its label", "The whole unit, then close enough to read the brand and model on the label."],
};
export const ALL_KINDS: PhotoKind[] = ["switchboard", "meter", "roof", "battery_location", "existing_inverter"];
export const isKind = (k: string): k is PhotoKind => (ALL_KINDS as string[]).includes(k);

/** Photo kinds with a current (not superseded) upload. */
export async function activeKinds(quoteId: string): Promise<Set<string>> {
  const rows = await db()`select distinct kind from quote_photos where quote_id = ${quoteId} and superseded_at is null`;
  return new Set(rows.map((r) => r.kind as string));
}

/** Kinds the installer has asked to see again and the customer hasn't re-sent yet: superseded, with no newer live photo. */
export async function retakeKinds(quoteId: string): Promise<{ kind: PhotoKind; reason: string | null }[]> {
  const rows = await db()`select distinct on (kind) kind, retake_reason from quote_photos p where quote_id = ${quoteId} and superseded_at is not null
    and not exists (select 1 from quote_photos n where n.quote_id = p.quote_id and n.kind = p.kind and n.superseded_at is null) order by kind, superseded_at desc`;
  return rows.map((r) => ({ kind: r.kind as PhotoKind, reason: (r.retake_reason as string | null) ?? null }));
}

/** I2 → P4: the installer can't read a photo. It's superseded (kept, never deleted), the customer is asked for that one again,
 *  and the job stays with the installer. */
export async function requestRetake(q: QuoteRow, actor: Actor, kind: string, reason: string) {
  if (!["pricing_installer", "tech_review"].includes(q.status)) throw new Error("Photos can be asked for again while the job is being priced");
  if (!isKind(kind) || !photosFor(q).includes(kind)) throw new Error("Not a photo this job uses");
  const why = reason.trim().slice(0, 200);
  await write({ actor, action: "photos.request_retake", rationale: why || undefined }, { token: q.token, kind }, async (tx) => {
    const rows = await tx`update quote_photos set superseded_at = now(), retake_reason = ${why || null} where quote_id = ${q.id} and kind = ${kind} and superseded_at is null returning id`;
    if (!rows.length) throw new Error("That photo has already been asked for again");
    return { entity: "quote", entityId: q.id, event: "photo.retake_requested", result: { kind } };
  });
  await queueMessage("M16", q.token, q.customer_email, { name: q.customer_name, what: PHOTO_COPY[kind][0].toLowerCase(), reason: why || null });
}

/** The customer has re-sent a requested photo: tell the installer (I5 "retake"). Called after the upload is stored. */
export async function retakeReceived(quoteId: string) {
  const q = await (await import("./jobs")).getQuoteById(quoteId);
  if (!q || q.status !== "pricing_installer" || !q.installer_id) return;
  const still = await retakeKinds(q.id);
  if (still.length) return;                                        // more photos still to come; one email when the set is complete
  await db()`update quotes set pricing_requested_at = now(), reminders = reminders - 'price_nudge' where id = ${q.id}`;
  await notifyInstallerToPrice((await getQuote(q.token))!, q.installer_id, "retake");
}

/** "Confirmed by …": the same-day promise, honest about weekends and the 5 pm cut-off. */
export function pricePromise(now = new Date()): string {
  const aest = new Date(now.getTime() + 10 * 3600_000);
  const dow = aest.getUTCDay(), hour = aest.getUTCHours();
  if (dow === 0 || dow === 6) return "by 5 pm Monday";
  if (hour >= 17) return dow === 5 ? "by 5 pm Monday" : "by 5 pm tomorrow";
  return "by 5 pm today";
}
