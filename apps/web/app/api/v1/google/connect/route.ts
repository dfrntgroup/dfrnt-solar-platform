import { redirect } from "next/navigation";
import { db } from "@dfrnt/db";
import { requireInstaller } from "@/lib/auth";
import { connectUrl, googleReady } from "@/lib/google";

export const dynamic = "force-dynamic";

/** Installer taps "Connect Google Calendar" for a crew → Google's consent screen. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const as = u.searchParams.get("as") ?? undefined, crew = u.searchParams.get("crew") ?? "";
  const me = await requireInstaller(as);
  const back = `/installer/calendar${me.viaStaff ? `?as=${me.id}` : ""}`;
  if (!googleReady()) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent("Google connection isn't switched on yet. We'll email you when it is.")}`);
  const [c] = await db()`select id from installer_crews where id = ${crew} and installer_id = ${me.id}`;
  if (!c) redirect(back);
  redirect(connectUrl(crew, me.id, back));
}
