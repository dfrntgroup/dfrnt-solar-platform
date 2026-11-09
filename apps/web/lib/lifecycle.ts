// The door for every lifecycle that isn't the quote (S5, 9 Nov 2026): one guarded, audited status write for any table with a
// `status` column and a declared machine. Asserts the edge, writes only when the row is still in `from`, records audit + event
// with from/to. Call sites that must change other columns in the same move pass them in `set`; work that must land with the
// move goes in `work`.
import { db, write, type Actor } from "@dfrnt/db";
import { LIFECYCLES, type Machine } from "@dfrnt/engine";
import type { Tx } from "./transition";

export interface MoveOpts {
  action?: string;
  rationale?: string;
  set?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  work?: (tx: Tx) => Promise<Record<string, unknown> | void>;
  /** Return { changed: false } when the row has already left `from` (webhooks, timers) instead of throwing. */
  tolerate?: boolean;
  /** Skip the write when the row is already in `to` (idempotent callers). */
  idempotent?: boolean;
}

export interface MoveResult { changed: boolean; from: string | null; to: string; result: Record<string, unknown> }

/** Primary-key column per table; everything else is keyed by `id`. */
const KEY: Record<string, string> = { credits: "code" };
const keyOf = (table: string) => KEY[table] ?? "id";

class Moved extends Error { constructor(public now: string | null) { super("moved"); } }

/** Move one row of `table` to `to`. The table must be in LIFECYCLES. `from` may be given to assert the row is there; otherwise it is read. */
export async function moveRow(table: string, id: string, to: string, actor: Actor, o: MoveOpts = {}, from?: string): Promise<MoveResult> {
  const mch = LIFECYCLES[table] as Machine<string> | undefined;
  if (!mch) throw new Error(`No lifecycle declared for ${table}`);
  if (!mch.is(to)) throw new Error(`${table}: unknown state ${to}`);
  const after: (() => Promise<void>)[] = [];
  try {
    const r = await write({ actor, action: o.action ?? `${table}.${to}`, rationale: o.rationale }, { id, to, ...(o.set ?? {}) }, async (tx) => {
      const [cur] = await tx.unsafe(`select status from ${table} where ${keyOf(table)} = $1 for no key update`, [id]);
      if (!cur) throw new Error(`${table} row not found`);
      const now = cur.status as string;
      if (o.idempotent && now === to) throw new Moved(now);
      if (from != null && now !== from) throw new Moved(now);
      mch.assert(now, to);
      const extra = (await o.work?.(tx)) ?? {};
      const cols: Record<string, unknown> = { ...(o.set ?? {}), status: to };
      const keys = Object.keys(cols);
      await tx.unsafe(`update ${table} set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where ${keyOf(table)} = $1`, [id, ...keys.map((k) => cols[k] as never)]);
      return { entity: table.replace(/s$/, ""), entityId: id, event: `${table.replace(/s$/, "")}.${to}`, result: { from: now, to, ...extra }, payload: { from: now, to, ...(o.payload ?? {}) } };
    });
    for (const fn of after) await fn();
    return { changed: true, from: (r.result as { from: string }).from, to, result: r.result as Record<string, unknown> };
  } catch (e) {
    if (e instanceof Moved) {
      if (o.tolerate || o.idempotent) return { changed: false, from: e.now, to, result: {} };
      throw new Error(`${table} changed while you were working (now ${e.now}); reload and try again`);
    }
    throw e;
  }
}

/** Move every row of `table` that matches `where` (a SQL fragment with $1.. params) from `from` to `to`; each row is its own guarded write. */
export async function moveRows(table: string, from: string, to: string, actor: Actor, where: string, params: unknown[], o: MoveOpts = {}) {
  if (!LIFECYCLES[table]?.is(from)) throw new Error(`${table}: unknown state ${from}`);
  if (!LIFECYCLES[table]?.is(from)) throw new Error(`${table}: unknown state ${from}`);
  const rows = await db().unsafe(`select ${keyOf(table)} as k from ${table} where status = '${from}' and (${where})`, params as never);
  let n = 0;
  for (const r of rows) if ((await moveRow(table, String(r.k), to, actor, { ...o, tolerate: true }, from)).changed) n++;
  return n;
}
