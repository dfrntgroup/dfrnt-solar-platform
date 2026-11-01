import { db } from "@dfrnt/db";
import { emailReady, emailSettings } from "@/lib/email";

export const dynamic = "force-dynamic";

/** Email status check: is sending connected, what mode, and how the latest messages went. No addresses or content. */
export async function GET() {
  const { mode } = await emailSettings();
  let recent: unknown[] = [];
  try { recent = [...(await db()`select template, status, error, created_at from messages order by created_at desc limit 5`)]; } catch { /* first run */ }
  return Response.json({ connected: emailReady(), mode, recent });
}
