import { timingSafeEqual } from "node:crypto";
import { jsonError } from "@/lib/calendar/http";
import { HubSpotError } from "@/lib/integrations/hubspot";
import { runHubSpotSync } from "@/lib/integrations/hubspot-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false; // sans secret solide, la route reste fermée
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** GET /api/cron/hubspot — synchronisation planifiée. En-tête requis : Authorization: Bearer <CRON_SECRET>. */
export async function GET(request: Request) {
  if (!authorized(request)) return jsonError("Non autorisé.", 401);
  try {
    return Response.json(await runHubSpotSync());
  } catch (error) {
    if (error instanceof HubSpotError) return jsonError(error.message, 400);
    console.error("[cron hubspot]", error);
    return jsonError("Erreur serveur pendant la synchronisation.", 500);
  }
}
