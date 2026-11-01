"use server";
import { redirect } from "next/navigation";
import { db } from "@dfrnt/db";
import { allow } from "@/lib/ratelimit";
import { putPhoto } from "@/lib/storage";

export async function applyInstaller(f: FormData) {
  const v = (k: string) => String(f.get(k) ?? "").trim().slice(0, 1000);
  const all = (k: string) => f.getAll(k).map(String);
  if (!(await allow("apply", 5))) redirect("/installers/apply?sent=1");
  if (!v("business_name") || !v("contact_name") || !/^\S+@\S+\.\S+$/.test(v("email"))) redirect("/installers/apply");
  const team = v("team").split(/\n+/).map((l) => l.split(",").map((x) => x.trim())).filter(([n]) => n)
    .map(([name, saa, formbay]) => ({ name: name!, saa: saa || null, formbay_id: formbay?.replace(/\D/g, "") || null }));
  const details = {
    team,
    capacity: { jobsPerDay: Math.max(1, Number(v("jobsPerDay")) || 1), leadDays: Math.max(0, Number(v("leadDays")) || 5), workingDays: all("workingDays").map(Number), blackouts: [] },
    scope: { version: 1, roofTypes: all("roofTypes").length ? all("roofTypes") : ["tin"], phases: (all("phases").length ? all("phases") : ["1"]).map(Number),
      batteryLocations: all("batteryLocations").length ? all("batteryLocations") : ["garage"], maxStoreys: Number(v("maxStoreys")) || 1, switchboardOk: true, maxCableRunM: 10 },
  };
  const expiry = /^\d{4}-\d{2}-\d{2}$/.test(v("insurance_expiry")) ? v("insurance_expiry") : null;
  const [a] = await db()`insert into installer_applications (business_name, abn, contact_name, email, phone, postcodes, licence_no, notes, saa_accreditation, insurance, insurance_expiry, details)
    values (${v("business_name")}, ${v("abn") || null}, ${v("contact_name")}, ${v("email").toLowerCase()}, ${v("phone") || null}, ${v("postcodes") || null}, ${v("licence_no") || null},
      ${v("notes") || null}, ${team.map((t) => t.saa).filter(Boolean).join(", ") || null}, ${v("insurance") || null}, ${expiry}, ${db().json(details as never)}) returning id`;
  const doc = f.get("insurance_doc");
  if (doc instanceof File && doc.size > 0 && doc.size < 4_000_000 && /^(application\/pdf|image\/)/.test(doc.type)) {
    const path = `applications/${a!.id}/insurance.${doc.type === "application/pdf" ? "pdf" : doc.type.split("/")[1] ?? "jpg"}`;
    try { await putPhoto(path, await doc.arrayBuffer(), doc.type); await db()`update installer_applications set insurance_doc = ${path} where id = ${a!.id}`; } catch { /* ops can ask for it again */ }
  }
  try {
    const { getSetting } = await import("@/lib/settings");
    const { sendEmail } = await import("@/lib/email");
    const to = (await getSetting("trust")).callback_to;
    if (to) await sendEmail(to, `Installer application: ${v("business_name")}`, `${v("contact_name")} (${v("email")}, ${v("phone")}) applied to install for DFRNT Solar.\n\nCovers ${v("postcodes")}. ${team.length} installer(s).\n\nReview and switch them on in Ops → Installers.`);
  } catch { /* the application is saved either way */ }
  redirect("/installers/apply?sent=1");
}
