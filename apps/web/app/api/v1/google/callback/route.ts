import { redirect } from "next/navigation";
import { finishConnect } from "@/lib/google";
import { readState } from "@/lib/secret";

export const dynamic = "force-dynamic";

/** Google sends the installer back here after they allow access. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const st = readState<{ crewId: string; installerId: string; back: string }>(u.searchParams.get("state") ?? "");
  if (!st) redirect("/installer/calendar?error=" + encodeURIComponent("That link expired. Tap Connect again."));
  const sep = st.back.includes("?") ? "&" : "?";
  if (u.searchParams.get("error")) redirect(`${st.back}${sep}error=${encodeURIComponent("Google access wasn't allowed, so nothing changed.")}`);
  let msg = "";
  try { await finishConnect(u.searchParams.get("code") ?? "", st.crewId); }
  catch (e) { msg = (e as Error).message; }
  redirect(msg ? `${st.back}${sep}error=${encodeURIComponent(msg)}` : `${st.back}${sep}ok=connected`);
}
