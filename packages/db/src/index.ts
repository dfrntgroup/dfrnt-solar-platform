// Server-side database access. Uses the pooled connection Vercel provides (Supabase pooler).
import postgres from "postgres";

let client: postgres.Sql | null = null;

export function db(): postgres.Sql {
  if (client) return client;
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set");
  // Supabase transaction pooler: no prepared statements.
  client = postgres(url, { ssl: process.env.DB_SSL === "disable" ? false : "require", max: 5, prepare: false, idle_timeout: 20 });
  return client;
}

export type ActorType = "staff" | "agent" | "customer" | "installer" | "system";
export interface Actor { type: ActorType; id: string }

export interface WriteContext {
  actor: Actor;
  action: string;
  rationale?: string;
  idempotencyKey?: string;
  dryRun?: boolean;
}

/**
 * Every write goes through here: one transaction that does the work, records the audit row and emits the event.
 * A repeated idempotency key from the same actor returns the first result instead of writing again.
 */
export async function write<T extends Record<string, unknown>>(
  ctx: WriteContext,
  input: unknown,
  work: (tx: postgres.TransactionSql) => Promise<{ entity: string; entityId: string; event: string; result: T; payload?: Record<string, unknown> }>,
): Promise<{ replayed: boolean; dryRun: boolean; result: T }> {
  const sql = db();
  if (ctx.idempotencyKey) {
    const prior = await sql`select result from audit_log
      where actor_type = ${ctx.actor.type} and actor_id = ${ctx.actor.id} and idempotency_key = ${ctx.idempotencyKey} and not dry_run`;
    if (prior[0]) return { replayed: true, dryRun: false, result: prior[0].result as T };
  }
  let out: T | undefined;
  try {
    await sql.begin(async (tx) => {
      const w = await work(tx);
      out = w.result;
      const [a] = await tx`insert into audit_log (actor_type, actor_id, action, entity, entity_id, rationale, input, result, dry_run, idempotency_key)
        values (${ctx.actor.type}, ${ctx.actor.id}, ${ctx.action}, ${w.entity}, ${w.entityId}, ${ctx.rationale ?? null},
                ${tx.json(input as postgres.JSONValue)}, ${tx.json(w.result as postgres.JSONValue)}, ${!!ctx.dryRun},
                ${ctx.dryRun ? null : ctx.idempotencyKey ?? null})
        returning id`;
      await tx`insert into events (type, entity, entity_id, payload, audit_id)
        values (${w.event}, ${w.entity}, ${w.entityId}, ${tx.json((w.payload ?? {}) as postgres.JSONValue)}, ${a!.id})`;
      if (ctx.dryRun) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
  }
  return { replayed: false, dryRun: !!ctx.dryRun, result: out! };
}

class DryRun extends Error {}
