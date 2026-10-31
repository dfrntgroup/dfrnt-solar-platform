"use server";
import { redirect } from "next/navigation";
import { db } from "@dfrnt/db";
import { openTicket } from "@/lib/ops";
import { allow } from "@/lib/ratelimit";
import { putPhoto } from "@/lib/storage";

export async function beatQuote(f: FormData) {
  const v = (k: string) => String(f.get(k) ?? "").trim().slice(0, 2000);
  if (!(await allow("beat", 5)) || !v("name") || !/^\S+@\S+\.\S+$/.test(v("email"))) redirect("/beat-my-quote");
  const id = await openTicket({ kind: "beat_quote", name: v("name"), email: v("email"), subject: `Beat my quote${v("price") ? `: $${v("price")}` : ""}`, body: v("details") || "(see attached quote)" });
  const file = f.get("quote");
  if (file instanceof File && file.size > 0 && file.size < 15_000_000) {
    const path = `tickets/${id}/quote-${Date.now()}.${(file.type.split("/")[1] ?? "jpg").slice(0, 5)}`;
    await putPhoto(path, await file.arrayBuffer(), file.type || "application/octet-stream");
    await db()`insert into ticket_replies (ticket_id, author, body, internal) values (${id}, 'system', ${`Quote file: ${path}`}, true)`;
  }
  redirect("/beat-my-quote?sent=1");
}
