import { NextResponse } from "next/server";
import { supabase } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/ops";
  if (code) {
    const { error } = await (await supabase()).auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  return NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/ops", url.origin));
}
