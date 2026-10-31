"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@dfrnt/db";
import { devAuth, supabase } from "@/lib/auth";
import { allow } from "@/lib/ratelimit";

const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") ? n : "/ops");

export async function sendLink(f: FormData) {
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(f.get("next") ?? "/ops"));
  if (!(await allow("login", 5))) redirect("/login?sent=1");
  // Only people we know get a link; the reply is the same either way so emails can't be probed.
  const [known] = await db()`select 1 from staff where lower(email) = ${email} and active union select 1 from installers where lower(email) = ${email}`;
  if (known) {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    const { error } = await (await supabase()).auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true } });
    if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/login?sent=1");
}

export async function devSignIn(f: FormData) {
  if (!devAuth()) redirect("/login");
  (await cookies()).set("dev_email", String(f.get("email") ?? "").toLowerCase(), { path: "/", httpOnly: true, sameSite: "lax" });
  redirect(safeNext(String(f.get("next") ?? "/ops")));
}
