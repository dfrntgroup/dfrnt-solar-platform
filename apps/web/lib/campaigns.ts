// G5 campaigns and G4 waitlist alerts. Only people who gave us their email for a price (or asked to hear when we cover
// their area); every email has an unsubscribe link; sends go through the outbox, so test mode applies.
import { moveRow } from "./lifecycle";
import { createHmac } from "node:crypto";
import { db } from "@dfrnt/db";
import { quote, rebateWindow } from "@dfrnt/engine";
import { todayAEST } from "./api";
import { deliver } from "./email";
import { siteUrl } from "./messages";
import { pricingData } from "./pricing-data";
import { aud, longDate } from "./site";

const key = () => process.env.TOKEN_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.POSTGRES_URL || "dev";
export const unsubSig = (email: string) => createHmac("sha256", key()).update(`unsub:${email.toLowerCase()}`).digest("hex").slice(0, 24);
export const unsubLink = (email: string) => `${siteUrl()}/unsubscribe?e=${encodeURIComponent(email)}&s=${unsubSig(email)}`;

export const AUDIENCES: Record<string, string> = {
  saved: "Saved a price (last 90 days), not bought",
  unfinished: "Secured a price but didn't finish checkout (incl. lapsed)",
  waitlist: "Waitlist (asked to hear when we cover their area)",
};

export const REBATE_TEMPLATE = {
  subject: "Your battery rebate steps down after {until}",
  body: "Hi {name},\n\nThe {system} you looked at is {price} installed after rebates today. The battery rebate steps down after {until}, so a price secured now keeps today's rebate, with install days on or before then.\n\nSee your price and secure it: {link}\n\nQuestions? Just reply.",
};

export interface Recipient { email: string; name: string; quoteId: string | null; ticketId: string | null; system: string; price: string; link: string }

export async function recipients(audience: string, limit = 2000): Promise<Recipient[]> {
  const out: Recipient[] = [];
  const data = await pricingData();
  const today = todayAEST();
  const lock = rebateWindow(today, data.rebates).lock_until;
  if (audience === "waitlist") {
    const rows = await db()`select distinct on (lower(email)) id, email, name, postcode from tickets t where kind = 'waitlist' and email is not null
      and not exists (select 1 from marketing_optout o where o.email = lower(t.email)) order by lower(email), created_at desc limit ${limit}`;
    for (const r of rows) out.push({ email: (r.email as string).toLowerCase(), name: String(r.name ?? "").split(" ")[0] || "there", quoteId: null, ticketId: r.id as string,
      system: "solar and battery system", price: "", link: `${siteUrl()}/systems${r.postcode ? `?postcode=${r.postcode}` : ""}` });
    return out;
  }
  const statuses = audience === "saved" ? ["saved"] : ["secured", "lapsed"];
  const rows = await db()`select distinct on (lower(q.customer_email)) q.id, q.token, q.customer_email, q.customer_name, q.title, q.input, q.amount_payable::float8 amount from quotes q
    where q.status = any(${statuses}) and q.customer_email is not null and q.created_at > now() - interval '90 days'
      and not exists (select 1 from marketing_optout o where o.email = lower(q.customer_email))
      and not exists (select 1 from quotes p where lower(p.customer_email) = lower(q.customer_email) and p.paid_at is not null)
    order by lower(q.customer_email), q.created_at desc limit ${limit}`;
  for (const r of rows) {
    let price = r.amount as number;
    try { price = quote({ ...(r.input as object), installDate: lock } as never, { ...data, asOf: today }).stack.amount_payable; } catch { /* keep saved price */ }
    out.push({ email: (r.customer_email as string).toLowerCase(), name: String(r.customer_name ?? "").split(" ")[0] || "there", quoteId: r.id as string, ticketId: null,
      system: String(r.title ?? "system").split(" · ").slice(1).join(" · ") || String(r.title ?? "system"), price: aud(price), link: `${siteUrl()}/quote/${r.token}` });
  }
  return out;
}

export async function rebateDate() {
  const w = rebateWindow(todayAEST(), (await pricingData()).rebates);
  return w.window_end ? longDate(w.window_end) : "the next change";
}

export function render(t: string, r: Recipient, until: string, link: string) {
  return t.replaceAll("{name}", r.name).replaceAll("{system}", r.system).replaceAll("{price}", r.price || "shown on our site").replaceAll("{until}", until).replaceAll("{link}", link);
}

/** Send to everyone in the audience not yet sent this campaign (in batches). test=true sends one example to `testTo` only. */
export async function sendCampaign(id: string, opts: { test?: boolean; testTo?: string; batch?: number } = {}) {
  const [c] = await db()`select id, audience, subject, body, status from campaigns where id = ${id}`;
  if (!c) throw new Error("Campaign not found");
  if (!opts.test && c.status === "sent") throw new Error("This campaign has been sent. Copy it to send again.");
  const until = await rebateDate();
  const list = await recipients(c.audience as string);
  if (opts.test) {
    const r = list[0] ?? { email: opts.testTo!, name: "Karl", quoteId: null, ticketId: null, system: "SolaX 10 kW solar + 15.3 kWh battery", price: "$12,346", link: `${siteUrl()}/systems` };
    const { sendEmail } = await import("./email");
    const res = await sendEmail(opts.testTo!, `[TEST] ${render(c.subject as string, r, until, r.link)}`, `${render(c.body as string, r, until, r.link)}\n\nUnsubscribe: ${unsubLink(r.email)}`);
    if (!res.ok) throw new Error(res.error);
    return { sent: 1, left: list.length };
  }
  const done = new Set((await db()`select email from campaign_sends where campaign_id = ${id}`).map((x) => x.email as string));
  const todo = list.filter((r) => !done.has(r.email)).slice(0, opts.batch ?? 200);
  for (const r of todo) {
    const [s] = await db()`insert into campaign_sends (campaign_id, quote_id, ticket_id, email) values (${id}, ${r.quoteId}, ${r.ticketId}, ${r.email}) on conflict do nothing returning id`;
    if (!s) continue;
    const link = `${r.link}${r.link.includes("?") ? "&" : "?"}c=${s.id}`;
    const [m] = await db()`insert into messages (quote_id, template, channel, recipient, subject, body) values (${r.quoteId}, 'CAMPAIGN', 'email', ${r.email},
      ${render(c.subject as string, r, until, link)}, ${`${render(c.body as string, r, until, link)}\n\nDon't want these? Unsubscribe: ${unsubLink(r.email)}`}) returning id`;
    await deliver(m!.id as string).catch(() => "failed");
  }
  const left = list.filter((r) => !done.has(r.email)).length - todo.length;
  const to = left > 0 ? "sending" : "sent";
  if (c.status !== to) await moveRow("campaigns", id, to, { type: "system", id: "campaigns" }, { set: { sent_at: new Date() }, idempotent: true });
  return { sent: todo.length, left };
}

export async function campaignResults(id: string) {
  const [r] = await db()`select count(*)::int sent, count(clicked_at)::int clicked,
      count(*) filter (where q.status not in ('saved','lapsed','expired') and q.updated_at > s.sent_at)::int secured,
      count(*) filter (where q.paid_at > s.sent_at)::int paid
    from campaign_sends s left join quotes q on q.id = s.quote_id where s.campaign_id = ${id}`;
  return r as { sent: number; clicked: number; secured: number; paid: number };
}

/** G4: when an installer covers a waitlisted postcode, tell those people once, with prices and the next free days. */
export async function notifyWaitlist() {
  const rows = await db()`select id, email, name, postcode from tickets t where kind = 'waitlist' and notified_at is null and email is not null and postcode ~ '^\\d{4}$'
    and not exists (select 1 from marketing_optout o where o.email = lower(t.email))`;
  const { nextDaysFor } = await import("./schedule");
  let sent = 0;
  for (const r of rows) {
    const days = await nextDaysFor(r.postcode as string, undefined, 3).catch(() => null);
    if (!days) continue;                                            // still nobody covers it
    const email = (r.email as string).toLowerCase();
    const body = `Hi ${String(r.name ?? "").split(" ")[0] || "there"},\n\nGood news: we now install at ${r.postcode}.${days.length ? ` The next free install days are ${days.map((d) => longDate(d)).join(", ")}.` : ""}\n\nSee every system priced for your home, installed, with the rebate already off: ${siteUrl()}/systems?postcode=${r.postcode}\n\nDon't want these? Unsubscribe: ${unsubLink(email)}`;
    const [m] = await db()`insert into messages (template, channel, recipient, subject, body) values ('WAITLIST', 'email', ${email}, ${`We now install at ${r.postcode}`}, ${body}) returning id`;
    await deliver(m!.id as string).catch(() => "failed");
    // Told once, then closed: a waitlist ticket used to sit open in Ops → Support for ever.
    await moveRow("tickets", r.id as string, "closed", { type: "system", id: "waitlist" }, { action: "tickets.waitlist_notified", set: { notified_at: new Date(), updated_at: new Date() }, idempotent: true });
    sent++;
  }
  return sent;
}
