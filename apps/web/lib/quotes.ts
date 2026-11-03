import { write, type Actor } from "@dfrnt/db";
import { quote, rebateWindow, installDateAllowed } from "@dfrnt/engine";
import type { QuoteRequest } from "./schema";
import { todayAEST } from "./api";
import { pricingData } from "./pricing-data";

/** quotes.create — shared by the API route and the site's "Secure this price" action. */
export async function createQuote(actor: Actor, req: QuoteRequest, opts: { idempotencyKey?: string; dryRun?: boolean; rationale?: string; status?: "saved" | "secured" } = {}) {
  const { config, discounts, customerEmail, title, systemSlug } = req;
  const asOf = todayAEST();
  const data = await pricingData();
  // The rebate date is ours to set, never the caller's: it is the end of the price lock. Staff may pass one for
  // testing; anyone else (the public API, the site) gets today's window. (Review fix, 3 Nov 2026.)
  const { rebateFromFor } = await import("./rebate-from");
  const window = rebateWindow(asOf, data.rebates, await rebateFromFor(config.postcode));
  const installDate = actor.type === "staff" && config.installDate && installDateAllowed(config.installDate, asOf, data.rebates) ? config.installDate : window.rebate_date;
  const q = quote({ ...config, installDate } as Parameters<typeof quote>[0], { ...data, asOf, discounts });
  const { status: _s, ...wopts } = opts;
  return write({ actor, action: "quotes.create", ...wopts }, req, async (tx) => {
    const [row] = await tx`insert into quotes (input, result, versions, amount_payable, price_inc_gst, stcs, lock_until,
        checkout_allowed, customer_email, postcode, created_by_type, created_by_id, title, system_slug, status)
      values (${tx.json({ ...config, installDate } as never)}, ${tx.json(q as never)}, ${tx.json(q.versions)}, ${q.stack.amount_payable},
        ${q.stack.price_inc_gst}, ${q.stack.stcs}, ${q.window.lock_until}, ${q.checkout_allowed}, ${customerEmail ?? null},
        ${config.postcode}, ${actor.type}, ${actor.id}, ${title ?? q.config.summary}, ${systemSlug ?? null}, ${opts.status ?? "saved"})
      returning id, token`;
    const result = {
      id: row!.id as string, token: row!.token as string, ok: q.ok, checkout_allowed: q.checkout_allowed,
      summary: q.config.summary, amount_payable: q.stack.amount_payable, price_inc_gst: q.stack.price_inc_gst,
      gst: q.stack.gst, less_stcs: q.stack.less_stcs, lock_until: q.window.lock_until,
      blockers: q.config.blockers, warnings: q.config.warnings, price_pending: q.stack.price_pending, versions: q.versions,
    };
    return { entity: "quote", entityId: result.id, event: "quote.created", result, payload: { amount_payable: result.amount_payable, postcode: config.postcode } };
  });
}
