import { timingSafeEqual } from "node:crypto";

/** Constant-time check of the cron bearer token. */
export function cronAuthorised(req: Request) {
  const want = process.env.CRON_SECRET;
  if (!want) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
