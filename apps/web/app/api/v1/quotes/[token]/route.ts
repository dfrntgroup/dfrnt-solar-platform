import { db } from "@dfrnt/db";
import { json, problem } from "@/lib/api";

export const dynamic = "force-dynamic";

/** quotes.get — tier R. The token is the customer's record link. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{36}$/.test(token)) return problem(404, "Quote not found");
  const [row] = await db()`select token, status, created_at, lock_until, amount_payable::float8 as amount_payable, price_inc_gst::float8 as price_inc_gst, stcs, checkout_allowed, input, result, versions
    from quotes where token = ${token}`;
  if (!row) return problem(404, "Quote not found");
  return json(row);
}
