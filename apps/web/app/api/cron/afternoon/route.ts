import { runAfternoon } from "@/lib/timers";
import { cronAuthorised } from "@/lib/cron-auth";
export const dynamic = "force-dynamic";
/** 3 pm AEST: remind installers of jobs still waiting for a price (I6). */
export async function GET(req: Request) {
  if (!cronAuthorised(req)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runAfternoon());
}
