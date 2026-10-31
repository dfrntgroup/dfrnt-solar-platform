"use server";
import { redirect } from "next/navigation";
import { db } from "@dfrnt/db";
import { allow } from "@/lib/ratelimit";

export async function applyInstaller(f: FormData) {
  const v = (k: string) => String(f.get(k) ?? "").trim().slice(0, 1000);
  if (!(await allow("apply", 5))) redirect("/installers/apply?sent=1");
  if (!v("business_name") || !v("contact_name") || !/^\S+@\S+\.\S+$/.test(v("email"))) redirect("/installers/apply");
  await db()`insert into installer_applications (business_name, abn, contact_name, email, phone, postcodes, licence_no, notes)
    values (${v("business_name")}, ${v("abn") || null}, ${v("contact_name")}, ${v("email").toLowerCase()}, ${v("phone") || null}, ${v("postcodes") || null}, ${v("licence_no") || null}, ${v("notes") || null})`;
  redirect("/installers/apply?sent=1");
}
