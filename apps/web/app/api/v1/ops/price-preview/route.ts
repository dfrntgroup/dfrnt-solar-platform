import { requireStaff } from "@/lib/auth";
import { getQuoteById, reprice } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** Staff only: the exact new price for a job with the ticked extras (what Confirm price will save). */
export async function POST(req: Request) {
  await requireStaff();
  const b = (await req.json().catch(() => null)) as { id?: string; extras?: { code: string; qty?: number }[] } | null;
  if (!b?.id) return Response.json({ error: "id" }, { status: 400 });
  const q = await getQuoteById(b.id);
  if (!q) return Response.json({ error: "not found" }, { status: 404 });
  const extraLabour = (b.extras ?? []).slice(0, 20).map((e) => ({ code: String(e.code), qty: Math.min(500, Math.max(1, Math.round(Number(e.qty) || 1))) }));
  const [base, withExtras] = await Promise.all([reprice(q), reprice(q, { extraLabour })]);
  const pay = (p: typeof base) => p.stack.installer_pay_ex_gst;
  return Response.json({ base: base.stack.amount_payable, total: withExtras.stack.amount_payable, installer_extra: Math.round((pay(withExtras) - pay(base)) * 100) / 100 }, { headers: { "cache-control": "no-store" } });
}
