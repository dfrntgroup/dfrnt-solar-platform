"use server";
import { redirect } from "next/navigation";
import { db } from "@dfrnt/db";
import { openTicket } from "@/lib/ops";
import { allow } from "@/lib/ratelimit";

export async function contactUs(f: FormData) {
  const v = (k: string) => String(f.get(k) ?? "").trim().slice(0, 4000);
  if (v("website") || !(await allow("contact", 5))) redirect("/contact?sent=1");                         // honeypot
  if (!v("name") || !/^\S+@\S+\.\S+$/.test(v("email")) || !v("body")) redirect("/contact");
  let quoteId: string | undefined;
  if (/^[0-9a-f]{36}$/.test(v("quote"))) { const [q] = await db()`select id from quotes where token = ${v("quote")}`; quoteId = q?.id as string | undefined; }
  const kinds = ["question", "callback", "fault", "complaint"];
  await openTicket({ kind: kinds.includes(v("kind")) ? v("kind") : "question", name: v("name"), email: v("email"), phone: v("phone"), subject: `${v("kind") === "callback" ? "Call back: " : ""}${v("body").slice(0, 60)}`, body: v("body"), quoteId });
  redirect("/contact?sent=1");
}
