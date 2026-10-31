"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, write } from "@dfrnt/db";
import type { JobState } from "@dfrnt/engine";
import { requireInstaller } from "@/lib/auth";
import { advance, getQuoteById, installerPrice, raiseVariation } from "@/lib/jobs";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
async function own(f: FormData) {
  const me = await requireInstaller(s(f, "as") || undefined);
  const q = await getQuoteById(s(f, "id"));
  if (!q || q.installer_id !== me.id) throw new Error("Not your job");
  return { me, q };
}
async function run(path: string, fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e; redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent((e as Error).message)}`); }
  revalidatePath(path.split("?")[0]!); redirect(path);
}
const back = (f: FormData) => `/installer/job/${s(f, "id")}${s(f, "as") ? `?as=${s(f, "as")}` : ""}`;

export async function confirmPrice(f: FormData) {
  await run(back(f), async () => { const { me, q } = await own(f); await installerPrice(q, me.actor, f.getAll("codes").map(String), s(f, "note")); });
}
export async function installerStage(f: FormData) {
  await run(back(f), async () => {
    const { me, q } = await own(f);
    const to = s(f, "to") as JobState;
    if (!["on_site", "installed"].includes(to)) throw new Error("Installers can mark on site and installed");
    await advance(q, to, me.actor, to === "installed" ? "Installer: commissioned and handed over" : "Installer: on site");
  });
}
export async function installerVariation(f: FormData) {
  await run(back(f), async () => { const { me, q } = await own(f); await raiseVariation(q, me.actor, s(f, "code") || "VAR-CUSTOM", s(f, "description"), s(f, "cost") ? Number(s(f, "cost")) : undefined); });
}
export async function saveAvailability(f: FormData) {
  const me = await requireInstaller(s(f, "as") || undefined);
  const path = `/installer${s(f, "as") ? `?as=${s(f, "as")}` : ""}`;
  await run(path, async () => {
    const capacity = { jobsPerDay: Math.max(1, Number(s(f, "jobsPerDay") || 1)), leadDays: Math.max(0, Number(s(f, "leadDays") || 3)), workingDays: f.getAll("workingDays").map(Number), blackouts: s(f, "blackouts").split(/[\s,]+/).filter(Boolean) };
    await write({ actor: me.actor, action: "installers.availability" }, capacity, async (tx) => {
      await tx`update installers set capacity = ${tx.json(capacity)} where id = ${me.id}`;
      return { entity: "installer", entityId: me.id, event: "installer.availability", result: capacity };
    });
  });
}
export async function saveScope(f: FormData) {
  const me = await requireInstaller(s(f, "as") || undefined);
  const path = `/installer${s(f, "as") ? `?as=${s(f, "as")}` : ""}`;
  await run(path, async () => {
    const [cur] = await db()`select scope from installers where id = ${me.id}`;
    const scope = {
      version: ((cur!.scope as { version: number }).version ?? 0) + 1,
      maxStoreys: Number(s(f, "maxStoreys") || 1), roofTypes: f.getAll("roofTypes").map(String), batteryLocations: f.getAll("batteryLocations").map(String),
      switchboardOk: true, maxCableRunM: Number(s(f, "maxCableRunM") || 10), phases: f.getAll("phases").map(Number),
    };
    await write({ actor: me.actor, action: "installers.scope" }, scope, async (tx) => {
      await tx`update installers set scope = ${tx.json(scope)} where id = ${me.id}`;
      return { entity: "installer", entityId: me.id, event: "installer.scope", result: { version: scope.version } };
    });
  });
}
