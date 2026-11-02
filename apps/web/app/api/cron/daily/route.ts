import { runDaily } from "@/lib/timers";
import { cronAuthorised } from "@/lib/cron-auth";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!cronAuthorised(req)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runDaily());
}
