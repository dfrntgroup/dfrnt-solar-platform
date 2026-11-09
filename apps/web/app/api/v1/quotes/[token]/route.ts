import { db } from "@dfrnt/db";
import { nextMoves, statusLabel, type JobState, type Quote } from "@dfrnt/engine";
import { customerView } from "@/lib/customer-view";
import { problem, resolveActor } from "@/lib/api";

export const dynamic = "force-dynamic";


/** quotes.get — tier R. The token is the customer's record link: anyone holding it sees the customer view.
 *  A staff or agent API key also gets the internal price stack (costs, margin, installer pay). */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{36}$/.test(token)) return problem(404, "Quote not found");
  const actor = await resolveActor(req);
  if (actor instanceof Response) return actor;
  const [row] = await db()`select token, status, rebook, install_date::text install_date, design_fee_status, lock_until::text lock_until, created_at, input,
      coalesce(snapshot, result) as price from quotes where token = ${token}`;
  if (!row) return problem(404, "Quote not found");
  const st = row.status as JobState;
  const price = row.price as Quote;
  const body = {
    token: row.token, status: st, created_at: row.created_at, lock_until: row.lock_until, install_date: row.install_date, input: row.input,
    status_label: statusLabel({ status: st, rebook: row.rebook as boolean, install_date: row.install_date as string | null, design_fee_status: row.design_fee_status as string | null, lock_until: row.lock_until as string }),
    next: nextMoves(st).map((m) => ({ to: m.to, label: m.label, via: m.via, tier: m.tier })),
    // One lock date: the job's own (the snapshot's window can be a day out after a re-lock).
    price: (() => { const v = customerView(price); return { ...v, window: { ...v.window, lock_until: row.lock_until as string } }; })(),
    ...(actor.type === "staff" || actor.type === "agent" ? { internal: { stack: price.stack, config: price.config, rebate: price.rebate } } : {}),
  };
  return new Response(JSON.stringify(body, null, 2), { status: 200, headers: { "content-type": "application/json", "cache-control": "private, no-store" } });
}
