import { getAiConfig } from "@/lib/ai/llm";
import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/calendar/http";
import { getHubSpotStatus } from "@/lib/integrations/hubspot";

export const dynamic = "force-dynamic";

/** GET /api/assistant/status — mode de l'assistant et état des connexions (aucun secret exposé). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);

    const cfg = getAiConfig();
    const hubspot = await getHubSpotStatus();
    return Response.json({
      mode: cfg ? "llm" : "rules",
      model: cfg?.model ?? null,
      hubspot: {
        configured: hubspot.configured,
        reachable: hubspot.reachable,
        missingScopes: hubspot.missingScopes,
        error: hubspot.error,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
