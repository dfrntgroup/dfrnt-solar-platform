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
  M17: (v, l) => ({ subject: "Your new install day", body: `Hi ${v.name ?? "there"}, your install is now booked for ${v.date}. Everything about your system lives here: ${l}` }),
  M18: (v, l) => ({ subject: "We need to move your install day", body: `Hi ${v.name ?? "there"}, sorry: ${v.why}, so ${v.date} no longer works. Pick a new day from your installer's free days here, all inside your rebate deadline: ${l}` }),
  M19: (v, l) => ({ subject: "An earlier install day just opened", body: `Hi ${v.name ?? "there"}, ${v.date} has just become free with your installer. Want it? First to tap gets it, and your current day stays if you don't: ${l}?offer=${v.offer}` }),
  M20: (v, l) => ({ subject: "Pick your install day", body: `Hi ${v.name ?? "there"}, your installer has offered days for your install. Pick the one that suits you: ${l}` }),
  M21: (v, l) => ({ subject: `New message from ${v.from}`, body: `Hi ${v.name ?? "there"}, ${v.from} wrote:\n\n${v.preview}\n\nReply on your system record: ${l}` }),
  I1: (v) => ({ subject: `${v.rebook ? "Rebooked" : "New install booked"}: ${v.date}`, body: `Hi ${v.name ?? "there"}, a DFRNT Solar install is booked for ${v.date} at ${v.place} (${v.days} crew-day${Number(v.days) === 1 ? "" : "s"}). It's in your DFRNT Solar calendar if you've connected Google.\n\nCan't do this day? Tap "Can't do this day" on the job within 24 hours: ${siteUrl()}/installer/job/${v.jobId}` }),
  I2: (v) => ({ subject: "Paid job: please offer install days", body: `Hi ${v.name ?? "there"}, a customer at ${v.place} has paid. Please offer up to three days that suit you${v.until ? `, on or before ${v.until} (their rebate deadline)` : ""}: ${siteUrl()}/installer/job/${v.jobId}\n\nConnect your Google Calendar and customers will book your free days themselves: ${siteUrl()}/installer/calendar` }),
  I3: (v) => ({ subject: `Message from ${v.from}`, body: `Hi ${v.name ?? "there"}, ${v.from} wrote:\n\n${v.preview}\n\nReply on the job: ${siteUrl()}/installer/job/${v.jobId}` }),
  I4: (v) => ({ subject: `Tomorrow: ${v.title}`, body: `${v.sheet}` }),
  // P2 (4 Nov 2026): a job is waiting for the installer's price. Same-day promise to the customer; 5 pm hand-off if untouched.
  I5: (v) => ({ subject: `${v.why === "retake" ? "New photo in" : v.why === "reassigned" ? "Job passed to you" : "New job to price"}: ${v.title} · ${v.place}`,
    body: `Hi ${v.name ?? "there"}, ${v.why === "retake" ? "the customer has sent the photo you asked for again" : v.why === "reassigned" ? "a job another installer didn't price has been passed to you" : "a customer has secured a price and sent their photos"}: ${v.title} at ${v.place}.\n\nPlease check the photos and confirm the price by 5 pm today. If it's not priced by then it moves on to the next installer. Price it here: ${siteUrl()}/installer/job/${v.jobId}` }),
  I6: (v) => ({ subject: `Reminder: price by 5 pm · ${v.title} · ${v.place}`, body: `Hi ${v.name ?? "there"}, ${v.title} at ${v.place} is still waiting for your price. It moves to the next installer at 5 pm. Two minutes: ${siteUrl()}/installer/job/${v.jobId}` }),
  M16: (v, l) => ({ subject: "One photo again, please", body: `Hi ${v.name ?? "there"}, your installer couldn't make out one of your photos: ${v.what}.${v.reason ? ` They said: "${v.reason}".` : ""} Take it again and upload it here (that one photo only): ${l}?step=3#checkout\n\nYour price stays held while you do.` }),
  M22: (v, l) => ({ subject: "Your home's solar and battery record", body: `Hi ${v.name ?? "there"}, the previous owner of your home has passed you the record for its solar and battery system: what's installed, serial numbers, warranties, documents and how to get help. Keep this link: ${l}` }),
  M23: (v, l) => ({ subject: "Your warranties are registered", body: `Hi ${v.name ?? "there"}, we've registered the manufacturer warranties for your system. The warranty cards are on your record with everything else: ${l}` }),
  M24: (v) => ({ subject: "Thank you. One small favour?", body: `Hi ${v.name ?? "there"}, thanks for your review. If you have a minute, posting the same words on Google helps other local families find us: ${v.url}\n\nNo worries if not. Thanks for choosing us.` }),
  M25: (v, l) => ({ subject: "Your yearly service plan", body: `Hi ${v.name ?? "there"}, ${v.renewal ? `your service plan renews on ${v.date}` : "thanks for joining the service plan"}. ${v.amount ? `It's ${v.amount} by bank transfer with reference ${v.reference}. ` : ""}Details are on your record: ${l}` }),
  M8: (v, l) => ({ subject: "Please approve a change to your install", body: `Hi ${v.name ?? "there"}, your installer has found work outside the agreed scope (${aud(v.amount)} inc GST). Approve or decline here: ${l}` }),
};

export async function queueMessage(template: string, token: string, to: string | null | undefined, vars: Vars) {
  if (!to) return;
  const t = TEMPLATES[template];
  if (!t) return;
  const { subject, body } = t(vars, `${siteUrl()}/quote/${token}`);
  const [row] = await db()`insert into messages (quote_id, template, channel, recipient, subject, body)
    select id, ${template}, 'email', ${to}, ${subject}, ${body} from quotes where token = ${token} returning id`;
  if (row) await deliver(row.id as string).catch(async (e) => { const { report } = await import("./report"); await report("email.queue", e, { message_id: row.id, template }); return "failed"; });
}

/** Ops: render every template with sample values and send them to one address (ignores the mode). */
export async function sendAllTemplatesTo(to: string, token: string) {
  const sample: Vars = { why: "rain is forecast", offer: "00000000-0000-0000-0000-000000000000", from: "Faultless Solar", preview: "Gate code is 1234, dog is friendly.", place: "12 Smith St, Buderim 4556", jobId: "test", days: 1, rebook: false, title: "Test job", sheet: "Job sheet preview", name: "Karl", amount: 12345.76, reference: "DS4A020F", date: "Tue, 3 Nov", drop: "Thu, 31 Dec", until: "Sun, 15 Nov", left: "two short steps", phone: "1300 133 768", was: 11990, second: false };
  const results: string[] = [];
  for (const [key, t] of Object.entries(TEMPLATES)) {
    const { subject, body } = t(sample, `${siteUrl()}/quote/${token}`);
    const r = await sendEmail(to, `[TEST ${key}] ${subject}`, body);
    results.push(`${key}: ${r.ok ? "sent" : r.error}`);
  }
  return results;
}
