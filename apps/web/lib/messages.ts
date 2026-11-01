// Messages M1–M14 are written to the outbox. They stay "held" until email/SMS are switched on at go-live;
// ops can read every one in the admin, so nothing is lost and the wording can be reviewed first.
import { db } from "@dfrnt/db";
import { deliver, sendEmail } from "./email";

export const siteUrl = () => process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const aud = (n: unknown) => Number(n).toLocaleString("en-AU", { style: "currency", currency: "AUD" });

type Vars = Record<string, unknown> & { name?: string | null };

const TEMPLATES: Record<string, (v: Vars, link: string) => { subject: string; body: string }> = {
  M1: (v, l) => ({ subject: "We've got your photos", body: `Hi ${v.name ?? "there"}, thanks. Your installer is checking your home and will confirm your price, usually today. Your record: ${l}` }),
  M2: (v, l) => ({ subject: "Your price is confirmed", body: `Hi ${v.name ?? "there"}, your installed price is confirmed at ${aud(v.amount)} after rebates. Sign and pay here: ${l}` }),
  M3: (v, l) => ({ subject: "Payment received — pick your install date", body: `Hi ${v.name ?? "there"}, we've received your payment. Choose your install date here: ${l}\n\nYour tax invoice: ${l}/doc/invoice` }),
  M4: (v, l) => ({ subject: "Your install is booked", body: `Hi ${v.name ?? "there"}, your install is booked for ${v.date}. Everything about your system lives here: ${l}` }),
  M5: (v, l) => ({ subject: "We're installing tomorrow", body: `Hi ${v.name ?? "there"}, your installer arrives tomorrow between 7 and 8 am. ${l}` }),
  M6: (v, l) => ({ subject: "Your system is installed", body: `Hi ${v.name ?? "there"}, your system is installed and switched on. Your documents and warranty are on your record: ${l}` }),
  M7: (v, l) => ({ subject: "Your order is cancelled", body: `Hi ${v.name ?? "there"}, your order is cancelled. We'll process any refund due to your original payment method. ${l}` }),
  M9: (v, l) => ({ subject: "Your saved solar price", body: `Here's the system you saved: ${aud(v.amount)} installed after rebates. Prices can change, so secure it when you're ready: ${l}` }),
  M10: (v, l) => ({ subject: "How did we go?", body: `Hi ${v.name ?? "there"}, your system has been running for a few days. Tell us how the install went, good or bad. It takes a minute: ${l}` }),
  M11: (v, l) => ({ subject: "Your saved price, still here", body: `Hi ${v.name ?? "there"}, the system you saved is ${aud(v.amount)} installed after rebates today.${v.drop ? ` The battery rebate steps down after ${v.drop}, so a price secured now keeps today’s rebate.` : ""} Look again or secure it: ${l}` }),
  PAY: (v, l) => ({ subject: "Reminder: your bank transfer", body: `Hi ${v.name ?? "there"}, we haven't seen your transfer of ${aud(v.amount)} yet. Use reference ${v.reference}. Details: ${l}` }),
  M12: (v, l) => ({ subject: "Your price is locked in", body: `Hi ${v.name ?? "there"}, your price of ${aud(v.amount)} installed after rebates is locked until ${v.until}. Two short steps left: your home details and four photos. Pick up where you left off: ${l}` }),
  M13: (v, l) => ({ subject: v.second ? "Your locked price is waiting" : "Finish getting your confirmed price", body: `Hi ${v.name ?? "there"}, you're ${v.left} away from your confirmed price (${aud(v.amount)} installed after rebates, locked until ${v.until}). It takes about two minutes, and you can do the photos on your phone: ${l}\n\nRather talk it through? Reply to this email or call ${v.phone} and a real person will help.` }),
  M14: (v, l) => ({ subject: "We've suggested a change to your system", body: `Hi ${v.name ?? "there"}, after looking at your home we suggest a change to your system. The new price is ${aud(v.amount)} installed after rebates (was ${aud(v.was)}). See the change and accept it, or keep your original: ${l}` }),
  M15: (v, l) => ({ subject: "Your design check", body: `Hi ${v.name ?? "there"}, your home needs an installer to check your photos before we confirm the price. The design check is ${aud(v.amount)}, and it comes off your system price when you go ahead. Pay by bank transfer with reference ${v.reference}. Details: ${l}` }),
  M8: (v, l) => ({ subject: "Please approve a change to your install", body: `Hi ${v.name ?? "there"}, your installer has found work outside the agreed scope (${aud(v.amount)} inc GST). Approve or decline here: ${l}` }),
};

export async function queueMessage(template: string, token: string, to: string | null | undefined, vars: Vars) {
  if (!to) return;
  const t = TEMPLATES[template];
  if (!t) return;
  const { subject, body } = t(vars, `${siteUrl()}/quote/${token}`);
  const [row] = await db()`insert into messages (quote_id, template, channel, recipient, subject, body)
    select id, ${template}, 'email', ${to}, ${subject}, ${body} from quotes where token = ${token} returning id`;
  if (row) await deliver(row.id as string).catch(() => "failed");
}

/** Ops: render every template with sample values and send them to one address (ignores the mode). */
export async function sendAllTemplatesTo(to: string, token: string) {
  const sample: Vars = { name: "Karl", amount: 12345.76, reference: "DS4A020F", date: "Tue, 3 Nov", drop: "Thu, 31 Dec", until: "Sun, 15 Nov", left: "two short steps", phone: "1300 133 768", was: 11990, second: false };
  const results: string[] = [];
  for (const [key, t] of Object.entries(TEMPLATES)) {
    const { subject, body } = t(sample, `${siteUrl()}/quote/${token}`);
    const r = await sendEmail(to, `[TEST ${key}] ${subject}`, body);
    results.push(`${key}: ${r.ok ? "sent" : r.error}`);
  }
  return results;
}
