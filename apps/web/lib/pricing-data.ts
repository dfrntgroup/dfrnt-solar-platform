// Active pricing data: newest active version of each kind from the database, falling back to the files in the engine.
// A quote is always re-priced with the versions it was secured on, so an admin change never moves a locked price.
import { db } from "@dfrnt/db";
import {
  ARCHIVED_CATALOGUES, ARCHIVED_COSTS, ARCHIVED_MENUS, ARCHIVED_RULES, DEFAULT_CATALOGUE, DEFAULT_COSTS, DEFAULT_MARGINS, DEFAULT_MENU, DEFAULT_REBATE_SETTINGS, DEFAULT_RULES,
  type Catalogue, type ComponentCosts, type ConfigRules, type LabourMenu, type Margins, type PricingData, type RebateSettings,
} from "@dfrnt/engine";

export const KINDS = ["costs", "menu", "rebates", "margins", "catalogue", "rules"] as const;
export type Kind = (typeof KINDS)[number];

export const DEFAULTS: Record<Kind, { version: string } & Record<string, unknown>> = {
  costs: DEFAULT_COSTS as never, menu: DEFAULT_MENU as never, rebates: DEFAULT_REBATE_SETTINGS as never,
  margins: { version: "2026-11-01.1", ...DEFAULT_MARGINS } as never, catalogue: DEFAULT_CATALOGUE as never, rules: DEFAULT_RULES as never,
};

export interface FullData extends Required<PricingData> { versions: Record<Kind, string> }

let cache: { at: number; data: FullData } | null = null;

function assemble(docs: Partial<Record<Kind, { version: string } & Record<string, unknown>>>): FullData {
  const d = { ...DEFAULTS, ...docs };
  return {
    costs: d.costs as unknown as ComponentCosts, menu: d.menu as unknown as LabourMenu, rebates: d.rebates as unknown as RebateSettings,
    margins: d.margins as unknown as Margins, catalogue: d.catalogue as unknown as Catalogue, rules: d.rules as unknown as ConfigRules,
    versions: Object.fromEntries(KINDS.map((k) => [k, d[k].version])) as Record<Kind, string>,
  };
}

/** The live pricing data (cached 20 s per server instance). */
export async function pricingData(): Promise<FullData> {
  if (cache && Date.now() - cache.at < 20_000) return cache.data;
  let rows: { kind: Kind; id: number; data: Record<string, unknown> }[] = [];
  try {
    rows = (await db()`select distinct on (kind) kind, id, data from config_versions where active order by kind, id desc`) as never;
  } catch { /* table not there yet (first build) → file defaults */ }
  const docs = Object.fromEntries(rows.map((r) => [r.kind, { ...r.data, version: `db-${r.id}` }]));
  const data = assemble(docs);
  cache = { at: Date.now(), data };
  return data;
}

/** The data a quote was secured on (by version), so re-pricing inside the lock never moves the price. */
export async function pricingDataFor(versions: Record<string, string> | undefined): Promise<FullData> {
  const live = await pricingData();
  if (!versions) return live;
  const docs: Partial<Record<Kind, { version: string } & Record<string, unknown>>> = {};
  for (const k of KINDS) {
    const v = versions[k];
    if (!v || v === live.versions[k]) continue;
    if (v.startsWith("db-")) {
      const [row] = await db()`select data from config_versions where id = ${Number(v.slice(3))}`;
      if (row) docs[k] = { ...(row.data as Record<string, unknown>), version: v };
    } else if (DEFAULTS[k].version === v) docs[k] = DEFAULTS[k];
    else if (k === "rules" && ARCHIVED_RULES[v]) docs[k] = { ...(ARCHIVED_RULES[v] as never as Record<string, unknown>), version: v };
    else if (k === "catalogue" && ARCHIVED_CATALOGUES[v]) docs[k] = { ...(ARCHIVED_CATALOGUES[v] as never as Record<string, unknown>), version: v };
    else if (k === "costs" && ARCHIVED_COSTS[v]) docs[k] = { ...(ARCHIVED_COSTS[v] as never as Record<string, unknown>), version: v };
    else if (k === "menu" && ARCHIVED_MENUS[v]) docs[k] = { ...(ARCHIVED_MENUS[v] as never as Record<string, unknown>), version: v };
  }
  if (!Object.keys(docs).length) return live;
  const base = Object.fromEntries(KINDS.map((k) => [k, { ...(live[k] as never as Record<string, unknown>), version: live.versions[k] }]));
  return assemble({ ...base, ...docs } as never);
}

export function clearPricingCache() { cache = null; }
