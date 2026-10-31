"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@dfrnt/db";
import type { SiteAnswers } from "@dfrnt/engine";
import { applyCode, book, chooseBank, CUSTOMER, cancel, decideVariation, getQuote, sign, submitSite } from "@/lib/jobs";
import { putPhoto } from "@/lib/storage";
import { allow } from "@/lib/ratelimit";

const back = (token: string, err?: string) => redirect(`/quote/${token}${err ? `?error=${encodeURIComponent(err)}` : ""}`);
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function run(token: string, fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e; back(token, (e as Error).message); }
  revalidatePath(`/quote/${token}`);
  back(token);
}

export async function submitHome(f: FormData) {
  const token = s(f, "token");
  await run(token, async () => {
    if (!(await allow("site", 15))) throw new Error("Too many attempts — please wait a few minutes");
    const q = await getQuote(token);
    if (!q) throw new Error("Quote not found");
    const photos: Record<string, boolean> = {};
    for (const kind of ["switchboard", "meter", "roof", "battery_location"]) {
      const file = f.get(`photo_${kind}`);
      if (file instanceof File && file.size > 0) {
        if (!file.type.startsWith("image/")) throw new Error(`The ${kind.replace("_", " ")} photo must be an image`);
        if (file.size > 15_000_000) throw new Error(`The ${kind.replace("_", " ")} photo is over 15 MB`);
        const path = `${q.id}/${kind}-${Date.now()}.${file.type.split("/")[1] ?? "jpg"}`;
        await putPhoto(path, await file.arrayBuffer(), file.type);
        await db()`insert into quote_photos (quote_id, kind, path, content_type, bytes) values (${q.id}, ${kind}, ${path}, ${file.type}, ${file.size})`;
      }
    }
    const have = await db()`select distinct kind from quote_photos where quote_id = ${q.id}`;
    for (const r of have) photos[r.kind as string] = true;
    const phases = s(f, "phases");
    const site: SiteAnswers = {
      address: { line1: s(f, "line1"), unit: s(f, "unit"), suburb: s(f, "suburb"), state: "QLD", postcode: s(f, "postcode") || q.postcode },
      phases: phases === "3" ? 3 : phases === "1" ? 1 : "unknown",
      roofType: (s(f, "roofType") || "tin") as SiteAnswers["roofType"],
      storeys: Number(s(f, "storeys") || 1),
      batteryLocation: (s(f, "batteryLocation") || "other") as SiteAnswers["batteryLocation"],
      againstHabitableRoom: s(f, "againstHabitableRoom") === "yes",
      vehicleExposure: s(f, "vehicleExposure") === "yes",
      switchboard: (s(f, "switchboard") || "unsure") as SiteAnswers["switchboard"],
      cableRunM: Number(s(f, "cableRunM") || 5),
      priorBatteryClaim: s(f, "priorBatteryClaim") === "yes",
      photos,
    };
    if (!/^\d{4}$/.test(site.address.postcode)) throw new Error("Enter a 4-digit postcode");
    if (s(f, "multi") === "yes" && !site.address.unit) throw new Error("Add your unit or lot number — the rebate is rejected without it");
    if (/^\s*\d+\s*[-–]\s*\d+\s/.test(site.address.line1) && !site.address.unit) throw new Error("That street number is a range (like 19–21). Add your unit or lot number");
    if (!s(f, "name") || !/^\S+@\S+\.\S+$/.test(s(f, "email"))) throw new Error("Enter your name and a valid email");
    await submitSite(q, site, { name: s(f, "name"), email: s(f, "email"), phone: s(f, "phone") });
  });
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
  await run(token, async () => book((await getQuote(token))!, s(f, "date")));
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
