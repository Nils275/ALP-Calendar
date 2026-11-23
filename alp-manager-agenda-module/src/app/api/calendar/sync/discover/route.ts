import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/calendar/http";
import { discoverHubSpot } from "@/lib/integrations/hubspot-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/calendar/sync/discover — aide au paramétrage (direction uniquement, aucune écriture) :
 * propriétaires HubSpot reconnus comme équipe, propriétés de dates retrouvées sur les transactions et les projets.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);
    if (user.role !== "direction") return jsonError("Réservé à la direction.", 403);
    if (!process.env.HUBSPOT_ACCESS_TOKEN) return jsonError("HUBSPOT_ACCESS_TOKEN est absent.", 400);
    return Response.json(await discoverHubSpot());
  } catch (error) {
    return handleRouteError(error);
  }
}
