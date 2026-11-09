import { db } from "@dfrnt/db";
import { nextMoves, statusLabel, type JobState } from "@dfrnt/engine";
import { json, problem } from "@/lib/api";

export const dynamic = "force-dynamic";

/** quotes.get — tier R. The token is the customer's record link. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{36}$/.test(token)) return problem(404, "Quote not found");
  const [row] = await db()`select token, status, rebook, install_date::text install_date, design_fee_status, lock_until::text lock_until, created_at, amount_payable::float8 as amount_payable, price_inc_gst::float8 as price_inc_gst, stcs, checkout_allowed, input, result, versions
    from quotes where token = ${token}`;
  if (!row) return problem(404, "Quote not found");
  const st = row.status as JobState;
  // The state, its label, and what can happen next (with the action that owns each move and who may take it).
  return json({ ...row, status_label: statusLabel({ status: st, rebook: row.rebook as boolean, install_date: row.install_date as string | null, design_fee_status: row.design_fee_status as string | null, lock_until: row.lock_until as string }),
    next: nextMoves(st).map((m) => ({ to: m.to, label: m.label, via: m.via, tier: m.tier })) });
}
