// Small ops-controlled settings (stored in the settings table, edited in Ops → Settings).
import { db } from "@dfrnt/db";
import { DEFAULT_STANDARD_TARIFF, DEFAULT_YIELDS, type StandardTariff, type YieldCity } from "@dfrnt/engine";

export interface DesignCheck { fee_on: boolean; amount: number }
export interface BookingDesk { mode: "off" | "all" | "help" }
export interface Scheduling { gear_lead_days: number; decline_hours: number; earlier_offer_hours: number }
export interface ServicePlan { on: boolean; price: number; includes: string }
export interface XeroSettings { tenant_id?: string; tenant_name?: string; refresh_token_enc?: string; connected_at?: string; codes: { sales: string; stc: string; installer: string; bank: string; stripe?: string; stripe_fees?: string; stc_sale?: string; sales_tax?: string; stc_tax?: string; stc_sale_tax?: string; installer_tax?: string } }
/** Real-usage sizing. mode: off · preview (only with ?usage=1, for testing) · all. */
export interface EnergySettings { mode: "off" | "preview" | "all"; yields: Record<string, YieldCity>; standard: StandardTariff; raw_days: number }
/** Stripe: the webhook endpoint this app registered for itself (secret stored sealed). */
export interface StripeSettings { webhook_id?: string; webhook_url?: string; webhook_secret_enc?: string; registered_at?: string; livemode?: boolean }
/** Finance link-out (S4): each lender's application link. {ref} and {amount} are filled in. */
export interface FinanceProvider { id: string; name: string; url: string; blurb: string; on: boolean }
export interface FinanceSettings { providers: FinanceProvider[] }
/** Where bank transfers go. Entered by staff in Ops → Payments; never hard-coded. */
export interface BankSettings { account_name: string; bsb: string; account_number: string; bank: string }
export interface Trust { founder_line: string; founder_video: string; licence: string; insurance: string; accreditations: string; callback_to: string; google_review_url?: string;
  /** Launch copy (3 Nov 2026). Blank = hidden on the site. */
  founder_quote?: string; address?: string; hours?: string; callback_minutes?: string;
  /** About page team, one per line: Name | Role | One line. A line with no role is hidden. */
  team?: string }

const DEFAULTS = {
  design_check: { fee_on: false, amount: 99 } as DesignCheck,
  booking_desk: { mode: "off" } as BookingDesk,
  scheduling: { gear_lead_days: 3, decline_hours: 24, earlier_offer_hours: 12 } as Scheduling,
  service_plan: { on: false, price: 0, includes: "Yearly health check, panel clean, firmware and settings check, written report on your record." } as ServicePlan,
  xero: { codes: { sales: "", stc: "", installer: "", bank: "" } } as XeroSettings,
  energy: { mode: "preview", yields: DEFAULT_YIELDS, standard: DEFAULT_STANDARD_TARIFF, raw_days: 30 } as EnergySettings,
  stripe: {} as StripeSettings,
  bank: { account_name: "", bsb: "", account_number: "", bank: "" } as BankSettings,
  finance: { providers: [
    { id: "plenti", name: "Plenti", url: "", blurb: "Green loan for solar and batteries", on: false },
    { id: "handypay", name: "Handypay", url: "", blurb: "Payment plan", on: false },
  ] } as FinanceSettings,
  trust: { founder_line: "Built by the team that grew InStyle Solar to 29,000+ installs.", founder_video: "", licence: "", insurance: "", accreditations: "", callback_to: "hello@dfrntsolar.com.au",
    founder_quote: "I spent ten years selling solar the old way: sales visits, a price on the night, pressure to sign. DFRNT Solar is the opposite. Every price is published, every installer is checked, and you decide in your own time.",
    address: "", hours: "", callback_minutes: "",
    team: "Karl Brown | Founder | Founded InStyle Solar, which installed 29,000+ systems and ranked #3 on the AFR Fast 100.\nMel | Operations and accounts | Makes sure every job, payment and document is right.\nJeremy | Customer care | The person who answers when you call.\nJayden |  | " } as Trust,
};
type Key = keyof typeof DEFAULTS;

// Settings change rarely and are read on almost every page: cache each key for 20 s per server instance.
// A save clears this instance's copy at once; other instances catch up within 20 s.
const cache = new Map<string, { at: number; v: unknown }>();
const TTL = 20_000;
// Never cached: Xero rotates its refresh token on every use, and Stripe's webhook secret must be current.
const LIVE = new Set<string>(["xero", "stripe"]);

export async function getSetting<K extends Key>(key: K): Promise<(typeof DEFAULTS)[K]> {
  const hit = LIVE.has(key) ? undefined : cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v as (typeof DEFAULTS)[K];
  try {
    const [r] = await db()`select value from settings where key = ${key}`;
    const v = { ...DEFAULTS[key], ...((r?.value ?? {}) as object) } as (typeof DEFAULTS)[K];
    if (!LIVE.has(key)) cache.set(key, { at: Date.now(), v });
    return v;
  } catch { return DEFAULTS[key]; }
}

export async function setSetting<K extends Key>(key: K, value: (typeof DEFAULTS)[K], by: string) {
  cache.delete(key);
  await db()`insert into settings (key, value, updated_by) values (${key}, ${db().json(value as never)}, ${by})
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
}
