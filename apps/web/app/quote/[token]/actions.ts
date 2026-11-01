"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@dfrnt/db";
import type { SiteAnswers } from "@dfrnt/engine";
import { answerRevision, applyCode, chooseBank, CUSTOMER, cancel, decideVariation, getQuote, sign, submitSite } from "@/lib/jobs";
import { queueMessage } from "@/lib/messages";
import { longDate } from "@/lib/site";
import { putPhoto } from "@/lib/storage";
import { allow } from "@/lib/ratelimit";

const back = (token: string, err?: string) => redirect(`/quote/${token}${err ? `?error=${encodeURIComponent(err)}` : ""}`);
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function run(token: string, fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e; back(token, (e as Error).message); }
  revalidatePath(`/quote/${token}`);
  back(token);
}

const PHOTO_KINDS = ["switchboard", "meter", "roof", "battery_location"] as const;
const goto = (token: string, step?: number, err?: string) =>
  redirect(`/quote/${token}?${new URLSearchParams({ ...(step ? { step: String(step) } : {}), ...(err ? { error: err } : {}) })}#checkout`);

async function stepRun(token: string, step: number, fn: () => Promise<number | void>) {
  let next: number | void = undefined;
  try { next = await fn(); } catch (e) { if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e; goto(token, step, (e as Error).message); }
  revalidatePath(`/quote/${token}`);
  goto(token, next || undefined);
}

async function openQuote(token: string) {
  const q = await getQuote(token);
  if (!q) throw new Error("Quote not found");
  if (!["saved", "secured", "lapsed"].includes(q.status)) throw new Error("This quote has already been priced");
  return q;
}

/* C1 step 1: name, mobile, email. Saved straight away so the lead is never lost, and the record link is emailed. */
export async function saveContact(f: FormData) {
  const token = s(f, "token");
  await stepRun(token, 1, async () => {
    if (!(await allow("contact", 20))) throw new Error("Too many attempts — please wait a few minutes");
    const q = await openQuote(token);
    const name = s(f, "name"), email = s(f, "email").toLowerCase(), phone = s(f, "phone").replace(/[^\d+]/g, "");
    if (name.length < 2) throw new Error("Enter your name");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email");
    if (!/^(\+?61|0)4\d{8}$/.test(phone)) throw new Error("Enter an Australian mobile, like 0412 345 678");
    const first = !q.customer_email || !q.checkout_at;
    await db()`update quotes set customer_name = ${name}, customer_email = ${email}, customer_phone = ${phone}, checkout_at = now(), updated_at = now() where id = ${q.id}`;
    if (first) await queueMessage("M12", token, email, { name: name.split(" ")[0], amount: q.result.stack.amount_payable, until: longDate(q.lock_until) });
    return 2;
  });
}

function draftFrom(f: FormData, postcode: string): Omit<SiteAnswers, "photos"> {
  const phases = s(f, "phases");
  let unit = s(f, "unit"), line1 = s(f, "line1").replace(/\s+/g, " ");
  const slash = /^(\d+[A-Za-z]?)\s*\/\s*(\d.+)$/.exec(line1);       // "3/12 Smith St" → unit 3, 12 Smith St
  if (slash && !unit) { unit = slash[1]!; line1 = slash[2]!; }
  return {
    address: { line1, unit: unit || undefined, suburb: s(f, "suburb"), state: "QLD", postcode: s(f, "postcode") || postcode, gnafPid: s(f, "gnafPid") || undefined },
    phases: phases === "3" ? 3 : phases === "1" ? 1 : "unknown",
    roofType: (s(f, "roofType") || "tin") as SiteAnswers["roofType"],
    storeys: Number(s(f, "storeys") || 1),
    batteryLocation: (s(f, "batteryLocation") || "other") as SiteAnswers["batteryLocation"],
    againstHabitableRoom: s(f, "againstHabitableRoom") === "yes",
    vehicleExposure: s(f, "vehicleExposure") === "yes",
    switchboard: (s(f, "switchboard") || "unsure") as SiteAnswers["switchboard"],
    cableRunM: Number(s(f, "cableRunM") || 5),
    priorBatteryClaim: s(f, "priorBatteryClaim") === "yes",
    nmi: s(f, "nmi").replace(/\s/g, "").toUpperCase() || undefined,
    energyRetailer: s(f, "energyRetailer") || undefined,
  };
}

/* C1 step 2: home details (address from G-NAF when the lookup is on). */
export async function saveHome(f: FormData) {
  const token = s(f, "token");
  await stepRun(token, 2, async () => {
    if (!(await allow("site", 30))) throw new Error("Too many attempts — please wait a few minutes");
    const q = await openQuote(token);
    const d = draftFrom(f, q.postcode);
    if (!/^\d{4}$/.test(d.address.postcode)) throw new Error("Enter a 4-digit postcode");
    if (!d.address.line1 || !d.address.suburb) throw new Error("Enter your street address and suburb");
    if (s(f, "multi") === "yes" && !d.address.unit) throw new Error("Add your unit or lot number — the rebate is rejected without it");
    if (/^\s*\d+\s*[-–]\s*\d+\s/.test(d.address.line1) && !d.address.unit) throw new Error("That street number is a range (like 19–21). Add your unit or lot number");
    if (d.nmi && !/^[A-Z0-9]{10,11}$/.test(d.nmi)) throw new Error("Your NMI is 10 or 11 letters and numbers, printed on your electricity bill");
    if (!/^\d+[A-Za-z]?([-–]\d+[A-Za-z]?)?\s+\S+/.test(d.address.line1.replace(/^(lot)\s*/i, ""))) throw new Error("Start the street address with the house number, like 12 Smith Street");
    await db()`update quotes set site_draft = ${db().json(d as never)}, checkout_at = now(), updated_at = now() where id = ${q.id}`;
    return 3;
  });
}

async function storePhotos(q: { id: string }, f: FormData) {
  let n = 0;
  for (const kind of PHOTO_KINDS) {
    const file = f.get(`photo_${kind}`);
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) throw new Error(`The ${kind.replace("_", " ")} photo must be an image`);
      if (file.size > 15_000_000) throw new Error(`The ${kind.replace("_", " ")} photo is over 15 MB`);
      const path = `${q.id}/${kind}-${Date.now()}.${file.type.split("/")[1] ?? "jpg"}`;
      await putPhoto(path, await file.arrayBuffer(), file.type);
      await db()`insert into quote_photos (quote_id, kind, path, content_type, bytes) values (${q.id}, ${kind}, ${path}, ${file.type}, ${file.size})`;
      n++;
    }
  }
  return n;
}

/* C1 step 3: photos, then the confirmed price (instant for standard homes, otherwise the installer's photo check). */
export async function submitHome(f: FormData) { await photoStep(f, true); }
export async function savePhotos(f: FormData) { await photoStep(f, false); }
async function photoStep(f: FormData, finish: boolean) {
  const token = s(f, "token");
  await stepRun(token, 3, async () => {
    if (!(await allow("site", 30))) throw new Error("Too many attempts — please wait a few minutes");
    const q = await openQuote(token);
    if (!q.site_draft?.address) return 2;
    await storePhotos(q, f);
    const chosen = s(f, "installer");
    if (chosen && /^[0-9a-f-]{36}$/.test(chosen)) await db()`update quotes set chosen_installer_id = ${chosen} where id = ${q.id}`;
    await db()`update quotes set checkout_at = now() where id = ${q.id}`;
    const have = await db()`select distinct kind from quote_photos where quote_id = ${q.id}`;
    const photos: Record<string, boolean> = Object.fromEntries(have.map((r) => [r.kind as string, true]));
    const missing = PHOTO_KINDS.filter((k) => !photos[k]);
    if (!finish || missing.length) {
      if (finish) throw new Error(`Still needed: ${missing.map((k) => k.replace("_", " ")).join(", ")}. Or tap "Call me back" and we'll help.`);
      return 3;
    }
    const fresh = (await getQuote(token))!;
    await submitSite(fresh, { ...(fresh.site_draft as Omit<SiteAnswers, "photos">), photos } as SiteAnswers,
      { name: fresh.customer_name ?? "", email: fresh.customer_email ?? "", phone: fresh.customer_phone ?? "" });
  });
}

/** C1: send the record link so the photos can be taken on a phone. */
export async function emailMeLink(f: FormData) {
  const token = s(f, "token");
  await stepRun(token, 3, async () => {
    if (!(await allow("emaillink", 5))) throw new Error("We've sent it already — check your inbox");
    const q = await openQuote(token);
    await queueMessage("M12", token, q.customer_email, { name: (q.customer_name ?? "").split(" ")[0] || null, amount: q.result.stack.amount_payable, until: longDate(q.lock_until) });
    redirect(`/quote/${token}?step=3&sent=1#checkout`);
  });
}

/** C6: customer accepts or keeps the original after a design change. */
export async function acceptRevision(f: FormData) { await revisionAnswer(f, true); }
export async function keepOriginal(f: FormData) { await revisionAnswer(f, false); }
async function revisionAnswer(f: FormData, accept: boolean) {
  const token = s(f, "token");
  await run(token, async () => answerRevision((await getQuote(token))!, accept));
}

export async function signAgreement(f: FormData) {
  const token = s(f, "token");
  await run(token, async () => {
    if (f.get("agree") !== "on") throw new Error("Tick the box to accept the agreement");
    if (s(f, "name").length < 3) throw new Error("Type your full name to sign");
    await sign((await getQuote(token))!, s(f, "name"));
  });
}

export async function payByBank(f: FormData) {
  const token = s(f, "token");
  await run(token, async () => chooseBank((await getQuote(token))!));
}

export async function pickDate(f: FormData) {
  const token = s(f, "token");
  await run(token, async () => {
    const { bookDay } = await import("@/lib/schedule");
    await bookDay((await getQuote(token))!, s(f, "date"), CUSTOMER, "customer");
  });
}

/** Scheduling S4: "Yes, move me earlier". */
export async function takeEarlierDay(f: FormData) {
  const token = s(f, "token");
  await run(token, async () => {
    const { takeEarlier } = await import("@/lib/schedule");
    await takeEarlier((await getQuote(token))!, s(f, "offer"));
  });
}

/** The customer moves their own day (more than 3 working days out); they then pick again. */
export async function changeMyDay(f: FormData) {
  const token = s(f, "token");
  await run(token, async () => {
    const q = (await getQuote(token))!;
    if (q.status !== "booked" || !q.install_date) throw new Error("Call us to change your day now the gear is on its way");
    const { addWorkdays } = await import("@dfrnt/engine");
    const { todayAEST } = await import("@/lib/api");
    if (q.install_date <= addWorkdays(todayAEST(), 3, [1, 2, 3, 4, 5])) throw new Error("Your install is only a few days away. Call us on 1300 133 768 to move it.");
    const { releaseDay } = await import("@/lib/schedule");
    await releaseDay(q, "customer", CUSTOMER);
  });
}

export async function saveAccess(f: FormData) {
  const token = s(f, "token");
  await run(token, async () => { await db()`update quotes set access_notes = ${s(f, "access").slice(0, 1000) || null} where token = ${token}`; });
}

export async function customerMessage(f: FormData) {
  const token = s(f, "token");
  await run(token, async () => {
    if (!(await allow("msg", 20))) throw new Error("Too many messages — please wait a few minutes");
    const q = (await getQuote(token))!;
    const { postMessage } = await import("@/lib/thread");
    await postMessage(token, "customer", (q.customer_name ?? "").split(" ")[0] || null, s(f, "body"));
  });
}

export async function approveVariation(f: FormData) { await answerVariation(f, true); }
export async function declineVariation(f: FormData) { await answerVariation(f, false); }
async function answerVariation(f: FormData, approve: boolean) {
  const token = s(f, "token");
  await run(token, async () => decideVariation((await getQuote(token))!, s(f, "variation"), approve));
}

export async function cancelOrder(f: FormData) {
  const token = s(f, "token");
  await run(token, async () => {
    if (f.get("confirm") !== "on") throw new Error("Tick the box to confirm you want to cancel");
    await cancel((await getQuote(token))!, CUSTOMER, s(f, "reason") || "Customer cancelled");
  });
}

export async function addCode(f: FormData) {
  const token = s(f, "token");
  await run(token, async () => applyCode((await getQuote(token))!, s(f, "code")));
}

/** A21/A22: the customer's review and showcase consent, once the system is installed. */
export async function leaveReview(f: FormData) {
  const token = s(f, "token");
  await run(token, async () => {
    if (!(await allow("review", 5))) throw new Error("Too many attempts — please wait a few minutes");
    const q = await getQuote(token);
    if (!q || !["installed", "lodged", "settled", "complete"].includes(q.status)) throw new Error("Reviews open once your system is installed");
    const rating = Number(s(f, "rating")), body = s(f, "body").slice(0, 3000);
    if (!(rating >= 1 && rating <= 5)) throw new Error("Pick a rating from 1 to 5");
    if (body.length < 10) throw new Error("Tell us a little more (at least a sentence)");
    const site = ((q.site as { address?: { suburb?: string } } | null)?.address ?? {}) as { suburb?: string };
    const first = String(q.customer_name ?? "").split(" ")[0] || null;
    await db()`insert into reviews (quote_id, installer_id, rating, body, first_name, suburb)
      values (${q.id}, ${q.installer_id ?? null}, ${rating}, ${body}, ${first}, ${site.suburb ?? null})
      on conflict (quote_id) do update set rating = excluded.rating, body = excluded.body, status = 'pending', published_at = null`;
    await db()`update quotes set showcase_consent = ${f.get("showcase") === "on"} where id = ${q.id}`;
  });
}
