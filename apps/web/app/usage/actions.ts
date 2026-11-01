"use server";
import { redirect } from "next/navigation";
import { db } from "@dfrnt/db";
import { disconnect, linkByToken, pullLink, recommend, startLink, energySettings } from "@/lib/energy";
import { getQuote } from "@/lib/jobs";
import { allow } from "@/lib/ratelimit";
import type { DayRead } from "@dfrnt/engine";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const isRedirect = (e: unknown) => (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT");

/** S1 from the estimate page: email + three answers → Fiskil consent screen. */
export async function connectFromEstimate(f: FormData) {
  const back = s(f, "back") || "/estimate";
  let url = "";
  try {
    if (!(await allow("energy-start", 20))) throw new Error("Too many tries. Please wait a minute.");
    const email = s(f, "email");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Please enter your email so we can send your results");
    const postcode = /^\d{4}$/.test(s(f, "postcode")) ? s(f, "postcode") : "4551";
    url = await startLink({ email, name: s(f, "name") || null, postcode, phases: s(f, "phase") === "3" ? 3 : 1, hasSolar: s(f, "solar") === "yes", source: "estimate",
      roofMaxKw: Number(s(f, "roof")) || null });
  } catch (e) {
    if (isRedirect(e)) throw e;
    redirect(`${back}${back.includes("?") ? "&" : "?"}usage_error=${encodeURIComponent((e as Error).message)}#usage`);
  }
  redirect(url);
}

/** S1 from the customer's record: uses the details we already have. */
export async function connectFromRecord(f: FormData) {
  const token = s(f, "token");
  let url = "";
  try {
    const q = await getQuote(token);
    if (!q) throw new Error("Record not found");
    if (!q.customer_email && !s(f, "email")) throw new Error("Add your email first");
    url = await startLink({ email: q.customer_email ?? s(f, "email"), name: q.customer_name, phone: q.customer_phone, postcode: q.postcode,
      phases: q.input.phases === 3 ? 3 : 1, hasSolar: q.input.panelCount === 0, quoteId: q.id, source: "record" });
  } catch (e) {
    if (isRedirect(e)) throw e;
    redirect(`/quote/${token}?usage_error=${encodeURIComponent((e as Error).message)}#usage`);
  }
  redirect(url);
}

/** Customer says how much roof they have: re-size from the stored reads (no new pull). */
export async function setRoof(f: FormData) {
  const token = s(f, "token");
  const l = await linkByToken(token);
  if (!l || l.status !== "ready") redirect(`/usage/${token}`);
  const roof = Number(s(f, "roof")) || null;
  await db()`update energy_links set roof_max_kw = ${roof} where id = ${l.id}`;
  const [raw] = await db()`select days from energy_raw where link_id = ${l.id}`;
  const days = (raw?.days ?? []) as DayRead[];
  if (l.profile && l.tariff) {
    const sizing = await recommend({ ...l, roof_max_kw: roof }, l.profile, days, l.tariff, await energySettings());
    await db()`update energy_links set sizing = ${db().json(sizing as never)} where id = ${l.id}`;
  } else await pullLink(l.id, { force: true });
  redirect(`/usage/${token}`);
}

export async function refreshUsage(f: FormData) {
  const token = s(f, "token");
  const l = await linkByToken(token);
  if (l) await pullLink(l.id, { force: true });
  redirect(`/usage/${token}`);
}

/** S5: stop sharing and delete. */
export async function disconnectUsage(f: FormData) {
  const token = s(f, "token");
  const l = await linkByToken(token);
  if (l && s(f, "confirm") === "yes") await disconnect(l.id);
  redirect(`/usage/${token}?disconnected=1`);
}
