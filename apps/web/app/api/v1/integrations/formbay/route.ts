import { formbayConfigured, formbayGet, formbayToken } from "@/lib/formbay";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Connection check: can we log in, and does a read-only job list answer? Returns no customer data. */
export async function GET() {
  if (!(await allow("formbay-check", 10))) return Response.json({ error: "Too many checks; try again shortly" }, { status: 429 });
  if (!formbayConfigured()) return Response.json({ configured: false });
  const out: Record<string, unknown> = { configured: true };
  try {
    const t = await formbayToken(true);
    out.login = "ok"; out.token_expires_in_s = t.expiresIn;
  } catch (e) { out.login = "failed"; out.error = (e as Error).message; return Response.json(out); }
  for (const path of ["/jobs/get_jobs?ftype=bstc", "/get_jobs?ftype=bstc"]) {
    try {
      const r = await formbayGet(path);
      const list = Array.isArray(r.json) ? r.json : Array.isArray((r.json as { data?: unknown[] })?.data) ? (r.json as { data: unknown[] }).data : null;
      out[path] = { status: r.status, jobs_visible: list ? list.length : null };
      if (r.status === 200) break;
    } catch (e) { out[path] = { error: (e as Error).message }; }
  }
  return Response.json(out);
}
