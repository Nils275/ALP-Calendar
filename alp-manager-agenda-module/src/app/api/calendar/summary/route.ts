import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/calendar/http";
import { getAgendaSummary } from "@/lib/calendar/service";

export const dynamic = "force-dynamic";

/** GET /api/calendar/summary — indicateurs et listes du panneau « À VENIR ». */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);

    const summary = await getAgendaSummary(user);
    return Response.json(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
