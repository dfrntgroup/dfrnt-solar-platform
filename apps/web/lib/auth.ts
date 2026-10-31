// Sign-in for staff and installers: Supabase Auth email link. Who you are is decided by our own tables (staff / installers),
// never by anything the browser sends. Local development can use a dev sign-in that cannot run on Vercel.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { db, type Actor } from "@dfrnt/db";

export const devAuth = () => process.env.DEV_AUTH === "1" && !process.env.VERCEL;

export async function supabase() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => { try { all.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only in server components */ } },
    },
  });
}

export async function currentEmail(): Promise<string | null> {
  if (devAuth()) return (await cookies()).get("dev_email")?.value ?? null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const { data } = await (await supabase()).auth.getUser();
  return data.user?.email?.toLowerCase() ?? null;
}

export interface Staff { id: string; name: string; email: string; roles: string[] }
export interface Installer { id: string; business_name: string; email: string }

export async function currentStaff(): Promise<Staff | null> {
  const email = await currentEmail();
  if (!email) return null;
  const [s] = await db()`select id, name, email, roles::text[] as roles from staff where lower(email) = ${email} and active`;
  return (s as unknown as Staff) ?? null;
}

/** If the user has an authenticator enrolled, the session must have passed it (aal2). */
async function requireSecondFactor(next: string) {
  if (devAuth() || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  const { data } = await (await supabase()).auth.mfa.getAuthenticatorAssuranceLevel();
  if (data && data.nextLevel === "aal2" && data.currentLevel !== "aal2") redirect(`/login/mfa?next=${encodeURIComponent(next)}`);
}

export async function requireStaff(): Promise<Staff & { actor: Actor }> {
  const s = await currentStaff();
  if (!s) redirect("/login?next=/ops");
  await requireSecondFactor("/ops");
  return { ...s, actor: { type: "staff", id: s.id } };
}

/** Installer portal: the signed-in installer, or (for staff) any installer chosen with ?as= for testing and support. */
export async function requireInstaller(as?: string): Promise<Installer & { actor: Actor; viaStaff: boolean }> {
  const email = await currentEmail();
  if (!email) redirect("/login?next=/installer");
  const [i] = await db()`select id, business_name, email from installers where lower(email) = ${email}`;
  if (i) return { ...(i as unknown as Installer), actor: { type: "installer", id: i.id as string }, viaStaff: false };
  const s = await currentStaff();
  if (!s) redirect("/login?next=/installer");
  const [pick] = as ? await db()`select id, business_name, email from installers where id = ${as}`
    : await db()`select id, business_name, email from installers order by is_test desc, created_at limit 1`;
  if (!pick) redirect("/ops");
  return { ...(pick as unknown as Installer), actor: { type: "staff", id: s.id }, viaStaff: true };
}
