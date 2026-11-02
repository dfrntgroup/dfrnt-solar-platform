// One place failures go (review fix, 3 Nov 2026). Vercel keeps console output as runtime logs, and the
// `failures` table makes them visible in Ops → Today without a log drain. Never throws.
import { db } from "@dfrnt/db";

export async function report(where: string, e: unknown, ctx: Record<string, unknown> = {}) {
  const err = e instanceof Error ? e : new Error(String(e));
  const line = { at: new Date().toISOString(), where, message: err.message, stack: err.stack?.split("\n").slice(0, 4).join(" | "), ...ctx };
  console.error(JSON.stringify(line));
  try { await db()`insert into failures (where_, message, context) values (${where}, ${err.message.slice(0, 500)}, ${db().json(ctx as never)})`; } catch { /* the log line above is the fallback */ }
}

/** Known, user-safe messages pass through; anything that smells like an internal error is replaced and reported. */
export async function safeMessage(e: unknown, where: string, ctx: Record<string, unknown> = {}): Promise<string> {
  const m = e instanceof Error ? e.message : String(e);
  const internal = /violates|constraint|relation |syntax error|column |null value|ECONN|ETIMEDOUT|fetch failed|Stripe|undefined|is not a function|Cannot read|JSON|invalid input/i.test(m) || m.length > 240;
  if (!internal) return m;
  await report(where, e, ctx);
  return "Something went wrong on our side. Nothing was lost; try again in a minute, or call us on 1300 133 768.";
}
