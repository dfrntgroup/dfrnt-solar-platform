import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase, devAuth } from "@/lib/auth";

export async function GET(req: Request) {
  if (devAuth()) (await cookies()).delete("dev_email");
  else if (process.env.NEXT_PUBLIC_SUPABASE_URL) await (await supabase()).auth.signOut();
  return NextResponse.redirect(new URL("/", req.url));
}
