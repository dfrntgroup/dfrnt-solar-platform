import { currentStaff } from "@/lib/auth";
import { formbayGetAccept } from "@/lib/formbay-job";

export const dynamic = "force-dynamic";

/** Staff-only, read-only lookups against Formbay's reference lists and jobs (CEC model strings, team ids, a job's status). */
const LISTS: Record<string, (p: URLSearchParams) => string> = {
  inverter_brands: () => "/client_api/pv_inverter_brands",
  inverter_models: (p) => `/client_api/pv_inverter_models?brand=${encodeURIComponent(p.get("brand") ?? "")}`,
  battery_brands: () => "/client_api/pv_inverter_battery_brands",
  battery_models: (p) => `/client_api/pv_inverter_battery_models?bstc=1&v=2&b_brand=${encodeURIComponent(p.get("brand") ?? "")}`,
  panel_models: (p) => `/client_api/pv_panel_models?brand=${encodeURIComponent(p.get("brand") ?? "")}`,
  installers: () => "/client_api/pv_installers",
  street_types: () => "/client_api/street_types",
  job: (p) => `/client_api/get_jobs?ftype=bstc&formid=${encodeURIComponent(p.get("id") ?? "")}`,
};

export async function GET(req: Request) {
  if (!(await currentStaff())) return Response.json({ error: "Staff only" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const make = LISTS[p.get("list") ?? ""];
  if (!make) return Response.json({ lists: Object.keys(LISTS) });
  const accept = p.get("list") === "job" ? "application/vnd.fb.jobs+json;v=1" : "application/json";
  const r = await formbayGetAccept(make(p), accept);
  return Response.json({ status: r.status, data: r.json ?? r.text });
}
