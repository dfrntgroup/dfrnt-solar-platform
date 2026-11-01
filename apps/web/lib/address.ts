// Address autocomplete from G-NAF through Addressr (hosted on RapidAPI). Server-side only, so the key never reaches the browser.
// Without ADDRESSR_KEY the checkout falls back to typing the address in full.
const HOST = "addressr.p.rapidapi.com";
export const addressReady = () => !!process.env.ADDRESSR_KEY;

async function call(path: string) {
  const r = await fetch(`https://${HOST}${path}`, {
    headers: { "x-rapidapi-key": process.env.ADDRESSR_KEY!, "x-rapidapi-host": HOST },
    signal: AbortSignal.timeout(4000), cache: "no-store",
  });
  if (!r.ok) throw new Error(`Addressr ${r.status}`);
  return r.json();
}

export interface AddressHit { pid: string; label: string }
export async function searchAddress(q: string): Promise<AddressHit[]> {
  const j = (await call(`/addresses?q=${encodeURIComponent(q)}`)) as { sla?: string; pid?: string }[];
  return (Array.isArray(j) ? j : []).filter((h) => h.pid && h.sla).slice(0, 8).map((h) => ({ pid: h.pid!, label: h.sla! }));
}

const title = (s?: string) => (s ?? "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export interface AddressParts { pid: string; label: string; unit: string; line1: string; suburb: string; state: string; postcode: string }
type Structured = {
  flat?: { type?: { name?: string }; number?: number | string; prefix?: string; suffix?: string };
  level?: { type?: { name?: string }; number?: number | string };
  number?: { number?: number | string; prefix?: string; suffix?: string; last?: { number?: number | string; suffix?: string } };
  street?: { name?: string; type?: { name?: string }; suffix?: { name?: string } };
  locality?: { name?: string }; state?: { abbreviation?: string }; postcode?: string;
};

/** Full G-NAF record → the fields the checkout and Formbay need (unit kept separate: CER rejects a missing unit). */
export async function addressDetail(pid: string): Promise<AddressParts> {
  if (!/^[A-Z0-9_]{6,30}$/.test(pid)) throw new Error("Bad address id");
  const j = (await call(`/addresses/${pid}`)) as { sla?: string; structured?: Structured };
  return partsFrom(pid, j.sla ?? "", j.structured ?? {});
}

export function partsFrom(pid: string, label: string, s: Structured): AddressParts {
  const n = s.number;
  const num = n ? `${n.prefix ?? ""}${n.number ?? ""}${n.suffix ?? ""}${n.last?.number ? `-${n.last.number}${n.last.suffix ?? ""}` : ""}` : "";
  const street = [title(s.street?.name), title(s.street?.type?.name), title(s.street?.suffix?.name)].filter(Boolean).join(" ");
  const flat = s.flat?.number != null ? `${s.flat.prefix ?? ""}${s.flat.number}${s.flat.suffix ?? ""}` : "";
  const unit = flat ? `${title(s.flat?.type?.name) || "Unit"} ${flat}` : "";
  return { pid, label, unit, line1: [num, street].filter(Boolean).join(" "), suburb: title(s.locality?.name), state: s.state?.abbreviation ?? "QLD", postcode: s.postcode ?? "" };
}
