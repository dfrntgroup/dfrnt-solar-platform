"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, write } from "@dfrnt/db";
import { priceSystem } from "@dfrnt/engine";
import { requireStaff } from "@/lib/auth";
import { todayAEST } from "@/lib/api";
import { clearPricingCache, KINDS, pricingData, type Kind } from "@/lib/pricing-data";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Saves a new version of one kind after checking every catalogue system still prices. Owner only; new quotes only. */
async function saveVersion(kind: Kind, data: Record<string, unknown>, note: string) {
  const me = await requireStaff();
  if (!me.roles.includes("owner")) throw new Error("Only the owner changes pricing");
  if (!note) throw new Error("Add a note saying what changed and why");
  const live = await pricingData();
  const next = { ...live, [kind]: data };
  const broken = next.catalogue.systems.map((sys) => ({ sys, q: priceSystem(sys, { postcode: "4551", asOf: todayAEST() }, next) }))
    .filter(({ q }) => q.config.blockers.some((b) => b.step !== "cec") || !(q.stack.amount_payable > 0));
  if (broken.length) throw new Error(`Not saved: ${broken.map((b) => b.sys.slug).join(", ")} would stop pricing`);
  await write({ actor: me.actor, action: `pricing.${kind}.publish`, rationale: note }, { kind }, async (tx) => {
    const [row] = await tx`insert into config_versions (kind, data, note, created_by) values (${kind}, ${tx.json(data as never)}, ${note}, ${me.name}) returning id`;
    return { entity: "config", entityId: String(row!.id), event: "pricing.published", result: { kind, id: row!.id } };
  });
  clearPricingCache();
}

async function run(fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e; redirect(`/ops/pricing?error=${encodeURIComponent((e as Error).message)}`); }
  revalidatePath("/", "layout"); redirect("/ops/pricing?saved=1");
}

export async function saveMargins(f: FormData) {
  await run(async () => {
    const pct = (k: string) => { const v = Number(s(f, k)) / 100; if (!(v >= 0 && v < 0.6)) throw new Error(`${k} must be between 0 and 60%`); return v; };
    await saveVersion("margins", { hardware: pct("hardware"), bos: pct("bos"), installation: pct("installation") }, s(f, "note"));
  });
}
export async function saveCosts(f: FormData) {
  await run(async () => {
    const live = (await pricingData()).costs;
    const items = Object.fromEntries(Object.entries(live.items).map(([sku, it]) => {
      const raw = s(f, `cost_${sku}`);
      return [sku, { ...it, cost_ex_gst: raw === "" ? null : Number(raw), source: s(f, `src_${sku}`) || it.source }];
    }));
    const add = s(f, "new_sku").toUpperCase();
    if (add) items[add] = { cost_ex_gst: Number(s(f, "new_cost")) || null, margin_class: s(f, "new_class") === "bos" ? "bos" : "hardware", source: "manual" } as never;
    await saveVersion("costs", { ...live, items }, s(f, "note"));
  });
}
export async function saveMenu(f: FormData) {
  await run(async () => {
    const live = (await pricingData()).menu;
    const items = live.items.map((i) => ({ ...i, menu_rate: Number(s(f, `rate_${i.code}`) || i.menu_rate) }));
    await saveVersion("menu", { ...live, items }, s(f, "note"));
  });
}
export async function saveRebates(f: FormData) {
  await run(async () => {
    const live = (await pricingData()).rebates;
    const parse = (k: string) => { try { return JSON.parse(s(f, k)); } catch { throw new Error(`${k}: not valid JSON`); } };
    await saveVersion("rebates", { ...live, stc_rate: Number(s(f, "stc_rate")), lock_days: Number(s(f, "lock_days")), solar_deeming: parse("solar_deeming"), battery_factor: parse("battery_factor") }, s(f, "note"));
  });
}
export async function saveCatalogue(f: FormData) {
  await run(async () => {
    let doc: Record<string, unknown>;
    try { doc = JSON.parse(s(f, "catalogue")); } catch { throw new Error("Catalogue: not valid JSON"); }
    if (!Array.isArray((doc as { systems?: unknown }).systems)) throw new Error("Catalogue needs a systems list");
    await saveVersion("catalogue", doc, s(f, "note"));
  });
}
export async function restoreVersion(f: FormData) {
  await run(async () => {
    const [row] = await db()`select kind, data from config_versions where id = ${Number(s(f, "id"))}`;
    if (!row || !KINDS.includes(row.kind as Kind)) throw new Error("Version not found");
    await saveVersion(row.kind as Kind, row.data as Record<string, unknown>, `Restored version ${s(f, "id")}`);
  });
}
