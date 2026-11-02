// Email delivery through Resend. Sending is controlled from Ops → Messages:
//   held: nothing leaves (default)   test: everything goes to the test address only   live: customers receive their messages
import { db } from "@dfrnt/db";
import { SELLER } from "./legal";

export const EMAIL_FROM = process.env.EMAIL_FROM ?? "DFRNT Solar <hello@dfrntsolar.com.au>";
export const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO ?? "hello@dfrntsolar.com.au";

export type EmailMode = "held" | "test" | "live";
export async function emailSettings(): Promise<{ mode: EmailMode; test_to: string }> {
  try {
    const [r] = await db()`select value from settings where key = 'email'`;
    const v = (r?.value ?? {}) as { mode?: EmailMode; test_to?: string };
    return { mode: v.mode ?? "held", test_to: v.test_to ?? "" };
  } catch { return { mode: "held", test_to: "" }; }
}
export const emailReady = () => !!process.env.RESEND_API_KEY;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkLabel = (u: string) => u.endsWith("/doc/invoice") ? "Your tax invoice" : u.includes("/quote/") ? "Open your system record" : u;

/** Plain, branded HTML from the plain-text body: paragraphs, with links given readable labels. */
export function htmlEmail(subject: string, body: string) {
  const paras = body.split(/\n{2,}/).map((p) => {
    const t = esc(p).replace(/(https?:\/\/[^\s]+)/g, (u) => `<a href="${u}" style="color:#007a75;font-weight:700">${linkLabel(u)}</a>`);
    return `<p style="margin:0 0 14px;line-height:1.55">${t.replace(/\n/g, "<br>")}</p>`;
  }).join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#172426">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font-size:24px;font-weight:800;letter-spacing:-.5px">DF<span style="color:#007a75;display:inline-block;transform:scaleX(-1)">R</span>NT <span style="font-size:11px;letter-spacing:3px;color:#007a75">SOLAR</span></div>
<div style="background:#fff;border:1px solid #dce6e3;border-radius:7px;padding:22px;margin-top:14px">
<h1 style="font-size:20px;margin:0 0 14px">${esc(subject)}</h1>${paras}</div>
<p style="font-size:12px;color:#526669;margin-top:16px">${SELLER.name} · ABN ${SELLER.abn} · ${SELLER.phone} · Reply to this email to reach a real person.</p>
</div></body></html>`;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!emailReady()) return { ok: false, error: "RESEND_API_KEY not set" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], reply_to: EMAIL_REPLY_TO, subject, text, html: htmlEmail(subject, text) }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    return r.ok && j.id ? { ok: true, id: j.id } : { ok: false, error: `${r.status} ${j.name ?? ""} ${j.message ?? ""}`.trim() };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Deliver one outbox row according to the current mode. Held rows stay held. */
export async function deliver(id: string) {
  const { mode, test_to } = await emailSettings();
  if (mode === "held" || !emailReady()) return "held";
  const [m] = await db()`select recipient, subject, body, status from messages where id = ${id}`;
  if (!m || m.status === "sent") return "skip";
  const to = mode === "test" ? test_to : (m.recipient as string);
  if (!to) return "held";
  const subject = mode === "test" ? `[TEST to ${m.recipient}] ${m.subject}` : (m.subject as string);
  const r = await sendEmail(to, subject, m.body as string);
  if (r.ok) await db()`update messages set status = 'sent', sent_at = now(), sent_to = ${to}, provider_id = ${r.id}, error = null, attempts = attempts + 1, last_attempt_at = now() where id = ${id}`;
  else {
    await db()`update messages set status = 'failed', error = ${r.error}, sent_to = ${to}, attempts = attempts + 1, last_attempt_at = now() where id = ${id}`;
    const { report } = await import("./report"); await report("email.deliver", new Error(r.error), { message_id: id, to });
  }
  return r.ok ? "sent" : "failed";
}

/** Retry failed messages (up to 5 attempts, at least an hour apart). Run from the timers. */
export async function retryFailedMessages() {
  const rows = await db()`select id from messages where status = 'failed' and attempts < 5 and (last_attempt_at is null or last_attempt_at < now() - interval '1 hour') order by created_at limit 50`;
  let sent = 0, failed = 0;
  for (const r of rows) { const out = await deliver(r.id as string).catch(() => "failed"); if (out === "sent") sent++; else if (out === "failed") failed++; }
  return { sent, failed, pending: rows.length - sent - failed };
}
