import { db } from "@dfrnt/db";
import { allow } from "@/lib/ratelimit";

const ALLOWED = new Set(["page_view", "configure", "secure_click", "compare", "estimate", "save_quote", "contact", "build_step", "build_secure"]);

export async function POST(req: Request) {
  if (!(await allow("events", 120, 1))) return new Response(null, { status: 204 });
  const b = await req.json().catch(() => null) as { name?: string; path?: string; props?: Record<string, unknown>; session?: string } | null;
  if (!b?.name || !ALLOWED.has(b.name)) return new Response(null, { status: 204 });
  await db()`insert into analytics_events (name, path, props, session) values (${b.name}, ${String(b.path ?? "").slice(0, 200)}, ${db().json((b.props ?? {}) as never)}, ${String(b.session ?? "").slice(0, 40)})`;
  return new Response(null, { status: 204 });
}
