import { headers } from "next/headers";
import { db } from "@dfrnt/db";

/** Fixed-window limit per client IP. Returns false when over the limit. Fails open if the database is unreachable. */
export async function allow(action: string, limit: number, windowMinutes = 10): Promise<boolean> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || h.get("x-real-ip") || "local";
  const start = new Date(Math.floor(Date.now() / (windowMinutes * 60_000)) * windowMinutes * 60_000);
  try {
    const [r] = await db()`insert into rate_limits (key, window_start, count) values (${`${action}:${ip}`}, ${start}, 1)
      on conflict (key, window_start) do update set count = rate_limits.count + 1 returning count`;
    if (Math.random() < 0.02) await db()`delete from rate_limits where window_start < now() - interval '1 day'`;
    return (r!.count as number) <= limit;
  } catch { return true; }
}
