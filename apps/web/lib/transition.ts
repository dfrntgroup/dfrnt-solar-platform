// The one door (S2, 9 Nov 2026). Every change to quotes.status goes through transition(): it locks the row, re-reads the state,
// asserts the edge against the engine's table, checks who is taking it, refuses an edge that belongs to another action unless that
// action is the caller, runs the edge's inline hook in the same transaction, writes status + stamps + audit + event (with from/to),
// and returns what can happen next. A write that finds the row already moved is reported, not re-recorded.
import { db, write, type Actor } from "@dfrnt/db";
import { isInlineEffect, isManualEdge, JOB_LABELS, nextMoves, ownerOf, QUOTE, type JobState, type Tier } from "@dfrnt/engine";

/** The transaction handle `write()` hands its work callback. */
export type Tx = Parameters<Parameters<typeof write>[2]>[0];

export interface TransitionOpts {
  /** Audit action name, e.g. "quotes.sign". */
  action: string;
  /** The owning effect the caller is performing (e.g. "freezePrice"). Required for any edge that has a route effect. */
  via?: string;
  /** Extra columns to set with the status. */
  set?: Record<string, unknown>;
  rationale?: string;
  /** Extra event payload (from/to are always added). */
  payload?: Record<string, unknown>;
  /** Work to run inside the same transaction before the status write (inserts that must land with the move). */
  work?: (tx: Tx) => Promise<Record<string, unknown> | void>;
  /** When the row has already left `from`, return { changed: false } instead of throwing (timers, webhooks). */
  tolerate?: boolean;
  /** Highest tier the actor holds (agents: their key's tier). Staff, customers, installers and the system are H. */
  maxTier?: Tier;
}

export interface TransitionResult { changed: boolean; from: JobState; to: JobState; result: Record<string, unknown>; next: ReturnType<typeof nextMoves> }

const RANK: Record<Tier, number> = { R: 0, A: 1, P: 2, H: 3 };
class Moved extends Error { constructor(public now: string) { super("moved"); } }

/** Inline hooks: work the edge always needs, run inside the transition. Registered by jobs.ts so this file stays free of its imports. */
type Hook = (tx: Tx, q: QuoteLike, actor: Actor) => Promise<void | (() => Promise<void>)>;
const hooks: Record<string, Hook> = {};
/** A hook does its database work on `tx` and may return a function to run after the commit (messages, calls out). */
export function registerHook(effect: string, fn: Hook) { hooks[effect] = fn; }

export interface QuoteLike { id: string; token: string; status: JobState }

export async function transition(q: QuoteLike, to: JobState, actor: Actor, o: TransitionOpts): Promise<TransitionResult> {
  const from = q.status;
  QUOTE.assert(from, to);
  const owner = ownerOf(from, to);
  const vias = QUOTE.effectsOf(from, to).filter((e) => !isInlineEffect(e));
  if (owner && !(o.via && vias.includes(o.via))) throw new Error(`${JOB_LABELS[from]} → ${JOB_LABELS[to]} is done by "${owner}", not by hand.`);
  const tier = QUOTE.tierOf(from, to);
  if (actor.type === "agent") {
    const max = o.maxTier ?? "P";
    if (tier === "H") throw new Error(`${from} → ${to} is a human-only move`);
    if (RANK[tier] > RANK[max]) throw new Error(`${from} → ${to} needs tier ${tier}; this agent holds ${max}`);
  }
  for (const e of QUOTE.effectsOf(from, to)) if (isInlineEffect(e) && !hooks[e]) throw new Error(`No hook registered for ${e}`);
  const after: (() => Promise<void>)[] = [];
  try {
    const r = await write({ actor, action: o.action, rationale: o.rationale }, { token: q.token, from, to, ...(o.set ?? {}) }, async (tx) => {
      // "no key update": other connections may still insert rows that reference this quote (messages, payments) while we hold it.
      const [cur] = await tx`select status from quotes where id = ${q.id} for no key update`;
      if (!cur) throw new Error("Quote not found");
      if (cur.status !== from) throw new Moved(cur.status as string);
      const extra = (await o.work?.(tx)) ?? {};
      const fields = { ...(o.set ?? {}), status: to, updated_at: new Date() };
      await tx`update quotes set ${tx(fields as unknown as Record<string, never>)} where id = ${q.id}`;
      for (const e of QUOTE.effectsOf(from, to)) if (isInlineEffect(e)) { const later = await hooks[e]!(tx, { ...q, status: to }, actor); if (later) after.push(later); }
      return { entity: "quote", entityId: q.id, event: `quote.${to}`, result: { from, to, ...extra }, payload: { from, to, via: o.via ?? null, ...(o.payload ?? {}) } };
    });
    for (const fn of after) await fn();
    return { changed: true, from, to, result: r.result, next: nextMoves(to) };
  } catch (e) {
    if (e instanceof Moved) {
      if (o.tolerate) return { changed: false, from, to, result: { now: e.now }, next: nextMoves(e.now as JobState) };
      throw new Error(`Quote changed while you were working (now ${JOB_LABELS[e.now as JobState] ?? e.now}); reload and try again`);
    }
    throw e;
  }
}

/** "Change stage": only plain and inline-hook edges. Anything owned by an action says which one to use. */
export async function manualTransition(q: QuoteLike, to: JobState, actor: Actor, rationale: string, maxTier?: Tier) {
  if (!QUOTE.is(to)) throw new Error(`Unknown stage ${String(to)}`);
  QUOTE.assert(q.status, to);
  if (!isManualEdge(q.status, to)) {
    const owner = ownerOf(q.status, to);
    throw new Error(`${JOB_LABELS[q.status]} → ${JOB_LABELS[to]} moves money, a price, a day or a cancellation. Use ${OWNER_HINT[owner ?? ""] ?? `the "${owner}" action`}, not Change stage.`);
  }
  return transition(q, to, actor, { action: "jobs.advance", rationale, maxTier });
}

export const OWNER_HINT: Record<string, string> = {
  freezePrice: "Price (installer or Ops)", cancel: "Cancel", markPaid: "Mark paid", bookDay: "the booking step", releaseDay: "Release day",
  createPayment: "the customer's payment choice", changePayment: "Change how I pay", sign: "the customer's signature", secure: "Secure this price",
  submitSite: "the customer's checkout", raiseVariation: "Raise a variation", decideVariation: "the customer's variation decision",
  stripeStatus: "Stripe (Reconcile on Ops → Payments)", assignInstaller: "Tech review → assign an installer",
};

/** Convenience for timers and webhooks that only have an id: load the row and move it, tolerating a row that already moved. */
export async function transitionById(id: string, from: JobState, to: JobState, actor: Actor, o: Omit<TransitionOpts, "tolerate">) {
  const [row] = await db()`select id, token, status from quotes where id = ${id}`;
  if (!row) return { changed: false } as const;
  if (row.status !== from) return { changed: false, now: row.status as JobState } as const;
  return transition(row as unknown as QuoteLike, to, actor, { ...o, tolerate: true });
}
