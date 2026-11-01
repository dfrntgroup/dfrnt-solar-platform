/** Fiskil (CDR energy data). Server only. Keys live in Vercel: FISKIL_CLIENT_ID, FISKIL_CLIENT_SECRET. */
const BASE = "https://api.fiskil.com/v1";
let cached: { token: string; until: number } | null = null;

export const fiskilReady = () => !!(process.env.FISKIL_CLIENT_ID && process.env.FISKIL_CLIENT_SECRET);

export async function fiskilToken(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const r = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: process.env.FISKIL_CLIENT_ID, client_secret: process.env.FISKIL_CLIENT_SECRET }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Fiskil token ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { token: string; expires_in?: number };
  cached = { token: j.token, until: Date.now() + Math.max(60, (j.expires_in ?? 600) - 60) * 1000 };
  return j.token;
}

/** GET one Fiskil path, following page[after] links up to `pages` pages. Returns the merged array under `key`. */
export async function fiskilList<T = Record<string, unknown>>(path: string, params: Record<string, string>, key: string, pages = 20): Promise<{ items: T[]; status: number; error?: string }> {
  const token = await fiskilToken();
  let url: string | null = `${BASE}${path}?${new URLSearchParams(params)}`;
  const items: T[] = [];
  let status = 0;
  for (let i = 0; url && i < pages; i++) {
    const r: Response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store" });
    status = r.status;
    if (!r.ok) return { items, status, error: (await r.text()).slice(0, 300) };
    const j = (await r.json()) as Record<string, unknown> & { links?: { next?: string } };
    items.push(...(((j[key] as T[]) ?? [])));
    const next: string | undefined = j.links?.next;
    url = next && next !== url ? (next.startsWith("http") ? next : `${BASE}${next}`) : null;
  }
  return { items, status };
}
