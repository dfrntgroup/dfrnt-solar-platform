import { write } from "@dfrnt/db";
import { quote, rebateWindow } from "@dfrnt/engine";
import { QuoteRequestSchema } from "@/lib/schema";
import { json, problem, resolveActor, todayAEST, writeOptions } from "@/lib/api";

export const dynamic = "force-dynamic";

/** quotes.create — tier A. Prices a configuration with the engine and saves it with a 14-day / window-end lock. */
export async function POST(req: Request) {
  const actor = await resolveActor(req);
  if (actor instanceof Response) return actor;
  const parsed = QuoteRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, "Invalid quote request", parsed.error.flatten());
  const { config, discounts, customerEmail } = parsed.data;
  const asOf = todayAEST();
  const installDate = config.installDate ?? rebateWindow(asOf).lock_until;
  const q = quote({ ...config, installDate } as Parameters<typeof quote>[0], { asOf, discounts });
  const opts = writeOptions(req);
  const out = await write({ actor, action: "quotes.create", ...opts }, parsed.data, async (tx) => {
    const [row] = await tx`insert into quotes (input, result, versions, amount_payable, price_inc_gst, stcs, lock_until,
        checkout_allowed, customer_email, postcode, created_by_type, created_by_id)
      values (${tx.json({ ...config, installDate } as never)}, ${tx.json(q as never)}, ${tx.json(q.versions)}, ${q.stack.amount_payable},
        ${q.stack.price_inc_gst}, ${q.stack.stcs}, ${q.window.lock_until}, ${q.checkout_allowed}, ${customerEmail ?? null},
        ${config.postcode}, ${actor.type}, ${actor.id})
      returning id, token`;
    const result = {
      id: row!.id as string, token: row!.token as string, ok: q.ok, checkout_allowed: q.checkout_allowed,
      summary: q.config.summary, amount_payable: q.stack.amount_payable, price_inc_gst: q.stack.price_inc_gst,
      gst: q.stack.gst, less_stcs: q.stack.less_stcs, lock_until: q.window.lock_until,
      blockers: q.config.blockers, warnings: q.config.warnings, price_pending: q.stack.price_pending, versions: q.versions,
    };
    return { entity: "quote", entityId: result.id, event: "quote.created", result, payload: { amount_payable: result.amount_payable, postcode: config.postcode } };
  });
  return json({ ...out.result, replayed: out.replayed, dry_run: out.dryRun }, out.replayed ? 200 : 201);
}
