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
/** C6: the installer suggests a different design from the photos (more panels, a different battery size, a sub-board). */
export async function installerRevise(f: FormData) {
  await run(back(f), async () => {
    const { me, q } = await own(f);
    const { proposeRevision } = await import("@/lib/jobs");
    await proposeRevision(q, me.actor, { panels: Number(s(f, "panels")), modules: Number(s(f, "modules")), backup: s(f, "backup") === "whole_home" ? "whole_home" : "none", extraCodes: f.getAll("codes").map(String), reason: s(f, "reason") });
  });
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

const prof = (f: FormData) => `/installer/profile${s(f, "as") ? `?as=${s(f, "as")}` : ""}`;
export async function saveProfile(f: FormData) {
  const me = await requireInstaller(s(f, "as") || undefined);
  await run(prof(f), async () => {
    const v = { business_name: s(f, "business_name"), abn: s(f, "abn").replace(/\s/g, "") || null, contact_name: s(f, "contact_name"), phone: s(f, "phone") || null,
      address: s(f, "address") || null, licence_no: s(f, "licence_no") || null, saa_accreditation: s(f, "saa_accreditation") || null, insurance_expiry: s(f, "insurance_expiry") || null };
    if (v.abn && !/^\d{11}$/.test(v.abn)) throw new Error("ABN must be 11 digits");
    await write({ actor: me.actor, action: "installers.profile" }, v, async (tx) => {
      await tx`update installers set ${tx(v as never)} where id = ${me.id}`;
      return { entity: "installer", entityId: me.id, event: "installer.profile", result: { ok: true } };
    });
  });
}
export async function addTechnician(f: FormData) {
  const me = await requireInstaller(s(f, "as") || undefined);
  await run(prof(f), async () => {
    const [{ n }] = await db()`select count(*)::int n from technicians where installer_id = ${me.id} and active` as never as [{ n: number }];
    await db()`insert into technicians (installer_id, name, saa_number, formbay_id, phone, is_default) values (${me.id}, ${s(f, "name")}, ${s(f, "saa_number") || null}, ${s(f, "formbay_id") || null}, ${s(f, "phone") || null}, ${n === 0})`;
  });
}
export async function setDefaultTech(f: FormData) {
  const me = await requireInstaller(s(f, "as") || undefined);
  await run(prof(f), async () => {
    await db()`update technicians set is_default = (id = ${s(f, "id")}) where installer_id = ${me.id}`;
  });
}
export async function uploadDoc(f: FormData) {
  const me = await requireInstaller(s(f, "as") || undefined);
  await run(prof(f), async () => {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Choose a file");
    if (file.size > 15_000_000) throw new Error("File over 15 MB");
    const { putPhoto } = await import("@/lib/storage");
    const path = `installers/${me.id}/${s(f, "kind")}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    await putPhoto(path, await file.arrayBuffer(), file.type || "application/octet-stream");
    await db()`insert into installer_documents (installer_id, kind, path, expires_on) values (${me.id}, ${s(f, "kind")}, ${path}, ${s(f, "expires_on") || null})`;
  });
}
export async function setTechnician(f: FormData) {
  await run(back(f), async () => {
    const { me, q } = await own(f);
    const [t] = await db()`select id from technicians where id = ${s(f, "technician")} and installer_id = ${me.id}`;
    if (!t) throw new Error("Pick one of your technicians");
    await write({ actor: me.actor, action: "jobs.set_technician" }, { id: q.id, technician: t.id }, async (tx) => {
      await tx`update quotes set technician_id = ${t.id} where id = ${q.id}`;
      return { entity: "quote", entityId: q.id, event: "job.technician_set", result: { technician: t.id } };
    });
  });
}
