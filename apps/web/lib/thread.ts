// Scheduling S5: job messages between customer, installer and us, with an email to the other side (through the outbox,
// so test mode applies). Phone numbers aren't shown to the installer until the job is booked.
import { db } from "@dfrnt/db";
import { getQuote } from "./jobs";
import { queueMessage } from "./messages";

export async function postMessage(token: string, author: "customer" | "installer" | "ops", authorName: string | null, body: string) {
  const text = body.trim().slice(0, 2000);
  if (text.length < 2) throw new Error("Write a message first");
  const q = await getQuote(token);
  if (!q) throw new Error("Job not found");
  await db()`insert into job_messages (quote_id, author, author_name, body) values (${q.id}, ${author}, ${authorName}, ${text})`;
  const [inst] = q.installer_id ? await db()`select business_name, email from installers where id = ${q.installer_id}` : [];
  const preview = text.length > 300 ? `${text.slice(0, 300)}…` : text;
  if (author !== "customer") await queueMessage("M21", q.token, q.customer_email, { name: q.customer_name, from: author === "installer" ? (inst?.business_name as string) ?? "Your installer" : "DFRNT Solar", preview });
  if (author !== "installer" && inst?.email) await queueMessage("I3", q.token, inst.email as string, { name: inst.business_name as string, from: author === "customer" ? q.customer_name ?? "The customer" : "DFRNT Solar", preview, jobId: q.id });
}
