import { fiskilList, fiskilReady, fiskilToken } from "@/lib/fiskil";

export const dynamic = "force-dynamic";

/** Temporary connection check for the Fiskil sandbox: counts and date ranges only, never names, addresses or account numbers. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("end_user_id");
  if (!id || !/^[A-Za-z0-9]{20,40}$/.test(id)) return new Response("Not found", { status: 404 });
  if (!fiskilReady()) return Response.json({ ready: false, note: "FISKIL_CLIENT_ID / FISKIL_CLIENT_SECRET missing" });
  const out: Record<string, unknown> = { ready: true };
  try { await fiskilToken(); out.token = "ok"; } catch (e) { return Response.json({ ...out, token: String(e) }); }
  const accounts = await fiskilList("/energy/accounts", { end_user_id: id }, "accounts", 3);
  out.accounts = { status: accounts.status, count: accounts.items.length, error: accounts.error };
  const usage = await fiskilList<Record<string, any>>("/energy/usage", { end_user_id: id, "page[size]": "1000" }, "usage", 40);
  const starts = usage.items.map((u) => u.read_start_date as string).filter(Boolean).sort();
  const intervalsPerRead = usage.items.map((u) => (u.interval_read?.interval_reads?.length ?? 0) as number);
  out.usage = {
    status: usage.status, error: usage.error, reads: usage.items.length,
    service_points: new Set(usage.items.map((u) => u.service_point_id)).size,
    from: starts[0], to: starts[starts.length - 1],
    with_intervals: intervalsPerRead.filter((n) => n > 0).length,
    intervals_per_read: [...new Set(intervalsPerRead)].slice(0, 5),
    interval_length_min: [...new Set(usage.items.map((u) => u.read_interval_length).filter(Boolean))].slice(0, 3),
    register_suffixes: [...new Set(usage.items.map((u) => u.register_suffix).filter(Boolean))].slice(0, 8),
    kwh_total: Math.round(usage.items.reduce((s, u) => s + (Number(u.interval_read?.aggregate_value ?? u.basic_read?.value ?? 0) || 0), 0)),
    sample_keys: usage.items[0] ? Object.keys(usage.items[0]) : [],
  };
  const der = await fiskilList<Record<string, any>>("/energy/der", { end_user_id: id }, "der", 3);
  out.der = { status: der.status, error: der.error, count: der.items.length, sample_keys: der.items[0] ? Object.keys(der.items[0]) : [] };
  if (new URL(req.url).searchParams.get("sample") === "1") {
    const strip = (o: any) => JSON.parse(JSON.stringify(o ?? null, (k, v) => (Array.isArray(v) && v.length > 6 ? [...v.slice(0, 6), `…${v.length}`] : v)));
    out.sample = { account: strip(accounts.items[0]), usage: usage.items.slice(0, 1).map(strip), usage_b1: strip(usage.items.find((u) => u.register_suffix === "B1")),
      plans_by_account: accounts.items.map((a: any) => a.plans?.map((p: any) => p.plan_detail?.electricity_contract?.pricing_model)),
      sp_by_suffix: Object.entries(usage.items.reduce((m: any, u) => { const k = `${String(u.service_point_id).slice(0, 6)}:${u.register_suffix}:${u.interval_read?.interval_reads?.length}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})) };
    const sp = await fiskilList("/energy/service-points", { end_user_id: id }, "service_points", 2);
    out.service_points = { status: sp.status, error: sp.error, sample: strip(sp.items[0]) };
  }
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
