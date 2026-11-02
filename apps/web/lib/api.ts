import { createHash } from "node:crypto";
import { db, type Actor } from "@dfrnt/db";

/** Today's date in Brisbane (yyyy-mm-dd). */
export const todayAEST = () => new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 10);
/** The Brisbane calendar date of a timestamp (never slice a UTC ISO string for a date). */
export const dateAEST = (d: Date) => new Date(d.getTime() + 10 * 3600_000).toISOString().slice(0, 10);

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });

export const problem = (status: number, title: string, detail?: unknown) => json({ type: "about:blank", title, status, detail }, status);

/** Bearer key → agent or staff actor. No key → anonymous customer (public, read/quote only). */
export async function resolveActor(req: Request): Promise<Actor | Response> {
  const auth = req.headers.get("authorization");
  if (!auth) return { type: "customer", id: "anonymous" };
  const key = auth.replace(/^Bearer\s+/i, "");
  const hash = createHash("sha256").update(key).digest("hex");
  const [row] = await db()`select k.agent_id, k.staff_id, a.enabled from api_keys k left join agents a on a.id = k.agent_id
    where k.key_hash = ${hash} and k.revoked_at is null`;
  if (!row) return problem(401, "Unknown or revoked API key");
  if (row.agent_id) {
    if (!row.enabled) return problem(403, "Agent is switched off");
    return { type: "agent", id: row.agent_id as string };
  }
  return { type: "staff", id: row.staff_id as string };
}

export const writeOptions = (req: Request) => ({
  idempotencyKey: req.headers.get("idempotency-key") ?? undefined,
  dryRun: new URL(req.url).searchParams.get("dry_run") === "true",
  rationale: req.headers.get("x-rationale") ?? undefined,
});
