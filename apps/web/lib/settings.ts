// Small ops-controlled settings (stored in the settings table, edited in Ops → Settings).
import { db } from "@dfrnt/db";

export interface DesignCheck { fee_on: boolean; amount: number }
export interface Trust { founder_line: string; founder_video: string; licence: string; insurance: string; accreditations: string; callback_to: string }

const DEFAULTS = {
  design_check: { fee_on: false, amount: 99 } as DesignCheck,
  trust: { founder_line: "Built by the team that grew InStyle Solar to 29,000+ installs.", founder_video: "", licence: "", insurance: "", accreditations: "", callback_to: "hello@dfrntsolar.com.au" } as Trust,
};
type Key = keyof typeof DEFAULTS;

export async function getSetting<K extends Key>(key: K): Promise<(typeof DEFAULTS)[K]> {
  try {
    const [r] = await db()`select value from settings where key = ${key}`;
    return { ...DEFAULTS[key], ...((r?.value ?? {}) as object) } as (typeof DEFAULTS)[K];
  } catch { return DEFAULTS[key]; }
}

export async function setSetting<K extends Key>(key: K, value: (typeof DEFAULTS)[K], by: string) {
  await db()`insert into settings (key, value, updated_by) values (${key}, ${db().json(value as never)}, ${by})
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
}
