// Server-side encryption for stored tokens (Google refresh tokens) and signed state for OAuth round trips.
// Key: TOKEN_KEY if set, otherwise derived from the Supabase service key (rotating that key means installers reconnect).
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

function key(): Buffer {
  const base = process.env.TOKEN_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.POSTGRES_URL || "dev-only-key";
  return Buffer.from(hkdfSync("sha256", base, "dfrnt-solar", "token-encryption-v1", 32));
}

export function seal(plain: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function unseal(box: string): string {
  const [v, iv, tag, enc] = box.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("Bad sealed value");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

/** Signed, expiring state (e.g. which crew is connecting). */
export function signState(data: Record<string, unknown>, minutes = 20): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + minutes * 60_000 })).toString("base64url");
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}
export function readState<T>(s: string): T | null {
  const [body, mac] = s.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", key()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const v = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
  return v.exp > Date.now() ? v : null;
}
