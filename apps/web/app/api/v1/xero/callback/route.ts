import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { readState } from "@/lib/secret";
import { xeroFinish } from "@/lib/xero";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const me = await requireStaff();
  const u = new URL(req.url);
  if (!readState(u.searchParams.get("state") ?? "")) redirect("/ops/xero?error=" + encodeURIComponent("That link expired. Connect again."));
  if (u.searchParams.get("error")) redirect("/ops/xero?error=" + encodeURIComponent("Xero access wasn't allowed"));
  let msg = "";
  try { await xeroFinish(u.searchParams.get("code") ?? "", me.name); } catch (e) { msg = (e as Error).message; }
  redirect(msg ? `/ops/xero?error=${encodeURIComponent(msg)}` : "/ops/xero?ok=connected");
}
