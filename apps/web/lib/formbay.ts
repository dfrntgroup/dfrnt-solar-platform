// Formbay (STC agent and evidence system). Server-side only; credentials live in Vercel env vars, never in code.
// Auth: OAuth password grant with the client credential as Basic auth. Tokens are cached until shortly before expiry.
const TOKEN_URL = "https://oauth2.formbay.com.au/token";
export const FORMBAY_API = "https://trading.formbay.com.au";

let cached: { token: string; until: number } | null = null;

export function formbayConfigured() {
  return !!(process.env.FORMBAY_BASIC_TOKEN && process.env.FORMBAY_USERNAME && process.env.FORMBAY_PASSWORD);
}

export class FormbayError extends Error { constructor(msg: string, public status?: number) { super(msg); } }

export async function formbayToken(force = false): Promise<{ token: string; expiresIn: number }> {
  if (!formbayConfigured()) throw new FormbayError("Formbay is not configured");
  if (!force && cached && cached.until > Date.now()) return { token: cached.token, expiresIn: Math.round((cached.until - Date.now()) / 1000) };
  const body = new URLSearchParams({ grant_type: "password", username: process.env.FORMBAY_USERNAME!, password: process.env.FORMBAY_PASSWORD!, scope: "admin" });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { authorization: `Basic ${process.env.FORMBAY_BASIC_TOKEN!.trim()}`, "content-type": "application/x-www-form-urlencoded" },
    body, cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new FormbayError(`Login refused: ${j.error ?? r.status}${j.error_description ? ` (${j.error_description})` : ""}`, r.status);
  const expiresIn = j.expires_in ?? 3600;
  cached = { token: j.access_token, until: Date.now() + (expiresIn - 120) * 1000 };
  return { token: j.access_token, expiresIn };
}

/** Read-only GET against the Formbay trading API. Writes come later, behind ops approval. */
export async function formbayGet(path: string) {
  const { token } = await formbayToken();
  const r = await fetch(`${FORMBAY_API}${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store" });
  const text = await r.text();
  let json: unknown = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, json, text: json ? "" : text.slice(0, 300) };
}
