// The operation registry: one list of every action an agent (or any API client) can take, with its permission tier.
// R read · A act (reversible, internal) · P propose (a person approves in O22) · H human only (never exposed).
import { z } from "zod";
import { db, type Actor } from "@dfrnt/db";
import { priceSystem, quote, type JobState } from "@dfrnt/engine";
import { pricingData } from "./pricing-data";
import { ConfigInputSchema, QuoteRequestSchema } from "./schema";
import { createQuote } from "./quotes";
import { advance, getQuote, getQuoteById, markPaid, raiseVariation } from "./jobs";
import { todayAEST } from "./api";

export type Tier = "R" | "A" | "P";
interface Op { tier: Tier; description: string; input: z.ZodTypeAny; run: (input: any, actor: Actor, rationale?: string) => Promise<unknown> }

const id = z.object({ id: z.string().uuid() });

export const OPERATIONS: Record<string, Op> = {
  "catalogue.list": {
    tier: "R", description: "List launch systems with live prices for a postcode.",
    input: z.object({ postcode: z.string().regex(/^\d{4}$/).default("4551") }),
    run: async ({ postcode }) => { const data = await pricingData(); return data.catalogue.systems.map((s) => {
      const q = priceSystem(s, { postcode, asOf: todayAEST() }, data);
      return { slug: s.slug, title: s.title, brand: s.brand, kind: s.kind, you_pay: q.stack.amount_payable, before_rebates: q.stack.price_inc_gst, rebates: q.stack.less_stcs, usable_kwh: q.config.usable_kwh, solar_kw: q.config.panel_kw };
    }); },
  },
  "pricing.price_configuration": {
    tier: "R", description: "Price any configuration without saving it (engine dry run).",
    input: ConfigInputSchema,
    run: async (cfg) => {
      const q = quote({ ...cfg, installDate: cfg.installDate ?? todayAEST() }, { ...(await pricingData()), asOf: todayAEST() });
      return { ok: q.ok, summary: q.config.summary, blockers: q.config.blockers, warnings: q.config.warnings, stack: { ...q.stack, lines: undefined }, rebate: q.rebate, window: q.window };
    },
  },
  "quotes.create": {
    tier: "A", description: "Save a priced quote with the 14-day / window-end lock and return its record link token.",
    input: QuoteRequestSchema,
    run: async (req, actor, rationale) => (await createQuote(actor, req, { rationale })).result,
  },
  "quotes.get": {
    tier: "R", description: "Read a quote or job by its record token.",
    input: z.object({ token: z.string().regex(/^[0-9a-f]{36}$/) }),
    run: async ({ token }) => { const q = await getQuote(token); return q && { status: q.status, title: q.title, install_date: q.install_date, amount_payable: (q.snapshot ?? q.result).stack.amount_payable, lock_until: q.lock_until }; },
  },
  "jobs.list": {
    tier: "R", description: "List jobs by state (e.g. pricing_installer, payment_pending, booked).",
    input: z.object({ status: z.string().optional(), limit: z.number().int().max(200).default(50) }),
    run: async ({ status, limit }) => db()`select id, status, title, customer_name, postcode, amount_payable::float8 amount, install_date::text install_date, updated_at
      from quotes where (${status ?? null}::text is null or status::text = ${status ?? null}) order by updated_at desc limit ${limit}`,
  },
  "jobs.get": {
    tier: "R", description: "Everything on one job: site, price snapshot, payments, variations, messages.",
    input: id,
    run: async ({ id }) => {
      const q = await getQuoteById(id);
      if (!q) return null;
      const [payments, variations, messages] = await Promise.all([
        db()`select kind, method, amount::float8, reference, status from payments where quote_id = ${id}`,
        db()`select code, description, sell_inc::float8, status from variations where quote_id = ${id}`,
        db()`select template, status, subject, created_at from messages where quote_id = ${id}`,
      ]);
      return { ...q, input: undefined, result: undefined, payments, variations, messages };
    },
  },
  "jobs.advance": {
    tier: "P", description: "Move a job to its next stage (e.g. booked → gear_ordered). A person approves.",
    input: z.object({ id: z.string().uuid(), to: z.string() }),
    run: async ({ id, to }, actor, rationale) => advance((await getQuoteById(id))!, to as JobState, actor, rationale ?? "Agent proposal"),
  },
  "payments.mark_received": {
    tier: "P", description: "Match a bank transfer to a job and mark it paid. A person approves.",
    input: id,
    run: async ({ id }, actor) => markPaid((await getQuoteById(id))!, actor),
  },
  "variations.raise": {
    tier: "P", description: "Raise a variation for the customer to approve. A person approves sending it.",
    input: z.object({ id: z.string().uuid(), code: z.string(), description: z.string(), installer_cost_ex: z.number().optional() }),
    run: async ({ id, code, description, installer_cost_ex }, actor) => raiseVariation((await getQuoteById(id))!, actor, code, description, installer_cost_ex),
  },
  "messages.list": {
    tier: "R", description: "Outbox messages (held until email/SMS are switched on).",
    input: z.object({ limit: z.number().int().max(200).default(50) }),
    run: async ({ limit }) => db()`select template, recipient, subject, status, created_at from messages order by created_at desc limit ${limit}`,
  },
  "approvals.list": {
    tier: "R", description: "Pending proposals waiting for a person.",
    input: z.object({}),
    run: async () => db()`select id, proposer_id, action, rationale, created_at from approvals where status = 'pending' order by created_at`,
  },
};

/** Run an operation directly (used after a person approves a proposal, or for R/A calls). */
export async function runOperation(name: string, rawInput: unknown, actor: Actor, rationale?: string) {
  const op = OPERATIONS[name];
  if (!op) throw new Error(`Unknown operation ${name}`);
  const input = op.input.parse(rawInput ?? {});
  return op.run(input, actor, rationale);
}
