import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { xeroConnectUrl, xeroReady } from "@/lib/xero";
export const dynamic = "force-dynamic";
export async function GET() {
  const me = await requireStaff();
  if (!me.roles.includes("owner")) redirect("/ops/xero?error=Owner+only");
  if (!xeroReady()) redirect("/ops/xero?error=" + encodeURIComponent("Add XERO_CLIENT_ID and XERO_CLIENT_SECRET in Vercel first"));
  redirect(xeroConnectUrl());
}
