import { addressDetail, addressReady, searchAddress } from "@/lib/address";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Checkout address autocomplete: ?q= for suggestions, ?pid= for the full address. 503 when not set up (form falls back to typing). */
export async function GET(req: Request) {
  if (!addressReady()) return Response.json({ ready: false }, { status: 503 });
  if (!(await allow("address", 120))) return Response.json({ error: "slow down" }, { status: 429 });
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim(), pid = (u.searchParams.get("pid") ?? "").trim();
  try {
    if (pid) return Response.json(await addressDetail(pid));
    if (q.length < 4) return Response.json([]);
    return Response.json(await searchAddress(`${q} QLD`.slice(0, 120)));
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 502 }); }
}
