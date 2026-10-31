// Messages M1–M14 are written to the outbox. They stay "held" until email/SMS are switched on at go-live;
// ops can read every one in the admin, so nothing is lost and the wording can be reviewed first.
import { db } from "@dfrnt/db";

const site = () => process.env.SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
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
  M8: (v, l) => ({ subject: "Please approve a change to your install", body: `Hi ${v.name ?? "there"}, your installer has found work outside the agreed scope (${aud(v.amount)} inc GST). Approve or decline here: ${l}` }),
};

export async function queueMessage(template: string, token: string, to: string | null | undefined, vars: Vars) {
  if (!to) return;
  const t = TEMPLATES[template];
  if (!t) return;
  const { subject, body } = t(vars, `${site()}/quote/${token}`);
  await db()`insert into messages (quote_id, template, channel, recipient, subject, body)
    select id, ${template}, 'email', ${to}, ${subject}, ${body} from quotes where token = ${token}`;
}
